from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Max, ProtectedError, Q, Sum
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
from domains.catalog.models import Category, PricingRule, Review, Service, ServiceImage, ServicePackage
from domains.catalog.providers.cloudinary import CloudinaryProvider, CloudinaryUnavailable
from domains.locations.models import City, ServiceCoverage, Zone
from domains.operations.models import Lead, OperationsZoneGrant, OperationalEscalation, SupportTicket
from domains.operations.views import booking_data, booking_query, paged, ticket_data
from domains.payments.models import Invoice, Payment, Refund
from domains.technicians.models import (
    JobAssignment,
    TechnicianDocument,
    TechnicianEarning,
    TechnicianProfile,
    TechnicianServiceZone,
    TechnicianSkill,
)
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
    sub_count = getattr(c, "sub_service_count", None)
    if sub_count is None:
        sub_count = c.services.count()
    return {
        "id": str(c.id),
        "slug": c.slug,
        "name": c.name,
        "description": c.description,
        "short_description": c.description,
        "image_url": c.image_display or c.image_url or "",
        "banner_image": c.banner_image_display or c.banner_image_url or "",
        "banner_image_url": c.banner_image_url,
        "banner_title": c.banner_title,
        "banner_subtitle": c.banner_subtitle,
        "banner_button_text": c.banner_button_text,
        "banner_button_link": c.banner_button_link,
        "banner_is_active": c.banner_is_active,
        "sub_service_count": sub_count,
        "sort_order": c.sort_order,
        "is_active": c.is_active,
    }


def service_data(s):
    return {"id": str(s.id), "category_id": str(s.category_id), "category_name": s.category.name,
            "category_slug": s.category.slug,
            "slug": s.slug, "name": s.name,
            "summary": s.summary, "short_description": s.summary,
            "description": s.description, "full_description": s.description,
            "starting_price_paise": s.starting_price_paise,
            "price_note": s.price_note,
            "training_fee_paise": s.training_fee_paise,
            "important_notes": s.important_notes,
            "features": s.features,
            "inclusions": s.inclusions,
            "exclusions": s.exclusions,
            "faqs": s.faq_items,
            "seo_title": s.seo_title,
            "seo_description": s.seo_description,
            "banner_title": s.banner_title,
            "banner_subtitle": s.banner_subtitle,
            "banner_button_text": s.banner_button_text,
            "banner_button_link": s.banner_button_link,
            "banner_is_active": s.banner_is_active,
            "is_popular": s.is_popular,
            "is_featured": s.is_featured,
            "show_in_app": s.show_in_app,
            "main_image": s.main_image_display or s.cover_image_url or "",
            "banner_image": s.banner_image_display or s.landing_thumbnail_url or "",
            "cover_image": s.cover_image_display,
            "landing_thumbnail": s.landing_thumbnail_display,
            "popup_cover_image": s.popup_cover_image_display,
            "popup_content_image": s.popup_content_image_display,
            "list_image": s.list_image_display,
            "cover_image_url": s.cover_image_url,
            "landing_thumbnail_url": s.landing_thumbnail_url,
            "popup_cover_image_url": s.popup_cover_image_url,
            "popup_content_image_url": s.popup_content_image_url,
            "list_image_url": s.list_image_url,
            "sort_order": s.sort_order, "is_active": s.is_active,
            "created_at": s.created_at,
            "images": [
                {"id": str(i.id), "url": i.cloudinary_url or f"/api/v1/catalog/images/{i.id}/",
                 "alt_text": i.alt_text, "sort_order": i.sort_order, "is_active": i.is_active}
                for i in s.images.all()
            ]}


def package_data(p):
    return {"id": str(p.id), "service_id": str(p.service_id), "name": p.name,
            "description": p.description, "requirements": p.requirements, "pricing_model": p.pricing_model,
            "duration_minutes": p.duration_minutes, "inclusions": p.inclusions,
            "exclusions": p.exclusions, "skill_code": p.skill_code, "is_active": p.is_active}


