"""Partner app: public join requests, earnings reports and invoices."""
import io
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.db import IntegrityError, transaction
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate, TruncMonth
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import serializers
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from domains.audit.models import AuditLog
from domains.catalog.models import ServicePackage
from domains.locations.models import Zone
from .models import (JobAssignment, TechnicianDocument, TechnicianJoiningFee, TechnicianProfile,
                     TechnicianSkill)
from . import messaging  # noqa: F401  (registers job-assigned SMS/WhatsApp signal)
from .services import profile_for

MAX_UPLOAD = 5 * 1024 * 1024
MAX_REPORT_DAYS = 366


def _sniff(upload, allow_pdf=True):
    if not upload or upload.size < 1 or upload.size > MAX_UPLOAD:
        raise serializers.ValidationError("Upload a file smaller than 5 MB.")
    head = upload.read(8)
    upload.seek(0)
    content_type = ("application/pdf" if head.startswith(b"%PDF-") else
                    "image/jpeg" if head.startswith(b"\xff\xd8\xff") else
                    "image/png" if head.startswith(b"\x89PNG\r\n\x1a\n") else None)
    if not content_type or (content_type == "application/pdf" and not allow_pdf):
        raise serializers.ValidationError("Use a PDF, JPEG or PNG file." if allow_pdf else "Use a JPEG or PNG photo.")
    return content_type


class JoinOptionsView(APIView):
    """Skills and service areas shown on the public 'Request to join' form."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        skills = sorted({c for c in ServicePackage.objects.filter(is_active=True, service__is_active=True)
                        .values_list("skill_code", flat=True) if c})
        zones = Zone.objects.filter(is_active=True, city__is_active=True).select_related("city").order_by("city__name", "name")
        return Response({
            "skills": skills,
            "zones": [{"id": str(z.id), "name": z.name, "city": z.city.name, "postal_code": z.postal_code} for z in zones],
        })


class JoinRequestInput(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=16)
    city = serializers.CharField(max_length=80)
    experience_years = serializers.IntegerField(min_value=0, max_value=60, required=False, default=0)
    about = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    skills = serializers.ListField(child=serializers.CharField(max_length=60), min_length=1, max_length=30)
    zone_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list, max_length=50)
    consent = serializers.BooleanField()
    challenge_id = serializers.UUIDField()
    code = serializers.CharField(max_length=8)

    def validate_phone(self, value):
        raw = "".join(ch for ch in value if ch.isdigit() or ch == "+")
        if raw.isdigit() and len(raw) == 10:
            raw = f"+91{raw}"
        return serializers.RegexField(r"^\+91[6-9]\d{9}$").run_validation(raw)

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Please agree to the verification check to apply.")
        return value


class JoinOtpView(APIView):
    """Send an OTP to the applicant's phone before a join request is accepted (stops fake sign-ups)."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_request"

    def post(self, request):
        from domains.users.views import issue_otp

        phone = JoinRequestInput().validate_phone(str(request.data.get("phone", "")))
        return Response(issue_otp(phone))


def ensure_joining_fee(profile):
    fee, _ = TechnicianJoiningFee.objects.get_or_create(
        technician=profile, defaults={"amount_paise": settings.TECHNICIAN_JOINING_FEE_PAISE})
    return fee


def start_membership(fee, when=None):
    when = when or timezone.now()
    fee.paid_at = when
    fee.valid_until = when + timedelta(days=settings.TECHNICIAN_MEMBERSHIP_DAYS)


def leads_this_term(profile, fee=None):
    """Leads (assigned jobs, not cancelled) received since the current membership started."""
    fee = fee if fee is not None else TechnicianJoiningFee.objects.filter(technician=profile).first()
    if not fee or not fee.paid_at:
        return 0
    return (JobAssignment.objects.filter(technician=profile, assigned_at__gte=fee.paid_at)
            .exclude(booking__status__in=["CANCELLED", "EXPIRED"]).count())


def joining_fee_data(fee):
    if fee is None:
        return None
    renewable = fee.settled and not fee.membership_active
    return {"amount_paise": fee.amount_paise if not renewable else settings.TECHNICIAN_JOINING_FEE_PAISE,
            "status": fee.status, "method": fee.method, "paid_at": fee.paid_at,
            "reference": fee.reference, "settled": fee.settled and not renewable,
            "valid_until": fee.valid_until, "membership_active": fee.membership_active, "renewal_due": renewable,
            "leads_this_year": leads_this_term(fee.technician, fee),
            "leads_per_year": settings.TECHNICIAN_LEADS_PER_YEAR or None,
            "online_available": bool(settings.RAZORPAY_ENABLED and settings.RAZORPAY_KEY_ID)}


