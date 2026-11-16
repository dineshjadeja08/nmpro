"""Field work: live GPS sharing while travelling, and collecting payment at the visit."""
from datetime import timedelta
from decimal import Decimal
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.audit.models import AuditLog
from domains.bookings.models import Booking

from .models import JobAssignment, JobOffer
from .services import JobConflict, profile_for

SHARING_STATUSES = ("EN_ROUTE",)
LOCATION_FRESH_FOR = timedelta(minutes=10)
MIN_PING_SECONDS = 5
COLLECTABLE_JOB_STATUSES = ("IN_PROGRESS", "SERVICE_COMPLETED")


class LocationInput(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=Decimal("-90"), max_value=Decimal("90"))
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, min_value=Decimal("-180"),
                                         max_value=Decimal("180"))
    accuracy_m = serializers.IntegerField(min_value=0, max_value=100_000, required=False, allow_null=True)


class TechnicianLocationView(APIView):
    """The technician app posts its position every few seconds while on the way."""
    permission_classes = [IsAuthenticated]

    def post(self, request, job_id):
        data = LocationInput(data=request.data)
        data.is_valid(raise_exception=True)
        profile = profile_for(request.user, verified=True)
        job = get_object_or_404(JobAssignment, id=job_id, technician=profile)
        if job.status not in SHARING_STATUSES:
            raise JobConflict("Location is shared only while you are on the way.")
        now = timezone.now()
        if job.last_location_at and (now - job.last_location_at).total_seconds() < MIN_PING_SECONDS:
            return Response({"accepted": False, "reason": "too_frequent"})
        job.last_latitude = data.validated_data["latitude"]
        job.last_longitude = data.validated_data["longitude"]
        job.last_accuracy_m = data.validated_data.get("accuracy_m")
        job.last_location_at = now
        job.save(update_fields=["last_latitude", "last_longitude", "last_accuracy_m", "last_location_at", "updated_at"])
        return Response({"accepted": True})


class CustomerTechnicianLocationView(APIView):
    """The customer's booking tracker reads the technician's last position while they are on the way."""
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        booking = get_object_or_404(Booking, id=booking_id, user=request.user)
        job = getattr(booking, "technician_assignment", None)
        address = booking.address
        destination = ({"latitude": float(address.latitude), "longitude": float(address.longitude)}
                       if address and address.latitude is not None and address.longitude is not None else None)
        fresh = bool(job and job.status in SHARING_STATUSES and job.last_location_at
                     and timezone.now() - job.last_location_at <= LOCATION_FRESH_FOR)
        if not fresh:
            return Response({"sharing": False, "status": job.status if job else None, "destination": destination})
        return Response({"sharing": True, "status": job.status, "latitude": float(job.last_latitude),
                         "longitude": float(job.last_longitude), "accuracy_m": job.last_accuracy_m,
                         "updated_at": job.last_location_at, "destination": destination})


@receiver(post_save, sender=JobAssignment, dispatch_uid="clear_location_after_travel")
def clear_location_after_travel(sender, instance, **kwargs):
    if instance.status not in SHARING_STATUSES and instance.last_location_at:
        JobAssignment.objects.filter(id=instance.id).update(
            last_latitude=None, last_longitude=None, last_accuracy_m=None, last_location_at=None)


@receiver(post_save, sender=JobOffer, dispatch_uid="push_new_job_offer")
def push_new_job_offer(sender, instance, created, **kwargs):
    if not created or instance.status != "OFFERED":
        return
    offer_id, user_id = instance.id, instance.technician.user_id

    def send():
        from domains.notifications.webpush import send_to_user

        offer = JobOffer.objects.select_related("booking__service", "booking__slot__zone").filter(id=offer_id).first()
        if not offer:
            return
        send_to_user(user_id, {
            "type": "JOB_OFFER", "offer_id": str(offer.id), "title": "New job offer",
            "body": f"{offer.booking.service.name} · {offer.booking.slot.zone.name}",
            "expires_at": offer.expires_at.isoformat() if offer.expires_at else None, "url": "/dashboard",
        })

    transaction.on_commit(send)


