import hashlib

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from domains.audit.models import AuditLog
from domains.bookings.models import AppointmentSlot, Booking, BookingStatusEvent
from domains.bookings.services import Conflict
from domains.notifications.models import OutboxEvent

from .models import Payment, PaymentEvent, PaymentIntent, ReconciliationException
from .providers.razorpay import PaymentUnavailable, RazorpayProvider


def get_provider():
    return RazorpayProvider()


def _valid_order_data(data, amount):
    return (isinstance(data, dict) and isinstance(data.get("id"), str)
            and data.get("amount") == amount and data.get("currency") == "INR")


def create_payment_order(user, booking_id, key):
    if not key or len(key) > 128:
        raise Conflict("A valid Idempotency-Key header is required.")
    if not settings.RAZORPAY_ENABLED:
        raise PaymentUnavailable()
    with transaction.atomic():
        booking = Booking.objects.select_for_update().select_related("price_snapshot").filter(
            id=booking_id, user=user).first()
        if not booking or booking.price_snapshot.payment_policy != "PREPAID":
            raise Conflict("This booking cannot be paid online.")
        if booking.status != "AWAITING_PAYMENT" or booking.payment_expires_at <= timezone.now():
            raise Conflict("The payment window has closed.")
        existing_key = PaymentIntent.objects.filter(customer=user, idempotency_key=key).first()
        if existing_key and existing_key.booking_id != booking.id:
            raise Conflict("This idempotency key belongs to a different booking.")
        order = PaymentIntent.objects.select_for_update().filter(booking=booking).first()
        if order:
            if order.status == "CREATED" and order.provider_order_id:
                if order.checkout_started_at and booking.payment_status != "FAILED":
                    raise Conflict("Your payment is being verified. Please do not pay again yet.")
                order.checkout_started_at = timezone.now()
                order.save(update_fields=["checkout_started_at", "updated_at"])
                if booking.payment_status == "FAILED":
                    booking.payment_status = "PENDING"
                    booking.version += 1
                    booking.save(update_fields=["payment_status", "version", "updated_at"])
                return order
            raise Conflict("Payment order creation needs review. Please contact support.")
        order = PaymentIntent.objects.create(
            booking=booking, customer=user, amount_paise=booking.price_snapshot.total_paise,
            currency="INR", status="CREATING", idempotency_key=key,
            expires_at=booking.payment_expires_at)
    try:
        remote = get_provider().create_order(order.amount_paise, booking.reference)
    except Exception as exc:
        raise PaymentUnavailable() from exc
    if not _valid_order_data(remote, order.amount_paise):
        raise PaymentUnavailable("Payment provider returned an invalid order.")
    expired = False
    with transaction.atomic():
        order = PaymentIntent.objects.select_for_update().get(id=order.id)
        booking = Booking.objects.select_for_update().get(id=order.booking_id)
        if booking.status != "AWAITING_PAYMENT" or booking.payment_expires_at <= timezone.now():
            order.provider_order_id = remote["id"]
            order.status = "EXPIRED"
            order.save(update_fields=["provider_order_id", "status", "updated_at"])
            expired = True
        else:
            order.provider_order_id = remote["id"]
            order.status = "CREATED"
            order.checkout_started_at = timezone.now()
            order.save(update_fields=["provider_order_id", "status", "checkout_started_at", "updated_at"])
    if expired:
        raise Conflict("The payment window has closed.")
    return order