@method_decorator(csrf_protect, name="dispatch")
class JoinRequestView(APIView):
    """'Request to join as a pro' from the partner app, without signing in. Staff review KYC in admin."""
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "join_request"

    def post(self, request):
        src = request.data

        def many(key):
            raw = src.getlist(key) if hasattr(src, "getlist") else src.get(key) or []
            raw = raw if isinstance(raw, list) else [raw]
            return [part.strip() for item in raw for part in str(item).split(",") if part.strip()]

        data = {key: src.get(key) for key in ("name", "phone", "city", "experience_years", "about", "consent",
                                              "challenge_id", "code")
                if src.get(key) not in (None, "")}
        data["skills"], data["zone_ids"] = many("skills"), many("zone_ids")
        values_in = JoinRequestInput(data=data)
        values_in.is_valid(raise_exception=True)
        values = values_in.validated_data
        known = set(ServicePackage.objects.filter(is_active=True).values_list("skill_code", flat=True))
        skills = [c for c in dict.fromkeys(values["skills"]) if c in known]
        if not skills:
            raise serializers.ValidationError({"skills": "Choose at least one service you can do."})
        zone_ids = [str(z.id) for z in Zone.objects.filter(id__in=values["zone_ids"], is_active=True)]
        id_doc, photo = request.FILES.get("id_document"), request.FILES.get("photo")
        id_type = _sniff(id_doc) if id_doc else None
        photo_type = _sniff(photo, allow_pdf=False) if photo else None

        from domains.users.views import consume_otp

        User = get_user_model()
        with transaction.atomic():
            ok = consume_otp(values["phone"], str(values["challenge_id"]), values["code"])
        if not ok:
            raise serializers.ValidationError({"code": "The code is incorrect."})
        try:
            with transaction.atomic():
                user, _ = User.objects.get_or_create(phone_e164=values["phone"],
                                                     defaults={"username": values["phone"], "is_active": True})
                existing = TechnicianProfile.objects.filter(user=user).first()
                if existing:
                    fee = ensure_joining_fee(existing)
                    login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
                    return Response({"status": existing.verification_status, "already_applied": True,
                                     "joining_fee": joining_fee_data(fee),
                                     "message": "You have already applied with this number."}, status=200)
                profile = TechnicianProfile.objects.create(
                    user=user, display_name=values["name"].strip(), city=values["city"].strip(),
                    experience_years=values["experience_years"], bio=values["about"], requested_zone_ids=zone_ids,
                    verification_status="UNDER_REVIEW" if id_doc else "PENDING_DOCUMENTS", is_active=False,
                    submitted_at=timezone.now() if id_doc else None)
                TechnicianSkill.objects.bulk_create([TechnicianSkill(technician=profile, code=c) for c in skills])
                if id_doc:
                    TechnicianDocument.objects.create(technician=profile, kind="IDENTITY", file=id_doc, content_type=id_type)
                if photo:
                    TechnicianDocument.objects.create(technician=profile, kind="PROFILE_PHOTO", file=photo, content_type=photo_type)
                AuditLog.objects.create(actor=None, action="TECHNICIAN_JOIN_REQUESTED", resource_type="TechnicianProfile",
                                        resource_id=str(profile.id), metadata={"skills": skills})
                fee = ensure_joining_fee(profile)
        except IntegrityError as exc:
            raise serializers.ValidationError("We could not save your request. Please try again.") from exc
        # Signed in so the applicant can pay the joining fee straight away. Jobs stay locked until approval.
        login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
        return Response({"status": profile.verification_status, "already_applied": False,
                         "joining_fee": joining_fee_data(fee),
                         "message": "Request received. Pay the joining fee to complete your application."},
                        status=201)


def _parse_range(params):
    """period=day|month|custom with from/to (YYYY-MM-DD). Returns (start_date, end_date, period)."""
    today = timezone.localdate()
    period = params.get("period", "month")
    if period == "day":
        day = date.fromisoformat(params["date"]) if params.get("date") else today
        return day, day, period
    if period == "month":
        if params.get("month"):
            year, month = (int(x) for x in params["month"].split("-")[:2])
            start = date(year, month, 1)
        else:
            start = today.replace(day=1)
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        return start, end, period
    if period == "custom":
        try:
            start = date.fromisoformat(params["from"])
            end = date.fromisoformat(params["to"])
        except (KeyError, ValueError) as exc:
            raise serializers.ValidationError({"from": "Choose a start and end date."}) from exc
        if end < start:
            raise serializers.ValidationError({"to": "End date must be after the start date."})
        if (end - start).days >= MAX_REPORT_DAYS:
            raise serializers.ValidationError({"to": "Choose a range of one year or less."})
        return start, end, period
    raise serializers.ValidationError({"period": "Use day, month or custom."})


