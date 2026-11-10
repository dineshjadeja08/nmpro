from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from domains.bookings.models import Booking

from .models import Notification, NotificationPreference, OutboxEvent
from .providers.msg91_sms import MSG91SMSProvider
from .providers.msg91_whatsapp import DeliveryUnavailable, MSG91WhatsAppProvider
from .providers.smtp_email import SUBJECTS, SMTPEmailProvider

TEMPLATE_VARIABLES = {
    "BOOKING_CONFIRMED": ("booking_reference",),
    "BOOKING_CANCELLED": ("booking_reference",),
    "BOOKING_RESCHEDULED": ("booking_reference",),
    "BOOKING_PAYMENT_PENDING": ("booking_reference",),
    "BOOKING_PAYMENT_EXPIRED": ("booking_reference",),
    "PAYMENT_SUCCESS": ("booking_reference",),
    "PAYMENT_FAILED": ("booking_reference",),
    "BALANCE_PAYMENT_COLLECTED": ("booking_reference",),
    "REFUND_INITIATED": ("booking_reference",),
    "REFUND_COMPLETED": ("booking_reference",),
    "TECHNICIAN_APPLICATION_SUBMITTED": ("booking_reference",),
    "TECHNICIAN_VERIFIED": ("booking_reference",),
    "TECHNICIAN_REJECTED": ("booking_reference",),
    "TECHNICIAN_SUSPENDED": ("booking_reference",),
    "NEW_JOB_OFFER": ("booking_reference",),
    "TECHNICIAN_ASSIGNED": ("booking_reference",),
    "TECHNICIAN_REASSIGNED": ("booking_reference",),
    "TECHNICIAN_EN_ROUTE": ("booking_reference",),
    "TECHNICIAN_ARRIVED": ("booking_reference",),
    "IN_PROGRESS": ("booking_reference",),
    "QUOTATION_APPROVAL_REQUIRED": ("booking_reference",),
    "QUOTATION_APPROVED": ("booking_reference",),
    "QUOTATION_REJECTED": ("booking_reference",),
    "JOB_COMPLETED": ("booking_reference",),
}


def resolve_default_channel(preference) -> str:
    if preference is not None:
        return (
            "WHATSAPP"
            if preference.whatsapp_opt_in
            else "SMS"
            if preference.sms_opt_in
            else "EMAIL"
            if preference.email_opt_in
            else "NONE"
        )
    if settings.WHATSAPP_ENABLED and settings.WHATSAPP_PROVIDER == "MSG91":
        return "WHATSAPP"
    if settings.SMS_PROVIDER == "MSG91":
        return "SMS"
    return "SMS"


@shared_task
def process_booking_outbox():
    processed = 0
    for event_id in OutboxEvent.objects.filter(processed_at__isnull=True).values_list("id", flat=True)[:100]:
        with transaction.atomic():
            event = OutboxEvent.objects.select_for_update().get(id=event_id)
            if event.processed_at:
                continue
            booking = Booking.objects.get(id=event.aggregate_id)
            preference = NotificationPreference.objects.filter(user=booking.user).first()
            channel = resolve_default_channel(preference)
            Notification.objects.get_or_create(outbox_event=event, defaults={
                "recipient": booking.user, "booking": booking, "channel": channel,
                "event": event.event_type, "template_key": event.event_type,
                "payload": {"booking_reference": booking.reference},
                "status": "BLOCKED_CONFIGURATION",
            })
            event.processed_at = timezone.now()
            event.save(update_fields=["processed_at", "updated_at"])
            processed += 1
    return processed


def get_whatsapp_provider():
    return MSG91WhatsAppProvider()


def get_sms_provider():
    return MSG91SMSProvider()


def get_email_provider():
    return SMTPEmailProvider()


def _dispatch(channel, configured, template_map, preference_field, send):
    if not configured:
        return 0
    submitted = 0
    ids = Notification.objects.filter(channel=channel, status="BLOCKED_CONFIGURATION").values_list("id", flat=True)[:100]
    for notification_id in ids:
        with transaction.atomic():
            notification = Notification.objects.select_for_update().select_related("recipient").get(id=notification_id)
            if notification.status != "BLOCKED_CONFIGURATION":
                continue
            preference = NotificationPreference.objects.filter(user=notification.recipient).first()
            template_name = template_map.get(notification.template_key)
            opted_in = (
                getattr(preference, preference_field)
                if preference is not None
                else preference_field in ("whatsapp_opt_in", "sms_opt_in")
            )
            if not opted_in or not template_name:
                continue
            if notification.template_key not in TEMPLATE_VARIABLES or not all(
                key in notification.payload for key in TEMPLATE_VARIABLES[notification.template_key]
            ):
                notification.status = "FAILED_REVIEW"
                notification.save(update_fields=["status", "updated_at"])
                continue
            notification.status = "SUBMITTING"
            notification.attempt_count += 1
            notification.save(update_fields=["status", "attempt_count", "updated_at"])
        try:
            request_id = send(notification, template_name)
        except DeliveryUnavailable:
            notification.status = "FAILED_REVIEW"
            notification.save(update_fields=["status", "updated_at"])
            continue
        notification.provider_message_id = request_id
        notification.status = "SENT_TO_PROVIDER"
        notification.sent_at = timezone.now()
        notification.save(update_fields=["provider_message_id", "status", "sent_at", "updated_at"])
        submitted += 1
    return submitted


@shared_task
def dispatch_whatsapp_notifications():
    return _dispatch("WHATSAPP", settings.WHATSAPP_ENABLED and settings.WHATSAPP_PROVIDER == "MSG91", settings.WHATSAPP_TEMPLATES,
                     "whatsapp_opt_in", lambda n, t: get_whatsapp_provider().send_template(
                         n.recipient.phone_e164, t, n.payload["booking_reference"]))


@shared_task
def dispatch_sms_notifications():
    return _dispatch("SMS", settings.SMS_PROVIDER == "MSG91", settings.SMS_TEMPLATES,
                     "sms_opt_in", lambda n, t: get_sms_provider().send_template(
                         n.recipient.phone_e164, t, n.payload["booking_reference"]))


@shared_task
def dispatch_email_notifications():
    return _dispatch("EMAIL", settings.EMAIL_PROVIDER == "SMTP", SUBJECTS,
                     "email_opt_in", lambda n, t: get_email_provider().send_template(
                         n.recipient.email, n.event, n.payload["booking_reference"]))


@shared_task
def flag_uncertain_notification_submissions():
    return Notification.objects.filter(status="SUBMITTING", updated_at__lt=timezone.now() - timedelta(minutes=15)).update(
        status="FAILED_REVIEW")