def record_captured_payment(order_id, payment_id):
    if not order_id or not payment_id:
        raise Conflict("Payment identifiers are required.")
    try:
        remote = get_provider().fetch_payment(payment_id)
    except Exception as exc:
        raise PaymentUnavailable() from exc
    if not isinstance(remote, dict) or remote.get("id") != payment_id or remote.get("order_id") != order_id:
        raise Conflict("Payment provider details do not match the order.")
    with transaction.atomic():
        order_ref = PaymentIntent.objects.filter(provider_order_id=order_id).values("booking__slot_id").first()
        if not order_ref:
            raise Conflict("Unknown payment order.")
        AppointmentSlot.objects.select_for_update().get(id=order_ref["booking__slot_id"])
        order = PaymentIntent.objects.select_for_update().select_related("booking").filter(
            provider_order_id=order_id).first()
        if not order:
            raise Conflict("Unknown payment order.")
        booking = Booking.objects.select_for_update().get(id=order.booking_id)
        if (remote.get("amount") != order.amount_paise or remote.get("currency") != order.currency
                or remote.get("status") != "captured"):
            raise Conflict("Payment has not been captured for the quoted amount.")
        existing = Payment.objects.filter(provider_payment_id=payment_id).first()
        if existing:
            if existing.payment_order_id != order.id:
                raise Conflict("Payment identifier belongs to another order.")
            if existing.status == "CAPTURED":
                return booking
            existing.status = "CAPTURED"
            existing.verified_at = timezone.now()
            existing.save(update_fields=["status", "verified_at", "updated_at"])
            payment = existing
        else:
            payment = Payment.objects.create(
                booking=booking, payment_order=order, provider_payment_id=payment_id,
                amount_paise=order.amount_paise, currency=order.currency,
                status="CAPTURED", verified_at=timezone.now())
        order.status = "PAID"
        order.save(update_fields=["status", "updated_at"])
        now = timezone.now()
        if booking.status == "AWAITING_PAYMENT" and booking.payment_expires_at > now:
            booking.status = "CONFIRMED"
            booking.payment_status = "PAID"
            booking.confirmed_at = now
            booking.version += 1
            booking.save(update_fields=["status", "payment_status", "confirmed_at", "version", "updated_at"])
            BookingStatusEvent.objects.create(booking=booking, from_status="AWAITING_PAYMENT",
                                              to_status="CONFIRMED", actor=None, reason="Provider verified capture")
            OutboxEvent.objects.create(event_type="BOOKING_CONFIRMED", aggregate_id=booking.id,
                                       payload={"booking_id": str(booking.id)})
            OutboxEvent.objects.create(event_type="PAYMENT_SUCCESS", aggregate_id=booking.id,
                                       payload={"booking_id": str(booking.id)})
        elif booking.status == "CONFIRMED" and booking.payment_status == "PAID":
            ReconciliationException.objects.get_or_create(
                fingerprint=f"duplicate-capture:{payment_id}", defaults={
                    "booking": booking, "payment": payment, "exception_type": "DUPLICATE_CAPTURE_FOR_ORDER"})
        else:
            booking.payment_status = "REFUND_PENDING"
            booking.version += 1
            booking.save(update_fields=["payment_status", "version", "updated_at"])
            ReconciliationException.objects.get_or_create(
                fingerprint=f"late-capture:{payment_id}", defaults={
                    "booking": booking, "payment": payment, "exception_type": "CAPTURE_AFTER_PAYMENT_WINDOW"})
        AuditLog.objects.create(actor=None, action="PAYMENT_CAPTURE_VERIFIED", resource_type="Payment",
                                resource_id=str(payment.id), metadata={"booking_id": str(booking.id)})
        return booking


def record_failed_payment(order_id, payment_id):
    if not order_id or not payment_id:
        raise Conflict("Payment identifiers are required.")
    try:
        remote = get_provider().fetch_payment(payment_id)
    except Exception as exc:
        raise PaymentUnavailable() from exc
    if (not isinstance(remote, dict) or remote.get("id") != payment_id
            or remote.get("order_id") != order_id or remote.get("status") != "failed"):
        raise Conflict("Provider failure evidence does not match.")
    with transaction.atomic():
        order = PaymentIntent.objects.select_for_update().filter(provider_order_id=order_id).first()
        if not order or remote.get("amount") != order.amount_paise or remote.get("currency") != order.currency:
            raise Conflict("Failed payment does not match an internal order.")
        booking = Booking.objects.select_for_update().get(id=order.booking_id)
        if not Payment.objects.filter(provider_payment_id=payment_id).exists():
            Payment.objects.create(booking=booking, payment_order=order, provider_payment_id=payment_id,
                                   amount_paise=order.amount_paise, currency=order.currency,
                                   status="FAILED", verified_at=timezone.now())
        if booking.status == "AWAITING_PAYMENT" and booking.payment_status != "FAILED":
            booking.payment_status = "FAILED"
            booking.version += 1
            booking.save(update_fields=["payment_status", "version", "updated_at"])
            OutboxEvent.objects.create(event_type="PAYMENT_FAILED", aggregate_id=booking.id,
                                       payload={"booking_id": str(booking.id)})
    return booking


def record_webhook_event(event_id, event_type, raw_body, payment_id, order_id):
    if (not isinstance(event_id, str) or not event_id or len(event_id) > 100
            or not isinstance(event_type, str) or not event_type or len(event_type) > 60):
        raise Conflict("Invalid webhook identifiers.")
    if not all(isinstance(value, str) and len(value) <= 100 for value in (payment_id, order_id)):
        raise Conflict("Invalid webhook payment identifiers.")
    event, _ = PaymentEvent.objects.get_or_create(
        provider_event_id=event_id,
        defaults={"event_type": event_type, "payload_hash": hashlib.sha256(raw_body).hexdigest(),
                  "provider_payment_id": payment_id or "", "provider_order_id": order_id or ""})
    if event.payload_hash != hashlib.sha256(raw_body).hexdigest():
        raise Conflict("Webhook event identifier was reused with different content.")
    return event


def process_payment_event(event):
    if event.processing_status == "PROCESSED":
        return
    if event.event_type == "payment.captured" and event.provider_payment_id and event.provider_order_id:
        record_captured_payment(event.provider_order_id, event.provider_payment_id)
    elif event.event_type == "payment.failed" and event.provider_payment_id and event.provider_order_id:
        record_failed_payment(event.provider_order_id, event.provider_payment_id)
    else:
        ReconciliationException.objects.get_or_create(
            fingerprint=f"webhook-review:{event.provider_event_id}",
            defaults={"exception_type": "UNHANDLED_PAYMENT_EVENT", "severity": "MEDIUM"})
    event.processing_status = "PROCESSED"
    event.processed_at = timezone.now()
    event.save(update_fields=["processing_status", "processed_at", "updated_at"])
