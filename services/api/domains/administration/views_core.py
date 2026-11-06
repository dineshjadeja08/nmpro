from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Max, Q, Sum
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.bookings.models import Booking, BookingPriceSnapshot
from domains.catalog.models import Category, PricingRule, Service, ServiceImage, ServicePackage
from domains.locations.models import City, ServiceCoverage, Zone
from domains.operations.models import Lead, OperationsZoneGrant, OperationalEscalation, SupportTicket
from domains.operations.views import booking_data, booking_query, paged, ticket_data
from domains.payments.models import Invoice, Payment, Refund
from domains.technicians.models import JobAssignment, TechnicianDocument, TechnicianEarning, TechnicianProfile
from domains.technicians.services import review_application

from .models import LedgerAccount, LedgerEntry, Payout, PlatformSetting, Settlement
from .rbac import can, require, roles_for
from .services import audit


def period(request):
    today = timezone.localdate()
    preset = request.query_params.get("period", "30d")
    if preset == "today":
        return today, today
    if preset == "7d":
        return today - timedelta(days=6), today
    if preset == "30d":
        return today - timedelta(days=29), today
    start = parse_date(request.query_params.get("start", ""))
    end = parse_date(request.query_params.get("end", ""))
    if not start or not end or end < start or (end - start).days > 366:
        raise serializers.ValidationError("Choose a valid range within one year.")
    return start, end


def sum_value(qs, field="amount_paise"):
    return qs.aggregate(value=Sum(field))["value"] or 0


def admin_booking_data(booking, contact):
    data = booking_data(booking)
    if not contact:
        data["customer_phone"] = f"******{(data['customer_phone'] or '')[-4:]}"
        data["address"] = None
    return data


def customer_contact_allowed(user):
    return bool(roles_for(user).intersection({"SUPER_ADMIN", "OPERATIONS_MANAGER", "DISPATCH_OPERATOR", "SUPPORT_AGENT"}))


def category_data(c):
    return {"id": str(c.id), "slug": c.slug, "name": c.name, "description": c.description,
            "sort_order": c.sort_order, "is_active": c.is_active}


def service_data(s):
    return {"id": str(s.id), "category_id": str(s.category_id), "slug": s.slug, "name": s.name,
            "summary": s.summary, "description": s.description, "starting_price_paise": s.starting_price_paise,
            "sort_order": s.sort_order, "is_active": s.is_active,
            "images": [{"id": str(i.id), "url": f"/api/v1/catalog/images/{i.id}/"} for i in s.images.all()]}


def package_data(p):
    return {"id": str(p.id), "service_id": str(p.service_id), "name": p.name,
            "description": p.description, "requirements": p.requirements, "pricing_model": p.pricing_model,
            "duration_minutes": p.duration_minutes, "inclusions": p.inclusions,
            "exclusions": p.exclusions, "skill_code": p.skill_code, "is_active": p.is_active}


def price_data(p):
    return {"id": str(p.id), "package_id": str(p.package_id), "zone_id": str(p.zone_id),
            "base_paise": p.base_paise, "inspection_paise": p.inspection_paise,
            "fee_paise": p.fee_paise, "tax_paise": p.tax_paise, "currency": p.currency,
            "payment_policy": p.payment_policy, "version": p.version, "is_active": p.is_active,
            "cancellation_cutoff_minutes": p.cancellation_cutoff_minutes,
            "reschedule_cutoff_minutes": p.reschedule_cutoff_minutes}


def zone_data(z):
    return {"id": str(z.id), "city_id": str(z.city_id), "city": z.city.name, "name": z.name,
            "state": z.state, "postal_code": z.postal_code, "operational_capacity": z.operational_capacity,
            "working_hours": z.working_hours, "is_active": z.is_active}


class AdminDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        start, end = period(request)
        bookings = Booking.objects.filter(created_at__date__gte=start, created_at__date__lte=end,
            status__in=["CONFIRMED", "CONFIRMED_UNPAID", "CANCELLED"])
        metrics = bookings.aggregate(total_bookings=Count("id"),
            cancelled_bookings=Count("id", filter=Q(status="CANCELLED")),
            completed_bookings=Count("id", filter=Q(technician_assignment__status="SERVICE_COMPLETED")))
        metrics["todays_bookings"] = Booking.objects.filter(created_at__date=timezone.localdate()).count()
        metrics["active_technicians"] = TechnicianProfile.objects.filter(verification_status="VERIFIED", is_active=True).count()
        metrics["active_customers"] = Booking.objects.filter(user__is_active=True).values("user_id").distinct().count()
        metrics["pending_technician_verification"] = TechnicianProfile.objects.filter(verification_status="UNDER_REVIEW").count()
        lead_scope = Lead.objects.all()
        lead_zones = list(OperationsZoneGrant.objects.filter(user=request.user).values_list("zone_id", flat=True))
        if lead_zones and "SUPER_ADMIN" not in roles_for(request.user):
            lead_scope = lead_scope.filter(zone_id__in=lead_zones)
        metrics["leads_total"] = lead_scope.count()
        metrics["leads_converted"] = lead_scope.filter(status="CONVERTED").count()
        metrics["open_issues"] = (SupportTicket.objects.exclude(status__in=["RESOLVED", "CLOSED"]).count() +
                                   OperationalEscalation.objects.exclude(status__in=["RESOLVED", "CLOSED"]).count())
        payments = None
        if can(request.user, "VIEW_FINANCE"):
            payments = Payment.objects.filter(status="CAPTURED", created_at__date__gte=start, created_at__date__lte=end)
            refunds = Refund.objects.filter(status="SUCCEEDED", created_at__date__gte=start, created_at__date__lte=end)
            metrics.update({"gross_booking_value_paise": sum_value(BookingPriceSnapshot.objects.filter(
                booking__in=bookings), "total_paise"), "collected_payments_paise": sum_value(payments),
                "refunds_paise": sum_value(refunds),
                "outstanding_customer_paise": sum_value(BookingPriceSnapshot.objects.filter(
                    booking__status__in=["CONFIRMED_UNPAID", "AWAITING_PAYMENT"]), "total_paise"),
                "technician_payable_paise": sum_value(TechnicianEarning.objects.filter(status="APPROVED")),
                "payouts_completed_paise": sum_value(Payout.objects.filter(status="PAID")),
                "pending_refunds": Refund.objects.filter(status__in=["REQUESTED", "APPROVED", "PROCESSING"]).count(),
                "pending_settlements": Settlement.objects.filter(status__in=["DRAFT", "UNDER_REVIEW"]).count(),
                "recognized_revenue_paise": sum_value(LedgerEntry.objects.filter(
                    transaction__status="POSTED", account__kind="REVENUE"), "credit_paise") - sum_value(
                    LedgerEntry.objects.filter(transaction__status="POSTED", account__kind="REVENUE"), "debit_paise")})
        result = {"start": start, "end": end, "metrics": metrics,
            "booking_trend": list(bookings.values("created_at__date").annotate(count=Count("id")).order_by("created_at__date")),
            "cancellation_trend": list(bookings.filter(status="CANCELLED").values("created_at__date").annotate(count=Count("id")).order_by("created_at__date")),
            "category_performance": list(bookings.values("service__category__name").annotate(count=Count("id")).order_by("-count")[:30]),
            "technician_activity": list(JobAssignment.objects.filter(completed_at__date__gte=start,
                completed_at__date__lte=end, status="SERVICE_COMPLETED").values("completed_at__date").annotate(
                count=Count("id")).order_by("completed_at__date"))}
        if payments is not None:
            result["revenue_trend"] = list(payments.values("created_at__date").annotate(
                collected_paise=Sum("amount_paise")).order_by("created_at__date"))
        return Response(result)


class AdminBookingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        return paged(request, booking_query(request), lambda b: admin_booking_data(b, customer_contact_allowed(request.user)))


class AdminBookingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        require(request.user, "VIEW_ADMIN")
        b = get_object_or_404(booking_query(request).prefetch_related("events", "operator_notes"), id=booking_id)
        data = admin_booking_data(b, customer_contact_allowed(request.user))
        data["timeline"] = [{"status": e.to_status, "at": e.created_at} for e in b.events.all()]
        data["notes"] = [{"text": n.text, "at": n.created_at} for n in b.operator_notes.all()]
        data["support"] = [ticket_data(t) for t in SupportTicket.objects.filter(booking=b).order_by("-created_at")[:20]]
        data["quotations"] = [{"id": str(q.id), "status": q.status, "total_paise": q.total_paise}
            for q in b.technician_assignment.quotations.all()] if hasattr(b, "technician_assignment") else []
        invoice = Invoice.objects.filter(booking=b).first()
        data["invoice"] = {"id": str(invoice.id), "number": invoice.invoice_number,
                           "status": invoice.status} if invoice else None
        return Response(data)


class AdminCustomersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        from django.contrib.auth import get_user_model

        qs = get_user_model().objects.filter(booking__isnull=False).annotate(bookings_count=Count("booking", distinct=True)).distinct().order_by("id")
        contact = customer_contact_allowed(request.user)
        if request.query_params.get("q") and contact:
            qs = qs.filter(phone_e164__icontains=request.query_params["q"][:20])
        return paged(request, qs, lambda u: {"id": u.id, "name": u.get_full_name(),
            "phone": u.phone_e164 if contact else f"******{(u.phone_e164 or '')[-4:]}", "joined_at": u.date_joined, "is_active": u.is_active,
            "bookings": u.bookings_count})


class AdminCustomerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id):
        require(request.user, "VIEW_ADMIN")
        from django.contrib.auth import get_user_model

        user = get_object_or_404(get_user_model().objects.filter(booking__isnull=False).distinct(), id=customer_id)
        bookings = Booking.objects.filter(user=user, slot__isnull=False).select_related("user", "service", "package", "address", "slot__zone", "price_snapshot", "technician_assignment__technician").order_by("-created_at")[:30]
        contact = customer_contact_allowed(request.user)
        data = {"id": user.id, "name": user.get_full_name(), "phone": user.phone_e164 if contact else f"******{(user.phone_e164 or '')[-4:]}",
                "joined_at": user.date_joined, "is_active": user.is_active,
                "bookings": [admin_booking_data(b, contact) for b in bookings],
                "tickets": [ticket_data(t) for t in SupportTicket.objects.filter(customer=user)[:30]]}
        if can(request.user, "VIEW_FINANCE"):
            data["collected_paise"] = sum_value(Payment.objects.filter(booking__user=user, status="CAPTURED"))
            data["refunds_paise"] = sum_value(Refund.objects.filter(booking__user=user, status="SUCCEEDED"))
        return Response(data)


class AdminTechniciansView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = TechnicianProfile.objects.select_related("user").prefetch_related("skills", "zones__zone").order_by("-created_at")
        if request.query_params.get("status"):
            qs = qs.filter(verification_status=request.query_params["status"])
        if request.query_params.get("q"):
            qs = qs.filter(display_name__icontains=request.query_params["q"][:80])
        return paged(request, qs, lambda p: {"id": str(p.id), "name": p.display_name,
            "phone": p.user.phone_e164, "status": p.verification_status,
            "online": p.is_online, "skills": [s.code for s in p.skills.all() if s.is_verified],
            "zones": [z.zone.name for z in p.zones.all()]})


class AdminTechnicianView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, technician_id):
        require(request.user, "VIEW_ADMIN")
        p = get_object_or_404(TechnicianProfile.objects.select_related("user").prefetch_related("skills", "zones__zone"), id=technician_id)
        data = {"id": str(p.id), "name": p.display_name, "phone": p.user.phone_e164,
                "status": p.verification_status, "city": p.city, "experience_years": p.experience_years,
                "skills": [{"id": str(s.id), "code": s.code, "verified": s.is_verified} for s in p.skills.all()],
                "zones": [z.zone.name for z in p.zones.all()],
                "documents": [{"id": str(d.id), "kind": d.kind, "status": d.status} for d in p.documents.all()],
                "completed_jobs": p.assignments.filter(status="SERVICE_COMPLETED").count(),
                "earnings": [{"id": str(e.id), "amount_paise": e.amount_paise, "status": e.status}
                             for e in TechnicianEarning.objects.filter(technician=p).order_by("-created_at")[:30]],
                "settlements": [{"id": str(s.id), "net_paise": s.net_paise, "status": s.status}
                                for s in Settlement.objects.filter(technician=p).order_by("-created_at")[:30]]}
        return Response(data)

    def post(self, request, technician_id, action):
        require(request.user, "MANAGE_TECHNICIANS")
        target = "VERIFIED" if action == "verify" else "SUSPENDED" if action == "suspend" else None
        if not target:
            raise serializers.ValidationError("Unknown technician action.")
        note = serializers.CharField(max_length=240, allow_blank=True).run_validation(request.data.get("note", ""))
        profile = review_application(request.user, technician_id, target, note)
        audit(request.user, f"TECHNICIAN_{target}", "TechnicianProfile", profile.id, {"note": note})
        return Response({"status": profile.verification_status})


