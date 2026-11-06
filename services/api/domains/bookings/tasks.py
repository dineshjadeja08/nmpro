from celery import shared_task
from django.db import transaction
from django.utils import timezone

from domains.notifications.models import OutboxEvent

from .models import Booking, BookingStatusEvent, SlotHold


@shared_task
def cleanup_expired_holds():
    return SlotHold.objects.filter(status="ACTIVE", expires_at__lte=timezone.now()).update(status="EXPIRED")


@shared_task
def expire_unpaid_bookings():
    count = 0
    ids = Booking.objects.filter(status="AWAITING_PAYMENT", payment_expires_at__lte=timezone.now()).values_list("id", flat=True)[:500]
    for booking_id in ids:
        with transaction.atomic():
            booking = Booking.objects.select_for_update().get(id=booking_id)
            if booking.status != "AWAITING_PAYMENT" or booking.payment_expires_at > timezone.now():
                continue
            booking.status = "EXPIRED"
            booking.version += 1
            booking.save(update_fields=["status", "version", "updated_at"])
            BookingStatusEvent.objects.create(booking=booking, from_status="AWAITING_PAYMENT", to_status="EXPIRED",
                                              actor=None, reason="Payment deadline passed")
            OutboxEvent.objects.create(event_type="BOOKING_PAYMENT_EXPIRED", aggregate_id=booking.id,
                                       payload={"booking_id": str(booking.id)})
            count += 1
    return count
