"""Values filled into MSG91 WhatsApp/SMS templates.

Each event's approved template uses the variables below, in this order:
WhatsApp body_1, body_2, ... and SMS flow variables named in SMS_VARIABLE_NAMES_JSON (default VAR1, VAR2, ...).
Override the order per event with MESSAGE_VARIABLES_JSON, e.g. {"TECHNICIAN_ASSIGNED": ["technician_name", "booking_reference"]}.
"""
import json
import os
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

DEFAULT_VARIABLES = {
    # Customer
    "BOOKING_CONFIRMED": ["booking_reference", "service", "visit_date", "visit_time"],
    "BOOKING_PAYMENT_PENDING": ["booking_reference", "service"],
    "PAYMENT_SUCCESS": ["booking_reference", "service"],
    "TECHNICIAN_ASSIGNED": ["booking_reference", "technician_name", "technician_phone", "visit_date", "visit_time"],
    "TECHNICIAN_REASSIGNED": ["booking_reference", "technician_name", "technician_phone", "visit_date", "visit_time"],
    "TECHNICIAN_EN_ROUTE": ["booking_reference", "technician_name", "technician_phone"],
    "TECHNICIAN_ARRIVED": ["booking_reference", "technician_name"],
    "JOB_COMPLETED": ["booking_reference", "service"],
    "REVIEW_REQUEST": ["booking_reference", "service", "review_link"],
    "COMPLAINT_RECEIVED": ["booking_reference", "complaint_reference"],
    # Technician
    "TECHNICIAN_JOB_ASSIGNED": ["booking_reference", "service", "visit_date", "visit_time", "customer_area"],
    "TECHNICIAN_APP_ACCESS_ENABLED": ["technician_name", "app_link"],
    "TECHNICIAN_JOINING_FEE_PAID": ["technician_name", "membership_valid_until"],
}
MAX_VALUE_LENGTH = 60


def _variables_for(event):
    try:
        override = json.loads(os.getenv("MESSAGE_VARIABLES_JSON", "{}"))
    except ValueError:
        override = {}
    return override.get(event) or DEFAULT_VARIABLES.get(event) or ["booking_reference"]


def _clean(value):
    text = " ".join(str(value or "").split())
    return text[:MAX_VALUE_LENGTH] or "-"


def message_values(notification):
    """Ordered template values for one queued notification, read fresh at send time."""
    booking = notification.booking
    recipient = notification.recipient
    data = {"booking_reference": notification.payload.get("booking_reference", "")}
    data.update({k: v for k, v in (notification.payload or {}).items() if isinstance(v, (str, int))})
    site = os.getenv("PUBLIC_SITE_URL", "https://nammapros.in").rstrip("/")
    data["app_link"] = os.getenv("PARTNER_APP_URL", f"{site}/partner").rstrip("/")
    if booking is not None:
        start = timezone.localtime(booking.slot.start_at) if booking.slot_id else None
        data.update({
            "service": booking.service.name,
            "visit_date": start.strftime("%d %b %Y") if start else "",
            "visit_time": start.strftime("%I:%M %p").lstrip("0") if start else "",
            "customer_area": booking.address.locality if booking.address_id else "",
            "review_link": f"{site}/bookings/{booking.id}?review=1",
        })
        assignment = getattr(booking, "technician_assignment", None)
        if assignment is not None:
            data["technician_name"] = assignment.technician.display_name
            data["technician_phone"] = assignment.technician.user.phone_e164 or ""
    tech = getattr(recipient, "technicianprofile", None) if recipient is not None else None
    if tech is not None:
        data.setdefault("technician_name", tech.display_name)
        fee = getattr(tech, "joining_fee", None)
        if fee is not None and fee.valid_until:
            data["membership_valid_until"] = timezone.localtime(fee.valid_until).strftime("%d %b %Y")
    return [_clean(data.get(name, "")) for name in _variables_for(notification.template_key)]


@shared_task
def queue_review_requests():
    """Ask customers for a review a couple of hours after the job is done (once per booking)."""
    from domains.bookings.models import Booking

    from .models import Notification, NotificationPreference
    from .tasks import resolve_default_channel

    now = timezone.now()
    due = (Booking.objects.filter(status__in=["COMPLETED", "CLOSED"], review__isnull=True,
                                  technician_assignment__completed_at__lte=now - timedelta(hours=2),
                                  technician_assignment__completed_at__gte=now - timedelta(days=3))
           .exclude(notification__event="REVIEW_REQUEST").select_related("user")[:200])
    created = 0
    for booking in due:
        pref = NotificationPreference.objects.filter(user=booking.user).first()
        Notification.objects.create(recipient=booking.user, booking=booking, channel=resolve_default_channel(pref),
                                    event="REVIEW_REQUEST", template_key="REVIEW_REQUEST",
                                    payload={"booking_reference": booking.reference}, status="BLOCKED_CONFIGURATION")
        created += 1
    return created


def sms_variable_names(count):
    try:
        names = json.loads(os.getenv("SMS_VARIABLE_NAMES_JSON", "[]"))
    except ValueError:
        names = []
    if not names:
        names = [settings.SMS_VARIABLE_NAME] + [f"VAR{i}" for i in range(2, 11)]
    return names[:count]
