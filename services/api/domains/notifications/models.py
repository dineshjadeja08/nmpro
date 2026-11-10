from django.conf import settings
from django.db import models

from common.models import UUIDStampedModel


class Notification(UUIDStampedModel):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    outbox_event = models.OneToOneField("notifications.OutboxEvent", on_delete=models.PROTECT, null=True, blank=True)
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, null=True)
    channel = models.CharField(max_length=20)
    event = models.CharField(max_length=60)
    status = models.CharField(max_length=20, default="PENDING")
    template_key = models.CharField(max_length=100, blank=True)
    payload = models.JSONField(default=dict)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    provider_message_id = models.CharField(max_length=120, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)


class NotificationPreference(UUIDStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    whatsapp_opt_in = models.BooleanField(default=False)
    sms_opt_in = models.BooleanField(default=False)
    email_opt_in = models.BooleanField(default=False)
    push_opt_in = models.BooleanField(default=True)


class DeviceToken(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="device_tokens")
    platform = models.CharField(max_length=16, choices=[(p, p) for p in ("WEB", "ANDROID", "IOS")])
    token = models.CharField(max_length=512, unique=True)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(auto_now=True)


class OutboxEvent(UUIDStampedModel):
    event_type = models.CharField(max_length=60)
    aggregate_id = models.UUIDField()
    payload = models.JSONField(default=dict)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["processed_at", "created_at"])]