class CategoryInput(serializers.Serializer):
    slug = serializers.SlugField(max_length=50, required=False)
    name = serializers.CharField(max_length=80, required=False)
    description = serializers.CharField(max_length=240, allow_blank=True, required=False)
    sort_order = serializers.IntegerField(min_value=0, max_value=65535, required=False)
    is_active = serializers.BooleanField(required=False)


class ServiceInput(serializers.Serializer):
    category_id = serializers.UUIDField(required=False)
    slug = serializers.SlugField(max_length=50, required=False)
    name = serializers.CharField(max_length=100, required=False)
    summary = serializers.CharField(max_length=240, required=False)
    description = serializers.CharField(allow_blank=True, required=False)
    starting_price_paise = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    sort_order = serializers.IntegerField(min_value=0, max_value=65535, required=False)
    is_active = serializers.BooleanField(required=False)


class PackageInput(serializers.Serializer):
    service_id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=100, required=False)
    description = serializers.CharField(allow_blank=True, required=False)
    requirements = serializers.ListField(child=serializers.CharField(max_length=200), required=False)
    pricing_model = serializers.ChoiceField(choices=["FIXED_PRICE", "INSPECTION_BASED"], required=False)
    duration_minutes = serializers.IntegerField(min_value=15, max_value=1440, required=False)
    inclusions = serializers.ListField(child=serializers.CharField(max_length=200), required=False)
    exclusions = serializers.ListField(child=serializers.CharField(max_length=200), required=False)
    skill_code = serializers.CharField(max_length=60, required=False)
    is_active = serializers.BooleanField(required=False)


class CatalogCollectionView(APIView):
    permission_classes = [IsAuthenticated]
    specs = {"categories": (Category, CategoryInput, category_data),
             "services": (Service, ServiceInput, service_data),
             "packages": (ServicePackage, PackageInput, package_data)}

    def get(self, request, kind):
        require(request.user, "VIEW_ADMIN")
        model, _, output = self.specs[kind]
        qs = model.objects.all().order_by("-created_at")
        if kind == "services":
            qs = qs.select_related("category").prefetch_related("images")
        if kind == "packages":
            qs = qs.select_related("service")
        if request.query_params.get("q"):
            qs = qs.filter(name__icontains=request.query_params["q"][:80])
        return paged(request, qs, output)

    def post(self, request, kind):
        require(request.user, "MANAGE_SERVICES")
        model, serializer_class, output = self.specs[kind]
        data = serializer_class(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        required = {"categories": ("slug", "name"), "services": ("category_id", "slug", "name", "summary"),
                    "packages": ("service_id", "name", "pricing_model", "duration_minutes", "skill_code")}[kind]
        if any(not values.get(field) for field in required):
            raise serializers.ValidationError({"required": list(required)})
        if kind == "services":
            values["category"] = get_object_or_404(Category, id=values.pop("category_id"))
        if kind == "packages":
            values["service"] = get_object_or_404(Service, id=values.pop("service_id"))
        obj = model.objects.create(**values)
        audit(request.user, f"CATALOG_{kind.upper()}_CREATED", model.__name__, obj.id)
        return Response(output(obj), status=201)


class CatalogDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, kind, item_id):
        require(request.user, "MANAGE_SERVICES")
        model, serializer_class, output = CatalogCollectionView.specs[kind]
        data = serializer_class(data=request.data)
        data.is_valid(raise_exception=True)
        obj = get_object_or_404(model, id=item_id)
        values = data.validated_data
        if "category_id" in values:
            values["category"] = get_object_or_404(Category, id=values.pop("category_id"))
        if "service_id" in values:
            values["service"] = get_object_or_404(Service, id=values.pop("service_id"))
        for key, value in values.items():
            setattr(obj, key, value)
        obj.save()
        audit(request.user, f"CATALOG_{kind.upper()}_UPDATED", model.__name__, obj.id, {"fields": list(values)})
        return Response(output(obj))


