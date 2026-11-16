"""Personal data rights (DPDP Act 2023): copy of my data, account deletion, and KYC file retention.

Deletion anonymises personal details but keeps booking, payment, invoice and audit records that
tax and accounting law require (those rows lose any link to a name, phone or address).
"""
import uuid
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.audit.models import AuditLog

from .models import CustomerProfile, DataRequest

OPEN_BOOKING_STATUSES = ("REQUESTED", "AWAITING_PAYMENT", "CONFIRMED", "CONFIRMED_UNPAID", "TECHNICIAN_ASSIGNED",
                         "TECHNICIAN_EN_ROUTE", "TECHNICIAN_ARRIVED", "IN_PROGRESS")
KYC_KINDS = ("IDENTITY", "ADDRESS", "CERTIFICATION", "PROFILE_PHOTO")


def export_user_data(user):
    from domains.bookings.models import Booking
    from domains.catalog.models import Review
    from domains.locations.models import Address
    from domains.technicians.models import TechnicianProfile

    profile = CustomerProfile.objects.filter(user=user).first()
    data = {
        "exported_at": timezone.now(),
        "account": {"phone": user.phone_e164, "first_name": user.first_name, "last_name": user.last_name,
                    "email": user.email, "joined": user.date_joined,
                    "full_name": profile.full_name if profile else "",
                    "alternate_phone": profile.alternate_phone if profile else ""},
        "addresses": [{"label": a.label, "line_1": a.line_1, "locality": a.locality, "city": a.city,
                       "postal_code": a.postal_code, "landmark": a.landmark}
                      for a in Address.objects.filter(user=user, archived_at__isnull=True)],
        "bookings": [{"reference": b.reference, "service": b.service.name, "status": b.status,
                      "slot_start": b.slot.start_at if b.slot_id else None, "problem_description": b.problem_description,
                      "total_paise": getattr(getattr(b, "price_snapshot", None), "total_paise", None),
                      "created_at": b.created_at}
                     for b in Booking.objects.filter(user=user).select_related("service", "slot")],
        "reviews": [{"service": r.service.name, "rating": r.rating, "comment": r.comment, "created_at": r.created_at}
                    for r in Review.objects.filter(customer=user).select_related("service")],
    }
    tech = TechnicianProfile.objects.filter(user=user).prefetch_related("skills", "documents").first()
    if tech:
        data["partner_profile"] = {
            "display_name": tech.display_name, "city": tech.city, "status": tech.verification_status,
            "skills": [s.code for s in tech.skills.all()],
            "documents": [{"kind": d.kind, "status": d.status, "uploaded": d.created_at} for d in tech.documents.all()],
        }
    return data


def _purge_document_files(documents):
    count = 0
    for doc in documents:
        if doc.file and getattr(doc.file, "name", ""):
            doc.file.delete(save=False)
        doc.file = None
        doc.status = "PURGED"
        doc.save(update_fields=["file", "status", "updated_at"])
        count += 1
    return count


@transaction.atomic
def anonymize_user(user, actor):
    """Remove personal details from an account. Refuses while a visit is still open."""
    from domains.bookings.models import Booking
    from domains.catalog.models import Review
    from domains.locations.models import Address
    from domains.notifications.models import DeviceToken, NotificationPreference, WebPushSubscription
    from domains.technicians.models import TechnicianProfile

    if Booking.objects.filter(user=user, status__in=OPEN_BOOKING_STATUSES).exists():
        raise serializers.ValidationError("This account has an open booking. Complete or cancel it first.")
    tech = TechnicianProfile.objects.filter(user=user).first()
    if tech and tech.assignments.exclude(status__in=["SERVICE_COMPLETED", "CANCELLED"]).exists():
        raise serializers.ValidationError("This partner still has assigned jobs. Reassign them first.")

    tag = uuid.uuid4().hex[:12]
    Address.objects.filter(user=user).update(
        contact_name="", contact_phone="", house_flat="", street="", landmark="", line_1="[deleted]",
        latitude=None, longitude=None)
    CustomerProfile.objects.filter(user=user).update(full_name="", alternate_phone="", support_notes="")
    Review.objects.filter(customer=user).update(comment="", is_visible=False)
    DeviceToken.objects.filter(user=user).delete()
    WebPushSubscription.objects.filter(user=user).delete()
    NotificationPreference.objects.filter(user=user).delete()
    if tech:
        _purge_document_files(tech.documents.filter(kind__in=KYC_KINDS))
        tech.display_name = "Deleted partner"
        tech.bio = ""
        tech.is_active = False
        tech.is_online = False
        tech.app_login_enabled = False
        for field in ("alternate_phone", "virtual_mobile_number", "email", "address", "pincode", "id_proof_number",
                      "internal_notes"):
            if hasattr(tech, field):
                setattr(tech, field, "")
        tech.save()
    user.phone_e164 = None
    user.username = f"deleted-{tag}"
    user.first_name = ""
    user.last_name = ""
    user.email = ""
    user.is_active = False
    user.set_unusable_password()
    user.save()
    AuditLog.objects.create(actor=actor, action="ACCOUNT_ANONYMISED", resource_type="User", resource_id=str(user.pk))


class MyDataExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        DataRequest.objects.create(user=request.user, phone_e164=request.user.phone_e164 or "", kind="EXPORT",
                                   status="COMPLETED", completed_at=timezone.now())
        response = Response(export_user_data(request.user))
        response["Content-Disposition"] = 'attachment; filename="nammapros-my-data.json"'
        return response


class DeletionRequestInput(serializers.Serializer):
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class MyDataRequestsView(APIView):
    """GET: my requests. POST: ask for my account to be deleted."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = DataRequest.objects.filter(user=request.user).order_by("-created_at")[:20]
        return Response({"results": [{"id": str(r.id), "kind": r.kind, "status": r.status, "created_at": r.created_at,
                                      "completed_at": r.completed_at, "note": r.resolution_note} for r in rows],
                         "deletion_days": settings.DATA_DELETION_DAYS})

    def post(self, request):
        data = DeletionRequestInput(data=request.data)
        data.is_valid(raise_exception=True)
        existing = DataRequest.objects.filter(user=request.user, kind="DELETE", status="RECEIVED").first()
        if existing:
            return Response({"id": str(existing.id), "status": existing.status}, status=200)
        req = DataRequest.objects.create(user=request.user, phone_e164=request.user.phone_e164 or "", kind="DELETE",
                                         reason=data.validated_data["reason"])
        AuditLog.objects.create(actor=request.user, action="ACCOUNT_DELETION_REQUESTED", resource_type="DataRequest",
                                resource_id=str(req.id))
        return Response({"id": str(req.id), "status": req.status}, status=201)


class AdminDataRequestsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from domains.administration.rbac import require

        require(request.user, "MANAGE_STAFF")
        rows = DataRequest.objects.filter(kind="DELETE").order_by("status", "-created_at")[:200]
        return Response({"results": [{"id": str(r.id), "phone": r.phone_e164, "status": r.status, "reason": r.reason,
                                      "created_at": r.created_at, "completed_at": r.completed_at,
                                      "due_by": r.created_at + timedelta(days=settings.DATA_DELETION_DAYS),
                                      "note": r.resolution_note} for r in rows]})


class AdminDataRequestActionInput(serializers.Serializer):
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AdminDataRequestActionView(APIView):
    """POST .../complete/ anonymises the account; POST .../reject/ records why (e.g. open dues)."""
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id, action):
        from domains.administration.rbac import require

        require(request.user, "MANAGE_STAFF")
        if action not in ("complete", "reject"):
            raise serializers.ValidationError("Use complete or reject.")
        data = AdminDataRequestActionInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            req = get_object_or_404(DataRequest.objects.select_for_update(), id=request_id, kind="DELETE")
            if req.status != "RECEIVED":
                raise serializers.ValidationError("This request is already closed.")
            if action == "complete" and req.user is not None:
                anonymize_user(req.user, request.user)
            req.status = "COMPLETED" if action == "complete" else "REJECTED"
            req.resolution_note = data.validated_data["note"]
            req.completed_at = timezone.now()
            req.handled_by = request.user
            req.phone_e164 = "" if action == "complete" else req.phone_e164
            req.save()
        return Response({"id": str(req.id), "status": req.status})


@shared_task
def purge_expired_kyc_documents():
    """Delete KYC files kept longer than the retention period (rejected applicants, partners who left)."""
    from domains.technicians.models import TechnicianDocument

    now = timezone.now()
    rejected = TechnicianDocument.objects.filter(
        kind__in=KYC_KINDS, technician__verification_status="REJECTED",
        technician__updated_at__lt=now - timedelta(days=settings.KYC_RETENTION_REJECTED_DAYS)).exclude(status="PURGED")
    offboarded = TechnicianDocument.objects.filter(
        kind__in=KYC_KINDS, technician__verification_status="SUSPENDED", technician__is_active=False,
        technician__updated_at__lt=now - timedelta(days=settings.KYC_RETENTION_OFFBOARDED_DAYS)).exclude(status="PURGED")
    return _purge_document_files(list(rejected)) + _purge_document_files(list(offboarded))