def price_data(p):
    return {"id": str(p.id), "package_id": str(p.package_id), "zone_id": str(p.zone_id),
            "base_paise": p.base_paise, "inspection_paise": p.inspection_paise,
            "fee_paise": p.fee_paise, "tax_paise": p.tax_paise, "currency": p.currency,
            "payment_policy": p.payment_policy, "advance_type": p.advance_type,
            "advance_percentage": p.advance_percentage, "advance_amount_paise": p.advance_amount_paise,
            "version": p.version, "is_active": p.is_active,
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
        metrics["follow_ups_due"] = lead_scope.filter(status__in=["NEW", "CONTACTED", "FOLLOW_UP"]).count()
        
        # Operational summary counts:
        metrics["unassigned_jobs"] = Booking.objects.filter(status="CONFIRMED", technician_assignment__isnull=True).count()
        metrics["confirmed_bookings"] = Booking.objects.filter(status="CONFIRMED").count()
        metrics["upcoming_services"] = Booking.objects.filter(
            status__in=["CONFIRMED", "ASSIGNED"],
            slot__start_at__gte=timezone.now()
        ).count()
        metrics["pending_payments_count"] = Payment.objects.filter(status__in=["CREATED", "AUTHORIZED"]).count()

        # Today's revenue:
        today_start = timezone.localdate()
        today_rev = Payment.objects.filter(status="CAPTURED", created_at__date=today_start).aggregate(val=Sum("amount_paise"))["val"] or 0
        metrics["todays_revenue_paise"] = today_rev

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
        b = get_object_or_404(
            Booking.objects.select_related(
                "user", "service", "package", "address__zone", "slot__zone",
                "price_snapshot", "invoice", "technician_assignment__technician__user",
            ).prefetch_related("events", "operator_notes"),
            id=booking_id,
        )
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
            term = request.query_params["q"][:20]
            qs = qs.filter(Q(phone_e164__icontains=term) | Q(customer_code__icontains=term))
        return paged(request, qs, lambda u: {"id": u.id, "customer_code": u.customer_code, "name": u.get_full_name(),
            "phone": u.phone_e164 if contact else f"******{(u.phone_e164 or '')[-4:]}", "joined_at": u.date_joined, "is_active": u.is_active,
            "bookings": u.bookings_count})


class AdminCustomerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id):
        require(request.user, "VIEW_ADMIN")
        from django.contrib.auth import get_user_model

        user = get_object_or_404(get_user_model().objects.filter(booking__isnull=False).distinct(), id=customer_id)
        bookings = Booking.objects.filter(user=user).select_related("user", "service", "package", "address__zone", "slot__zone", "price_snapshot", "invoice", "technician_assignment__technician__user").order_by("-created_at")[:30]
        contact = customer_contact_allowed(request.user)
        data = {"id": user.id, "customer_code": user.customer_code, "name": user.get_full_name(),
                "phone": user.phone_e164 if contact else f"******{(user.phone_e164 or '')[-4:]}",
                "joined_at": user.date_joined, "is_active": user.is_active,
                "bookings": [admin_booking_data(b, contact) for b in bookings],
                "tickets": [ticket_data(t) for t in SupportTicket.objects.filter(customer=user)[:30]]}
        if can(request.user, "VIEW_FINANCE"):
            data["collected_paise"] = sum_value(Payment.objects.filter(booking__user=user, status="CAPTURED"))
            data["refunds_paise"] = sum_value(Refund.objects.filter(booking__user=user, status="SUCCEEDED"))
        return Response(data)


def _technician_detail_data(p):
    from django.db.models import Avg
    profile_photo_doc = p.documents.filter(kind="PROFILE_PHOTO").order_by("-created_at").first()
    reviews_qs = Review.objects.filter(technician=p, is_visible=True)
    avg_rating = reviews_qs.aggregate(avg=Avg("rating"))["avg"]
    svc_list = [
        {"id": str(s.id), "name": s.name, "category": s.category.name, "is_active": s.is_active}
        for s in p.supported_services.select_related("category").all()
    ]
    area_list = [
        {"id": str(z.zone_id), "name": z.zone.name, "city": z.zone.city.name, "postal_code": z.zone.postal_code, "is_active": z.zone.is_active}
        for z in p.zones.select_related("zone__city").all()
    ]
    return {
        "id": str(p.id),
        "employee_code": p.employee_code or "",
        "name": p.display_name,
        "display_name": p.display_name,
        "phone": p.user.phone_e164,
        "virtual_mobile_number": p.virtual_mobile_number,
        "alternate_phone": p.alternate_phone,
        "email": p.email,
        "city": p.city,
        "address": p.address,
        "pincode": p.pincode,
        "service_group": p.service_group,
        "profile_type": p.profile_type,
        "lead_per_day": p.lead_per_day,
        "job_per_day": p.job_per_day,
        "no_of_teams": p.no_of_teams,
        "sales_person_assigned_name": p.sales_person_assigned_name,
        "crm_owner_id": p.crm_owner_id,
        "id_proof_number": p.id_proof_number,
        "technician_type": p.technician_type,
        "experience_years": p.experience_years,
        "joined_at": p.joined_at,
        "languages": p.languages,
        "whatsapp_notifications_enabled": p.whatsapp_notifications_enabled,
        "internal_notes": p.internal_notes,
        "status": p.verification_status,
        "background_verification_status": p.verification_status,
        "is_active": p.is_active,
        "is_online": p.is_online,
        "profile_photo_url": f"/api/v1/technicians/admin/documents/{profile_photo_doc.id}/" if profile_photo_doc else "",
        "supported_services": svc_list,
        "service_areas": area_list,
        "skills": [{"id": str(s.id), "code": s.code, "verified": s.is_verified} for s in p.skills.all()],
        "zones": [z.zone.name for z in p.zones.select_related("zone").all()],
        "documents": [
            {
                "id": str(d.id),
                "kind": d.kind,
                "status": d.status,
                "content_type": d.content_type,
                "url": f"/api/v1/technicians/admin/documents/{d.id}/",
                "created_at": d.created_at,
            }
            for d in p.documents.exclude(kind__in=("BEFORE", "AFTER", "RECEIPT")).order_by("-created_at")
        ],
        "completed_jobs": p.assignments.filter(status="SERVICE_COMPLETED").count(),
        "cancelled_jobs": p.assignments.filter(status="CANCELLED").count(),
        "approved_rating": round(float(avg_rating), 1) if avg_rating is not None else None,
        "approved_review_count": reviews_qs.count(),
        "earnings": [{"id": str(e.id), "amount_paise": e.amount_paise, "status": e.status}
                     for e in TechnicianEarning.objects.filter(technician=p).order_by("-created_at")[:30]],
        "settlements": [{"id": str(s.id), "net_paise": s.net_paise, "status": s.status}
                        for s in Settlement.objects.filter(technician=p).order_by("-created_at")[:30]],
    }