class AdminServiceImageView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, service_id):
        require(request.user, "MANAGE_SERVICES")
        service = get_object_or_404(Service, id=service_id)
        upload = request.FILES.get("file")
        if not upload or upload.size < 1 or upload.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Choose an image under 5 MB.")
        head = upload.read(16)
        upload.seek(0)
        mime = ("image/jpeg" if head.startswith(b"\xff\xd8\xff") else
                "image/png" if head.startswith(b"\x89PNG\r\n\x1a\n") else
                "image/webp" if head[:4] == b"RIFF" and head[8:12] == b"WEBP" else None)
        if not mime:
            raise serializers.ValidationError("Use JPEG, PNG, or WebP.")
        image = ServiceImage.objects.create(service=service, file=upload, content_type=mime)
        audit(request.user, "SERVICE_IMAGE_ADDED", "ServiceImage", image.id)
        return Response({"id": str(image.id), "url": f"/api/v1/catalog/images/{image.id}/"}, status=201)


class PriceInput(serializers.Serializer):
    package_id = serializers.UUIDField(required=False)
    zone_id = serializers.UUIDField(required=False)
    base_paise = serializers.IntegerField(min_value=0, required=False)
    inspection_paise = serializers.IntegerField(min_value=0, required=False)
    fee_paise = serializers.IntegerField(min_value=0, required=False)
    tax_paise = serializers.IntegerField(min_value=0, required=False)
    payment_policy = serializers.ChoiceField(choices=["PREPAID", "PAY_AT_VISIT"], required=False)
    is_active = serializers.BooleanField(required=False)
    cancellation_cutoff_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    reschedule_cutoff_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)


def validate_price(values, package):
    if values["tax_paise"] and not PlatformSetting.objects.filter(key="approved_tax_policy", value__approved=True).exists():
        raise serializers.ValidationError("Approved tax policy is required before setting tax.")
    if values["base_paise"] > 0 and values["inspection_paise"] > 0:
        raise serializers.ValidationError("Choose fixed or inspection pricing, not both.")
    if values["base_paise"] == 0 and values["inspection_paise"] == 0:
        raise serializers.ValidationError("A base or inspection charge is required.")
    if (package.pricing_model == "FIXED_PRICE" and values["base_paise"] <= 0) or (
            package.pricing_model == "INSPECTION_BASED" and values["inspection_paise"] <= 0):
        raise serializers.ValidationError("Price must match the package pricing model.")


class AdminPricingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = PricingRule.objects.select_related("package", "zone").order_by("-created_at")
        return paged(request, qs, price_data)

    def post(self, request):
        require(request.user, "MANAGE_PRICING")
        data = PriceInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if "package_id" not in v or "zone_id" not in v:
            raise serializers.ValidationError("Choose a package and zone.")
        package = get_object_or_404(ServicePackage, id=v.pop("package_id"))
        zone = get_object_or_404(Zone, id=v.pop("zone_id"))
        values = {"base_paise": 0, "inspection_paise": 0, "fee_paise": 0,
                  "tax_paise": 0, "payment_policy": "PAY_AT_VISIT", "is_active": False, **v}
        validate_price(values, package)
        with transaction.atomic():
            ServicePackage.objects.select_for_update().get(id=package.id)
            if values["is_active"] and PricingRule.objects.filter(package=package, zone=zone, is_active=True).exists():
                raise serializers.ValidationError("Replace the active price through its detail endpoint.")
            version = (PricingRule.objects.filter(package=package, zone=zone).aggregate(
                latest=Max("version"))["latest"] or 0) + 1
            price = PricingRule.objects.create(package=package, zone=zone, version=version, **values)
            audit(request.user, "PRICING_CREATED", "PricingRule", price.id, {"version": version})
        return Response(price_data(price), status=201)


class AdminPricingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, price_id):
        require(request.user, "MANAGE_PRICING")
        data = PriceInput(data=request.data)
        data.is_valid(raise_exception=True)
        if "package_id" in data.validated_data or "zone_id" in data.validated_data:
            raise serializers.ValidationError("Create a separate price for a different package or zone.")
        with transaction.atomic():
            ref = get_object_or_404(PricingRule.objects.values("package_id"), id=price_id)
            ServicePackage.objects.select_for_update().get(id=ref["package_id"])
            old = get_object_or_404(PricingRule.objects.select_for_update(), id=price_id)
            latest = PricingRule.objects.filter(package=old.package, zone=old.zone).aggregate(v=Max("version"))["v"]
            if old.version != latest:
                raise serializers.ValidationError("Price changed. Refresh before editing.")
            v = {field: getattr(old, field) for field in ("base_paise", "inspection_paise", "fee_paise",
                "tax_paise", "payment_policy", "is_active", "cancellation_cutoff_minutes",
                "reschedule_cutoff_minutes")}
            v.update({k: value for k, value in data.validated_data.items() if k in v})
            validate_price(v, old.package)
            old.is_active = False
            old.save(update_fields=["is_active", "updated_at"])
            replacement = PricingRule.objects.create(package=old.package, zone=old.zone,
                version=old.version + 1, **v)
            audit(request.user, "PRICING_REPLACED", "PricingRule", replacement.id,
                  {"previous_rule_id": str(old.id), "version": replacement.version})
        return Response(price_data(replacement))


class ZoneInput(serializers.Serializer):
    city_id = serializers.UUIDField(required=False)
    city_name = serializers.CharField(max_length=80, required=False)
    name = serializers.CharField(max_length=100, required=False)
    state = serializers.CharField(max_length=80, required=False)
    postal_code = serializers.RegexField(r"^\d{6}$", required=False)
    operational_capacity = serializers.IntegerField(min_value=0, max_value=65535, required=False)
    working_hours = serializers.ListField(child=serializers.DictField(), required=False)
    is_active = serializers.BooleanField(required=False)


class AdminZonesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        return paged(request, Zone.objects.select_related("city").order_by("city__name", "name"), zone_data)

    def post(self, request):
        require(request.user, "MANAGE_SERVICES")
        if not settings.NEW_SERVICE_ZONES_ENABLED:
            raise serializers.ValidationError("New service zones are disabled for this environment.")
        data = ZoneInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if not v.get("name") or not v.get("postal_code"):
            raise serializers.ValidationError("Zone name and PIN code are required.")
        city = get_object_or_404(City, id=v.pop("city_id")) if v.get("city_id") else None
        if not city:
            city_name = v.pop("city_name", "")
            if not city_name:
                raise serializers.ValidationError("Choose a city.")
            city = City.objects.filter(name__iexact=city_name).first()
            if not city:
                raise serializers.ValidationError("Create the city through approved location setup first.")
        v.pop("city_name", None)
        zone = Zone.objects.create(city=city, **v)
        audit(request.user, "ZONE_CREATED", "Zone", zone.id)
        return Response(zone_data(zone), status=201)


class AdminZoneDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, zone_id):
        require(request.user, "MANAGE_SERVICES")
        data = ZoneInput(data=request.data)
        data.is_valid(raise_exception=True)
        zone = get_object_or_404(Zone.objects.select_related("city"), id=zone_id)
        v = data.validated_data
        v.pop("city_name", None)
        if "city_id" in v:
            v["city"] = get_object_or_404(City, id=v.pop("city_id"))
        for key, value in v.items():
            setattr(zone, key, value)
        zone.save()
        audit(request.user, "ZONE_UPDATED", "Zone", zone.id, {"fields": list(v)})
        return Response(zone_data(zone))


class ZoneCoverageInput(serializers.Serializer):
    service_id = serializers.UUIDField()
    is_active = serializers.BooleanField()


class AdminZoneCoverageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, zone_id):
        require(request.user, "VIEW_ADMIN")
        return Response({"coverage": [{"service_id": str(c.service_id), "service": c.service.name,
            "is_active": c.is_active} for c in ServiceCoverage.objects.filter(zone_id=zone_id).select_related("service")]})

    def post(self, request, zone_id):
        require(request.user, "MANAGE_SERVICES")
        data = ZoneCoverageInput(data=request.data)
        data.is_valid(raise_exception=True)
        zone = get_object_or_404(Zone, id=zone_id)
        service = get_object_or_404(Service, id=data.validated_data["service_id"])
        coverage, _ = ServiceCoverage.objects.update_or_create(zone=zone, service=service,
            defaults={"is_active": data.validated_data["is_active"]})
        audit(request.user, "ZONE_COVERAGE_UPDATED", "ServiceCoverage", coverage.id)
        return Response({"id": str(coverage.id), "is_active": coverage.is_active})