def _range_qs(profile, start, end):
    """Customer payments the technician collected at the visit (cash / UPI) in the date range."""
    from domains.payments.models import Payment

    tz = timezone.get_current_timezone()
    lo = timezone.make_aware(datetime.combine(start, time.min), tz)
    hi = timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), tz)
    return (Payment.objects.filter(booking__technician_assignment__technician=profile, status="CAPTURED",
                                   payment_method__in=["CASH", "UPI"], verified_at__gte=lo, verified_at__lt=hi)
            .select_related("booking__service", "booking__technician_assignment"))


def earnings_report(profile, params):
    """Earnings = what customers paid the technician directly, by day, month or a custom range."""
    try:
        start, end, period = _parse_range(params)
    except ValueError as exc:
        raise serializers.ValidationError({"date": "Use a valid date (YYYY-MM-DD)."}) from exc
    qs = _range_qs(profile, start, end)
    totals = {"CASH": 0, "UPI": 0}
    for row in qs.values("payment_method").annotate(t=Sum("amount_paise")):
        totals[row["payment_method"]] = row["t"] or 0
    by_month = (end - start).days > 62
    trunc = TruncMonth("verified_at") if by_month else TruncDate("verified_at")
    buckets = [{"label": (b["k"].date() if isinstance(b["k"], datetime) else b["k"]).isoformat(),
                "amount_paise": b["t"] or 0, "jobs": b["n"]}
               for b in qs.annotate(k=trunc).values("k").annotate(t=Sum("amount_paise"),
                                                                  n=Count("booking", distinct=True)).order_by("k")]
    rows = [{"id": str(p.id), "date": timezone.localtime(p.verified_at).date().isoformat(),
             "booking_reference": p.booking.reference, "service": p.booking.service.name,
             "job_id": str(p.booking.technician_assignment.id), "amount_paise": p.amount_paise,
             "method": p.payment_method, "kind": p.payment_type}
            for p in qs.order_by("-verified_at")[:500]]
    return {"period": period, "from": start.isoformat(), "to": end.isoformat(),
            "totals": {**totals, "ALL": totals["CASH"] + totals["UPI"]},
            "jobs": len({r["booking_reference"] for r in rows}),
            "bucket": "month" if by_month else "day", "buckets": buckets, "rows": rows}


class EarningsReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(earnings_report(profile_for(request.user, verified=True), request.query_params))