class AdminTechniciansView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = TechnicianProfile.objects.select_related("user").prefetch_related(
            "skills", "zones__zone", "supported_services__category"
        ).order_by("-created_at")
        if request.query_params.get("status"):
            qs = qs.filter(verification_status=request.query_params["status"])
        if request.query_params.get("is_active") in ("true", "false"):
            qs = qs.filter(is_active=request.query_params["is_active"] == "true")
        if request.query_params.get("q"):
            q = request.query_params["q"][:80]
            qs = qs.filter(Q(display_name__icontains=q) | Q(employee_code__icontains=q) | Q(user__phone_e164__icontains=q))
        return paged(request, qs, lambda p: {
            "id": str(p.id),
            "employee_code": p.employee_code or "",
            "name": p.display_name,
            "phone": p.user.phone_e164,
            "city": p.city,
            "status": p.verification_status,
            "is_active": p.is_active,
            "online": p.is_online,
            "services": [s.name for s in p.supported_services.all()] or [s.code for s in p.skills.all() if s.is_verified],
            "zones": [z.zone.name for z in p.zones.all()],
        })

    @transaction.atomic
    def post(self, request):
        require(request.user, "MANAGE_TECHNICIANS")
        from django.contrib.auth import get_user_model
        display_name = serializers.CharField(max_length=120).run_validation(request.data.get("display_name") or request.data.get("name"))
        raw_phone = str(request.data.get("phone") or request.data.get("phone_e164") or "").strip()
        if raw_phone.isdigit() and len(raw_phone) == 10:
            raw_phone = f"+91{raw_phone}"
        phone = serializers.RegexField(r"^\+91[6-9]\d{9}$").run_validation(raw_phone)
        User = get_user_model()
        user, _ = User.objects.get_or_create(phone_e164=phone, defaults={"username": phone, "is_active": True})
        if TechnicianProfile.objects.filter(user=user).exists():
            raise serializers.ValidationError("A technician profile already exists for this phone number.")
        profile = TechnicianProfile.objects.create(
            user=user,
            display_name=display_name,
            city=str(request.data.get("city", ""))[:80],
            id_proof_number=str(request.data.get("id_proof_number", ""))[:20],
            technician_type=request.data.get("technician_type") or "PARTNER",
            verification_status="PENDING_DOCUMENTS",
            is_active=True,
        )
        audit(request.user, "TECHNICIAN_CREATED", "TechnicianProfile", profile.id)
        return Response(_technician_detail_data(profile), status=201)