def amount_due(booking):
    """What the technician should collect at the visit, with a breakdown."""
    snapshot = booking.price_snapshot
    if booking.payment_status == "ADVANCE_PAID":
        service_due = snapshot.remaining_balance_paise or 0
    elif booking.payment_status == "UNPAID" and snapshot.payment_policy == "PAY_AT_VISIT":
        service_due = snapshot.total_paise
    else:
        service_due = 0
    job = getattr(booking, "technician_assignment", None)
    extra = 0
    if job:
        extra = job.quotations.filter(status="APPROVED").aggregate(t=Sum("total_paise"))["t"] or 0
    already_extra = booking.payments.filter(status="CAPTURED", payment_type="EXTRA_WORK").aggregate(
        t=Sum("amount_paise"))["t"] or 0
    extra_due = max(0, extra - already_extra)
    return {"service_due_paise": service_due, "extra_work_due_paise": extra_due,
            "total_due_paise": service_due + extra_due}


def upi_uri(booking, amount_paise):
    if not settings.UPI_PAYEE_VPA or amount_paise <= 0:
        return ""
    return "upi://pay?" + urlencode({"pa": settings.UPI_PAYEE_VPA, "pn": settings.UPI_PAYEE_NAME,
                                     "am": f"{amount_paise / 100:.2f}", "cu": "INR",
                                     "tn": f"NammaPros {booking.reference}", "tr": booking.reference})


class CollectInput(serializers.Serializer):
    method = serializers.ChoiceField(choices=["CASH", "UPI"])
    amount_paise = serializers.IntegerField(min_value=1)
    upi_reference = serializers.CharField(max_length=40, required=False, allow_blank=True)


class TechnicianCollectView(APIView):
    """GET shows what to collect (and a UPI link); POST records cash/UPI received by the assigned technician."""
    permission_classes = [IsAuthenticated]

    def _job(self, request, job_id, lock=False):
        profile = profile_for(request.user, verified=True)
        qs = JobAssignment.objects.select_related("booking__price_snapshot")
        if lock:
            qs = qs.select_for_update()
        return get_object_or_404(qs, id=job_id, technician=profile)

    def get(self, request, job_id):
        job = self._job(request, job_id)
        due = amount_due(job.booking)
        return Response({**due, "payment_status": job.booking.payment_status,
                         "can_collect": job.status in COLLECTABLE_JOB_STATUSES and due["total_due_paise"] > 0,
                         "upi_uri": upi_uri(job.booking, due["total_due_paise"]),
                         "upi_payee": settings.UPI_PAYEE_VPA})

    def post(self, request, job_id):
        from domains.notifications.models import OutboxEvent
        from domains.payments.models import Payment

        data = CollectInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        with transaction.atomic():
            job = self._job(request, job_id, lock=True)
            booking = Booking.objects.select_for_update().get(id=job.booking_id)
            if job.status not in COLLECTABLE_JOB_STATUSES:
                raise JobConflict("Collect payment after the work has started.")
            due = amount_due(booking)
            if due["total_due_paise"] <= 0:
                raise JobConflict("Nothing is due for this booking.")
            if values["amount_paise"] != due["total_due_paise"]:
                raise JobConflict("The amount due has changed. Refresh and try again.")
            now = timezone.now()
            parts = [("BALANCE", due["service_due_paise"]), ("EXTRA_WORK", due["extra_work_due_paise"])]
            for kind, amount in parts:
                if amount <= 0:
                    continue
                Payment.objects.create(
                    booking=booking, provider_payment_id=f"visit_{kind.lower()}_{booking.id}_{int(now.timestamp())}",
                    amount_paise=amount, currency="INR", status="CAPTURED", payment_type=kind,
                    payment_method=values["method"], verified_at=now)
            if due["service_due_paise"] > 0:
                booking.payment_status = "PAID"
            booking.offline_collected_paise = (booking.offline_collected_paise or 0) + due["total_due_paise"]
            booking.version += 1
            booking.save(update_fields=["payment_status", "offline_collected_paise", "version", "updated_at"])
            AuditLog.objects.create(actor=request.user, action="PAYMENT_COLLECTED_AT_VISIT", resource_type="Booking",
                                    resource_id=str(booking.id),
                                    metadata={"method": values["method"], "amount_paise": due["total_due_paise"],
                                              "upi_reference": values.get("upi_reference", "")})
            OutboxEvent.objects.create(event_type="PAYMENT_SUCCESS", aggregate_id=booking.id,
                                       payload={"booking_id": str(booking.id), "type": "VISIT",
                                                "method": values["method"]})
        return Response({"collected_paise": due["total_due_paise"], "payment_status": booking.payment_status})