class EarningsStatementView(APIView):
    """Downloadable PDF earnings statement for the chosen period."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        profile = profile_for(request.user, verified=True)
        report = earnings_report(profile, request.query_params)
        buf = io.BytesIO()
        pdf = canvas.Canvas(buf, pagesize=A4)
        width, height = A4
        y = height - 56

        def line(text, size=10, bold=False, right=None):
            nonlocal y
            if y < 60:
                pdf.showPage()
                y = height - 56
            pdf.setFont("Helvetica-Bold" if bold else "Helvetica", size)
            pdf.drawString(48, y, text)
            if right is not None:
                pdf.drawRightString(width - 48, y, right)
            y -= size + 8

        rupees = lambda p: f"Rs {p / 100:,.2f}"  # noqa: E731
        line("NammaPros - Partner collections statement", 15, True)
        line(f"{profile.display_name} - {profile.user.phone_e164}")
        line(f"Period: {report['from']} to {report['to']}")
        line("Amounts collected directly from customers at the visit.", 9)
        y -= 6
        for key, title in (("CASH", "Cash"), ("UPI", "UPI"), ("ALL", "Total collected")):
            line(title, 11, key == "ALL", rupees(report["totals"][key]))
        y -= 8
        line("Date        Booking            Service                          Method", 9, True, "Amount")
        for row in report["rows"]:
            line(f"{row['date']}  {row['booking_reference'][:16]:<18} {row['service'][:30]:<32} {row['method']}",
                 9, False, rupees(row["amount_paise"]))
        if not report["rows"]:
            line("No earnings in this period.", 10)
        pdf.showPage()
        pdf.save()
        buf.seek(0)
        name = f"nammapros-collections-{report['from']}-to-{report['to']}.pdf"
        return FileResponse(buf, as_attachment=True, filename=name, content_type="application/pdf")


class TechnicianJobInvoiceView(APIView):
    """The customer invoice for a job assigned to this technician, once issued."""
    permission_classes = [IsAuthenticated]

    def get(self, request, job_id):
        profile = profile_for(request.user, verified=True)
        job = get_object_or_404(JobAssignment.objects.select_related("booking"), id=job_id, technician=profile)
        invoice = getattr(job.booking, "invoice", None)
        if not invoice or invoice.status != "ISSUED" or not invoice.document:
            raise Http404
        return FileResponse(invoice.document.open("rb"), as_attachment=True,
                            filename=f"{invoice.invoice_number}.pdf", content_type="application/pdf")


class JoiningFeeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = profile_for(request.user)
        return Response(joining_fee_data(ensure_joining_fee(profile)))


class JoiningFeeOrderView(APIView):
    """Start a Razorpay checkout for the joining fee."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from domains.payments.services import get_provider

        profile = profile_for(request.user)
        with transaction.atomic():
            fee = TechnicianJoiningFee.objects.select_for_update().get(id=ensure_joining_fee(profile).id)
            if fee.membership_active:
                raise serializers.ValidationError("Your membership is already active.")
            if fee.settled:
                # Renewal after the membership year ended: keep a record of the old term, then start a new one.
                AuditLog.objects.create(actor=request.user, action="TECHNICIAN_MEMBERSHIP_RENEWAL_STARTED",
                                        resource_type="TechnicianJoiningFee", resource_id=str(fee.id),
                                        metadata={"previous_paid_at": fee.paid_at.isoformat() if fee.paid_at else None,
                                                  "previous_valid_until": fee.valid_until.isoformat() if fee.valid_until else None,
                                                  "previous_method": fee.method, "previous_amount_paise": fee.amount_paise,
                                                  "previous_payment_id": fee.provider_payment_id})
                fee.status = "PENDING"
                fee.method = ""
                fee.provider_payment_id = ""
                fee.reference = ""
                fee.amount_paise = settings.TECHNICIAN_JOINING_FEE_PAISE
            if not (settings.RAZORPAY_ENABLED and settings.RAZORPAY_KEY_ID):
                raise serializers.ValidationError(
                    "Online payment is not available right now. Our team will share how to pay.")
            receipt = f"JF-{str(profile.id)[:8]}-{int(timezone.now().timestamp())}"
            order = get_provider().create_order(fee.amount_paise, receipt)
            if int(order.get("amount", -1)) != fee.amount_paise:
                raise serializers.ValidationError("Payment could not be started. Please try again.")
            fee.provider_order_id = order["id"]
            fee.save()
        return Response({"order_id": fee.provider_order_id, "key_id": settings.RAZORPAY_KEY_ID,
                         "amount_paise": fee.amount_paise, "currency": "INR", "name": profile.display_name,
                         "phone": profile.user.phone_e164})


def mark_fee_paid_online(fee, payment_id):
    """Idempotently mark a joining fee paid after a verified, captured Razorpay payment."""
    if fee.settled:
        return fee
    fee.status = "PAID"
    fee.method = "ONLINE"
    fee.provider_payment_id = payment_id
    start_membership(fee)
    fee.save(update_fields=["status", "method", "provider_payment_id", "paid_at", "valid_until", "updated_at"])
    AuditLog.objects.create(actor=fee.technician.user, action="TECHNICIAN_JOINING_FEE_PAID",
                            resource_type="TechnicianJoiningFee", resource_id=str(fee.id),
                            metadata={"amount_paise": fee.amount_paise, "payment_id": payment_id})
    from .messaging import notify_technician

    notify_technician(fee.technician, "TECHNICIAN_JOINING_FEE_PAID")
    return fee


class JoiningFeeVerifyInput(serializers.Serializer):
    razorpay_order_id = serializers.CharField(max_length=64)
    razorpay_payment_id = serializers.CharField(max_length=64)
    razorpay_signature = serializers.CharField(max_length=256)


class JoiningFeeVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from domains.payments.services import get_provider

        data = JoiningFeeVerifyInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        profile = profile_for(request.user)
        provider = get_provider()
        with transaction.atomic():
            fee = TechnicianJoiningFee.objects.select_for_update().filter(
                technician=profile, provider_order_id=values["razorpay_order_id"]).first()
            if not fee:
                raise serializers.ValidationError("This payment does not match your joining fee.")
            if not provider.verify_checkout(values["razorpay_order_id"], values["razorpay_payment_id"],
                                            values["razorpay_signature"]):
                raise serializers.ValidationError("Payment could not be verified.")
            payment = provider.fetch_payment(values["razorpay_payment_id"])
            if (payment.get("order_id") != fee.provider_order_id or int(payment.get("amount", -1)) != fee.amount_paise
                    or payment.get("status") != "captured"):
                raise serializers.ValidationError(
                    "Payment is not complete yet. If money was deducted, it will update shortly.")
            mark_fee_paid_online(fee, values["razorpay_payment_id"])
        return Response(joining_fee_data(fee))