class AdminTechnicianView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, technician_id):
        require(request.user, "VIEW_ADMIN")
        p = get_object_or_404(
            TechnicianProfile.objects.select_related("user").prefetch_related("skills", "zones__zone__city", "supported_services__category", "documents"),
            id=technician_id,
        )
        return Response(_technician_detail_data(p))

    @transaction.atomic
    def patch(self, request, technician_id):
        require(request.user, "MANAGE_TECHNICIANS")
        p = get_object_or_404(TechnicianProfile.objects.select_for_update().select_related("user"), id=technician_id)
        editable_str = (
            "display_name", "city", "alternate_phone", "virtual_mobile_number", "email",
            "address", "pincode", "service_group", "profile_type", "sales_person_assigned_name",
            "crm_owner_id", "id_proof_number", "technician_type", "internal_notes",
        )
        for field in editable_str:
            if field in request.data:
                setattr(p, field, str(request.data[field] or ""))
        if "name" in request.data and "display_name" not in request.data:
            p.display_name = str(request.data["name"] or "")
        for int_field in ("lead_per_day", "job_per_day", "no_of_teams", "experience_years"):
            if int_field in request.data and request.data[int_field] not in ("", None):
                setattr(p, int_field, max(0, int(request.data[int_field])))
        if "joined_at" in request.data:
            p.joined_at = parse_date(str(request.data["joined_at"])) if request.data["joined_at"] else None
        if "languages" in request.data and isinstance(request.data["languages"], list):
            p.languages = [str(item).strip() for item in request.data["languages"] if str(item).strip()]
        for bool_field in ("is_active", "is_online", "whatsapp_notifications_enabled"):
            if bool_field in request.data:
                setattr(p, bool_field, bool(request.data[bool_field]))
        if "background_verification_status" in request.data:
            p.verification_status = serializers.ChoiceField(
                choices=["REGISTERED", "PENDING_DOCUMENTS", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED"]
            ).run_validation(request.data["background_verification_status"])
        p.save()

        if "supported_service_ids" in request.data:
            svc_ids = [str(x) for x in (request.data.get("supported_service_ids") or [])]
            services = list(Service.objects.filter(id__in=svc_ids))
            p.supported_services.set(services)
            # Keep TechnicianSkill synchronized with selected services' packages for dispatch eligibility
            skill_codes = set(
                ServicePackage.objects.filter(service__in=services).values_list("skill_code", flat=True)
            )
            for code in skill_codes:
                if code:
                    TechnicianSkill.objects.update_or_create(
                        technician=p, code=code,
                        defaults={"is_verified": True, "verified_by": request.user},
                    )

        if "service_area_ids" in request.data:
            zone_ids = [str(x) for x in (request.data.get("service_area_ids") or [])]
            zones = list(Zone.objects.filter(id__in=zone_ids))
            TechnicianServiceZone.objects.filter(technician=p).exclude(zone__in=zones).delete()
            for z in zones:
                TechnicianServiceZone.objects.get_or_create(
                    technician=p, zone=z,
                    defaults={"assigned_by": request.user},
                )

        audit(request.user, "TECHNICIAN_PROFILE_UPDATED", "TechnicianProfile", p.id)
        p = TechnicianProfile.objects.select_related("user").prefetch_related("skills", "zones__zone__city", "supported_services__category", "documents").get(id=p.id)
        return Response(_technician_detail_data(p))

    def post(self, request, technician_id, action):
        require(request.user, "MANAGE_TECHNICIANS")
        target = "VERIFIED" if action == "verify" else "SUSPENDED" if action == "suspend" else None
        if not target:
            raise serializers.ValidationError("Unknown technician action.")
        note = serializers.CharField(max_length=240, allow_blank=True).run_validation(request.data.get("note", ""))
        profile = review_application(request.user, technician_id, target, note)
        audit(request.user, f"TECHNICIAN_{target}", "TechnicianProfile", profile.id, {"note": note})
        return Response({"status": profile.verification_status})


class AdminTechnicianDocumentsView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, technician_id):
        require(request.user, "VIEW_ADMIN")
        p = get_object_or_404(TechnicianProfile, id=technician_id)
        docs = p.documents.exclude(kind__in=("BEFORE", "AFTER", "RECEIPT")).order_by("-created_at")
        return Response({
            "results": [
                {
                    "id": str(d.id),
                    "kind": d.kind,
                    "status": d.status,
                    "content_type": d.content_type,
                    "url": f"/api/v1/technicians/admin/documents/{d.id}/",
                    "created_at": d.created_at,
                }
                for d in docs
            ]
        })

    def post(self, request, technician_id):
        require(request.user, "MANAGE_TECHNICIANS")
        p = get_object_or_404(TechnicianProfile, id=technician_id)
        kind = serializers.ChoiceField(choices=["IDENTITY", "ADDRESS", "CERTIFICATION", "PROFILE_PHOTO"]).run_validation(
            request.data.get("kind") or request.data.get("document_type") or "IDENTITY"
        )
        upload = request.FILES.get("file") or request.FILES.get("image")
        if not upload or upload.size < 1 or upload.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Choose a PDF, PNG, JPEG, or WebP file under 10 MB.")
        head = upload.read(16)
        upload.seek(0)
        mime = (
            "application/pdf" if head.startswith(b"%PDF") else
            "image/jpeg" if head.startswith(b"\xff\xd8\xff") else
            "image/png" if head.startswith(b"\x89PNG\r\n\x1a\n") else
            "image/webp" if head[:4] == b"RIFF" and head[8:12] == b"WEBP" else None
        )
        if not mime:
            raise serializers.ValidationError("Use PDF, JPEG, PNG, or WebP.")
        if kind == "PROFILE_PHOTO":
            TechnicianDocument.objects.filter(technician=p, kind="PROFILE_PHOTO").delete()
        doc = TechnicianDocument.objects.create(
            technician=p,
            kind=kind,
            file=upload,
            content_type=mime,
            status="APPROVED" if kind == "PROFILE_PHOTO" else "PENDING",
            reviewed_by=request.user if kind == "PROFILE_PHOTO" else None,
        )
        audit(request.user, "TECHNICIAN_DOCUMENT_UPLOADED_ADMIN", "TechnicianDocument", doc.id, {"kind": kind})
        return Response({
            "id": str(doc.id),
            "kind": doc.kind,
            "status": doc.status,
            "content_type": doc.content_type,
            "url": f"/api/v1/technicians/admin/documents/{doc.id}/",
            "created_at": doc.created_at,
        }, status=201)


