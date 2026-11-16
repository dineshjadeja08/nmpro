"""SMS / WhatsApp messages to technicians.

Messages are queued as Notification rows and sent by the existing MSG91 dispatch tasks
(dispatch_whatsapp_notifications / dispatch_sms_notifications) once the matching approved
template is configured in WHATSAPP_TEMPLATES_JSON / SMS_TEMPLATES_JSON.
"""
from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from domains.notifications.models import Notification, NotificationPreference

from .models import JobAssignment

TECHNICIAN_EVENTS = (
    "TECHNICIAN_APP_ACCESS_ENABLED",  # KYC approved and app login switched on
    "TECHNICIAN_JOINING_FEE_PAID",
    "TECHNICIAN_JOB_ASSIGNED",
)


def _channel(user):
    pref = NotificationPreference.objects.filter(user=user).first()
    if pref is not None:
        if pref.whatsapp_opt_in and settings.WHATSAPP_ENABLED:
            return "WHATSAPP"
        if pref.sms_opt_in:
            return "SMS"
    return "WHATSAPP" if settings.WHATSAPP_ENABLED and settings.WHATSAPP_PROVIDER == "MSG91" else "SMS"


def notify_technician(profile, event, booking=None):
    """Queue one message to the technician's registered mobile number."""
    reference = booking.reference if booking is not None else (profile.employee_code or "NammaPros")[:32]
    return Notification.objects.create(
        recipient=profile.user, booking=booking, channel=_channel(profile.user), event=event,
        template_key=event, payload={"booking_reference": reference}, status="BLOCKED_CONFIGURATION")


@receiver(post_save, sender=JobAssignment, dispatch_uid="sms_technician_job_assigned")
def job_assigned(sender, instance, created, **kwargs):
    if not created:
        return
    assignment_id = instance.id

    def send():
        job = JobAssignment.objects.select_related("technician__user", "booking").filter(id=assignment_id).first()
        if job:
            notify_technician(job.technician, "TECHNICIAN_JOB_ASSIGNED", job.booking)

    transaction.on_commit(send)