class CategoryInput(serializers.Serializer):
    slug = serializers.SlugField(max_length=50, required=False)
    name = serializers.CharField(max_length=80, required=False)
    description = serializers.CharField(max_length=240, allow_blank=True, required=False)
    image_url = serializers.CharField(max_length=500, allow_blank=True, required=False)
    banner_image_url = serializers.CharField(max_length=500, allow_blank=True, required=False)
    banner_title = serializers.CharField(max_length=160, allow_blank=True, required=False)
    banner_subtitle = serializers.CharField(max_length=320, allow_blank=True, required=False)
    banner_button_text = serializers.CharField(max_length=60, allow_blank=True, required=False)
    banner_button_link = serializers.CharField(max_length=300, allow_blank=True, required=False)
    banner_is_active = serializers.BooleanField(required=False)
    sort_order = serializers.IntegerField(min_value=0, max_value=65535, required=False)
    is_active = serializers.BooleanField(required=False)


class FAQItemInput(serializers.Serializer):
    question = serializers.CharField(max_length=300)
    answer = serializers.CharField(max_length=2000)


class ServiceInput(serializers.Serializer):
    category_id = serializers.UUIDField(required=False)
    slug = serializers.SlugField(max_length=50, required=False)
    name = serializers.CharField(max_length=100, required=False)
    summary = serializers.CharField(max_length=240, required=False, allow_blank=True)
    description = serializers.CharField(allow_blank=True, required=False)
    starting_price_paise = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    price_note = serializers.CharField(max_length=160, allow_blank=True, required=False)
    training_fee_paise = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    important_notes = serializers.CharField(allow_blank=True, required=False)
    features = serializers.ListField(child=serializers.CharField(max_length=300), required=False)
    inclusions = serializers.ListField(child=serializers.CharField(max_length=300), required=False)
    exclusions = serializers.ListField(child=serializers.CharField(max_length=300), required=False)
    faqs = serializers.ListField(child=FAQItemInput(), required=False)
    seo_title = serializers.CharField(max_length=160, allow_blank=True, required=False)
    seo_description = serializers.CharField(max_length=320, allow_blank=True, required=False)
    banner_title = serializers.CharField(max_length=160, allow_blank=True, required=False)
    banner_subtitle = serializers.CharField(max_length=320, allow_blank=True, required=False)
    banner_button_text = serializers.CharField(max_length=60, allow_blank=True, required=False)
    banner_button_link = serializers.CharField(max_length=300, allow_blank=True, required=False)
    banner_is_active = serializers.BooleanField(required=False)
    is_popular = serializers.BooleanField(required=False)
    is_featured = serializers.BooleanField(required=False)
    show_in_app = serializers.BooleanField(required=False)
    cover_image_url = serializers.CharField(max_length=500, required=False, allow_blank=True)
    landing_thumbnail_url = serializers.CharField(max_length=500, required=False, allow_blank=True)
    popup_cover_image_url = serializers.CharField(max_length=500, required=False, allow_blank=True)
    popup_content_image_url = serializers.CharField(max_length=500, required=False, allow_blank=True)
    list_image_url = serializers.CharField(max_length=500, required=False, allow_blank=True)
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
            qs = qs.select_related("category").prefetch_related("images").order_by("sort_order", "name")
            if request.query_params.get("category_id"):
                qs = qs.filter(category_id=request.query_params["category_id"])
            if request.query_params.get("is_active") in ("true", "false"):
                qs = qs.filter(is_active=(request.query_params["is_active"] == "true"))
        if kind == "categories":
            qs = qs.annotate(sub_service_count=Count("services", distinct=True)).order_by("sort_order", "name")
        if kind == "packages":
            qs = qs.select_related("service")
        if request.query_params.get("q"):
            q = request.query_params["q"][:80]
            if kind == "services":
                qs = qs.filter(Q(name__icontains=q) | Q(slug__icontains=q) | Q(summary__icontains=q))
            else:
                qs = qs.filter(name__icontains=q)
        return paged(request, qs, output)

    def post(self, request, kind):
        require(request.user, "MANAGE_SERVICES")
        model, serializer_class, output = self.specs[kind]
        data = serializer_class(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        required = {"categories": ("slug", "name"), "services": ("category_id", "slug", "name"),
                    "packages": ("service_id", "name", "pricing_model", "duration_minutes", "skill_code")}[kind]
        if any(not values.get(field) for field in required):
            raise serializers.ValidationError({"required": list(required)})
        if kind == "services":
            values["category"] = get_object_or_404(Category, id=values.pop("category_id"))
            values.setdefault("summary", "")
            if "faqs" in values:
                values["faq_items"] = values.pop("faqs")
        if kind == "packages":
            values["service"] = get_object_or_404(Service, id=values.pop("service_id"))
        try:
            obj = model.objects.create(**values)
        except IntegrityError as exc:
            raise serializers.ValidationError("A record with this slug already exists.") from exc
        audit(request.user, f"CATALOG_{kind.upper()}_CREATED", model.__name__, obj.id)
        return Response(output(obj), status=201)


class CatalogDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, kind, item_id):
        require(request.user, "VIEW_ADMIN")
        model, _, output = CatalogCollectionView.specs[kind]
        return Response(output(get_object_or_404(model, id=item_id)))

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
        if "faqs" in values:
            values["faq_items"] = values.pop("faqs")
        for key, value in values.items():
            setattr(obj, key, value)
        try:
            obj.save()
        except IntegrityError as exc:
            raise serializers.ValidationError("A record with this slug already exists.") from exc
        audit(request.user, f"CATALOG_{kind.upper()}_UPDATED", model.__name__, obj.id, {"fields": list(values)})
        return Response(output(obj))

    def delete(self, request, kind, item_id):
        require(request.user, "MANAGE_SERVICES")
        model, _, _ = CatalogCollectionView.specs[kind]
        obj = get_object_or_404(model, id=item_id)
        oid = obj.id
        try:
            with transaction.atomic():
                if kind == "services":
                    obj.images.all().delete()
                obj.delete()
        except ProtectedError as exc:
            raise serializers.ValidationError(
                "Cannot delete this item while active bookings, leads, packages, or sub-services depend on it. Deactivate it instead."
            ) from exc
        audit(request.user, f"CATALOG_{kind.upper()}_DELETED", model.__name__, oid)
        return Response(status=204)


def _validate_and_upload_catalog_image(request):
    upload = request.FILES.get("file") or request.FILES.get("image")
    if not upload or upload.size < 1 or upload.size > 5 * 1024 * 1024:
        raise serializers.ValidationError("Choose an image under 5 MB.")
    head = upload.read(16)
    upload.seek(0)
    mime = ("image/jpeg" if head.startswith(b"\xff\xd8\xff") else
            "image/png" if head.startswith(b"\x89PNG\r\n\x1a\n") else
            "image/webp" if head[:4] == b"RIFF" and head[8:12] == b"WEBP" else None)
    if not mime:
        raise serializers.ValidationError("Use JPG, PNG, or WebP.")
    c_provider = CloudinaryProvider()
    cloudinary_res = None
    if c_provider.is_configured:
        try:
            cloudinary_res = c_provider.upload_image(upload, filename=upload.name)
        except CloudinaryUnavailable as exc:
            raise serializers.ValidationError("Cloudinary upload failed. Check provider credentials.") from exc
    upload.seek(0)
    return upload, mime, cloudinary_res


class AdminCategoryImageView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, category_id):
        require(request.user, "MANAGE_SERVICES")
        category = get_object_or_404(Category, id=category_id)
        slot = request.data.get("slot") or request.query_params.get("slot") or "card"
        if slot not in ("card", "banner"):
            raise serializers.ValidationError({"slot": "Use card or banner."})
        upload, _, cloudinary_res = _validate_and_upload_catalog_image(request)
        if slot == "card":
            if cloudinary_res:
                category.image_url = cloudinary_res["secure_url"]
            category.image.save(upload.name, upload, save=False)
            category.save()
            url = category.image_display or ""
        else:
            if cloudinary_res:
                category.banner_image_url = cloudinary_res["secure_url"]
            category.banner_image.save(upload.name, upload, save=False)
            category.save()
            url = category.banner_image_display or ""
        audit(request.user, f"CATEGORY_{slot.upper()}_IMAGE_UPDATED", "Category", category.id)
        return Response({"slot": slot, "url": url}, status=200)

    def delete(self, request, category_id):
        require(request.user, "MANAGE_SERVICES")
        category = get_object_or_404(Category, id=category_id)
        slot = request.query_params.get("slot") or "card"
        if slot == "card":
            if category.image:
                category.image.delete(save=False)
            category.image_url = ""
        elif slot == "banner":
            if category.banner_image:
                category.banner_image.delete(save=False)
            category.banner_image_url = ""
        else:
            raise serializers.ValidationError({"slot": "Use card or banner."})
        category.save()
        audit(request.user, f"CATEGORY_{slot.upper()}_IMAGE_CLEARED", "Category", category.id)
        return Response({"slot": slot, "url": ""})


class AdminServiceImageView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, service_id):
        require(request.user, "MANAGE_SERVICES")
        service = get_object_or_404(Service, id=service_id)
        raw_slot = request.data.get("slot") or request.query_params.get("slot") or "gallery"
        slot_aliases = {"main_image": "cover_image", "banner_image": "landing_thumbnail"}
        slot = slot_aliases.get(raw_slot, raw_slot)
        upload, mime, cloudinary_res = _validate_and_upload_catalog_image(request)

        # Presentation image slots
        if slot in ("cover_image", "landing_thumbnail", "popup_cover_image", "popup_content_image", "list_image"):
            if cloudinary_res:
                setattr(service, f"{slot}_url", cloudinary_res["secure_url"])
            field = getattr(service, slot)
            field.save(upload.name, upload, save=False)
            service.save()
            audit(request.user, f"SERVICE_{slot.upper()}_UPDATED", "Service", service.id)
            return Response({"slot": raw_slot, "url": service.get_image_url(slot) or ""}, status=200)

        # Gallery image
        image = ServiceImage.objects.create(
            service=service, file=upload, content_type=mime,
            alt_text=str(request.data.get("alt_text", ""))[:200],
            sort_order=int(request.data.get("sort_order") or service.images.count()),
            cloudinary_url=cloudinary_res["secure_url"] if cloudinary_res else "",
            cloudinary_public_id=cloudinary_res["public_id"] if cloudinary_res else "",
        )
        audit(request.user, "SERVICE_IMAGE_ADDED", "ServiceImage", image.id)
        url = image.cloudinary_url or f"/api/v1/catalog/images/{image.id}/"
        return Response({"id": str(image.id), "url": url, "alt_text": image.alt_text, "sort_order": image.sort_order}, status=201)

    def delete(self, request, service_id):
        require(request.user, "MANAGE_SERVICES")
        service = get_object_or_404(Service, id=service_id)
        image_id = request.query_params.get("image_id")
        if image_id:
            image = get_object_or_404(ServiceImage, id=image_id, service=service)
            iid = image.id
            image.delete()
            audit(request.user, "SERVICE_IMAGE_REMOVED", "ServiceImage", iid)
            return Response(status=204)
        raw_slot = request.query_params.get("slot") or ""
        slot_aliases = {"main_image": "cover_image", "banner_image": "landing_thumbnail"}
        slot = slot_aliases.get(raw_slot, raw_slot)
        if slot in ("cover_image", "landing_thumbnail", "popup_cover_image", "popup_content_image", "list_image"):
            field = getattr(service, slot)
            if field:
                field.delete(save=False)
            setattr(service, f"{slot}_url", "")
            service.save()
            audit(request.user, f"SERVICE_{slot.upper()}_CLEARED", "Service", service.id)
            return Response({"slot": raw_slot, "url": ""})
        raise serializers.ValidationError("Provide image_id or slot to delete.")


class AdminServiceImageDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, service_id, image_id):
        require(request.user, "MANAGE_SERVICES")
        image = get_object_or_404(ServiceImage, id=image_id, service_id=service_id)
        if "alt_text" in request.data:
            image.alt_text = str(request.data["alt_text"])[:200]
        if "sort_order" in request.data:
            image.sort_order = max(0, int(request.data["sort_order"]))
        if "is_active" in request.data:
            image.is_active = bool(request.data["is_active"])
        image.save()
        return Response({"id": str(image.id), "alt_text": image.alt_text, "sort_order": image.sort_order, "is_active": image.is_active})

    def delete(self, request, service_id, image_id):
        require(request.user, "MANAGE_SERVICES")
        image = get_object_or_404(ServiceImage, id=image_id, service_id=service_id)
        iid = image.id
        image.delete()
        audit(request.user, "SERVICE_IMAGE_REMOVED", "ServiceImage", iid)
        return Response(status=204)


class PriceInput(serializers.Serializer):
    package_id = serializers.UUIDField(required=False)
    zone_id = serializers.UUIDField(required=False)
    base_paise = serializers.IntegerField(min_value=0, required=False)
    inspection_paise = serializers.IntegerField(min_value=0, required=False)
    fee_paise = serializers.IntegerField(min_value=0, required=False)
    tax_paise = serializers.IntegerField(min_value=0, required=False)
    payment_policy = serializers.ChoiceField(choices=["PREPAID", "PAY_AT_VISIT", "ADVANCE"], required=False)
    advance_type = serializers.ChoiceField(choices=["NONE", "PERCENTAGE", "FIXED"], required=False)
    advance_percentage = serializers.IntegerField(min_value=0, max_value=100, required=False)
    advance_amount_paise = serializers.IntegerField(min_value=0, required=False)
    is_active = serializers.BooleanField(required=False)
    cancellation_cutoff_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    reschedule_cutoff_minutes = serializers.IntegerField(min_value=0, required=False, allow_null=True)


def validate_price(values, package):
    if values.get("tax_paise") and not PlatformSetting.objects.filter(key="approved_tax_policy", value__approved=True).exists():
        raise serializers.ValidationError("Approved tax policy is required before setting tax.")
    if values.get("base_paise", 0) > 0 and values.get("inspection_paise", 0) > 0:
        raise serializers.ValidationError("Choose fixed or inspection pricing, not both.")
    if values.get("base_paise", 0) == 0 and values.get("inspection_paise", 0) == 0:
        raise serializers.ValidationError("A base or inspection charge is required.")
    if (package.pricing_model == "FIXED_PRICE" and values.get("base_paise", 0) <= 0) or (
            package.pricing_model == "INSPECTION_BASED" and values.get("inspection_paise", 0) <= 0):
        raise serializers.ValidationError("Price must match the package pricing model.")
    total = (values.get("base_paise", 0) + values.get("inspection_paise", 0)
             + values.get("fee_paise", 0) + values.get("tax_paise", 0))
    if values.get("payment_policy") == "ADVANCE":
        adv_type = values.get("advance_type", "NONE")
        if adv_type not in ("PERCENTAGE", "FIXED"):
            raise serializers.ValidationError("Advance payment requires advance_type to be PERCENTAGE or FIXED.")
        if adv_type == "PERCENTAGE":
            pct = values.get("advance_percentage", 0)
            if pct <= 0 or pct > 100:
                raise serializers.ValidationError("Advance percentage must be between 1 and 100.")
        elif adv_type == "FIXED":
            amt = values.get("advance_amount_paise", 0)
            if amt <= 0:
                raise serializers.ValidationError("Advance amount must be greater than zero.")
            if total > 0 and amt > total:
                raise serializers.ValidationError("Advance amount cannot exceed total price.")
    elif values.get("payment_policy") in ("PREPAID", "PAY_AT_VISIT"):
        values["advance_type"] = "NONE"
        values["advance_percentage"] = 0
        values["advance_amount_paise"] = 0


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
                  "tax_paise": 0, "payment_policy": "PAY_AT_VISIT",
                  "advance_type": "NONE", "advance_percentage": 0, "advance_amount_paise": 0,
                  "is_active": False, **v}
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
        with transaction.atomic():
            ref = get_object_or_404(PricingRule.objects.values("package_id"), id=price_id)
            ServicePackage.objects.select_for_update().get(id=ref["package_id"])
            old = get_object_or_404(PricingRule.objects.select_for_update(), id=price_id)
            pkg_arg = data.validated_data.get("package_id")
            zone_arg = data.validated_data.get("zone_id")
            if (pkg_arg and pkg_arg != old.package_id) or (zone_arg and zone_arg != old.zone_id):
                raise serializers.ValidationError("Create a separate price for a different package or zone.")
            latest = PricingRule.objects.filter(package=old.package, zone=old.zone).aggregate(v=Max("version"))["v"]
            if old.version != latest:
                raise serializers.ValidationError("Price changed. Refresh before editing.")
            v = {field: getattr(old, field) for field in ("base_paise", "inspection_paise", "fee_paise",
                "tax_paise", "payment_policy", "advance_type", "advance_percentage", "advance_amount_paise",
                "is_active", "cancellation_cutoff_minutes", "reschedule_cutoff_minutes")}
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
