from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from common.models import UUIDStampedModel


class AppointmentSlot(UUIDStampedModel):
    zone = models.ForeignKey("locations.Zone", on_delete=models.PROTECT)
    package = models.ForeignKey("catalog.ServicePackage", on_delete=models.PROTECT)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    capacity = models.PositiveSmallIntegerField()
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=False)
    is_blackout = models.BooleanField(default=False)
    minimum_lead_minutes = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["zone", "package", "start_at"], name="unique_zone_package_start"),
            models.CheckConstraint(condition=models.Q(capacity__gt=0), name="slot_positive_capacity"),
            models.CheckConstraint(condition=models.Q(end_at__gt=models.F("start_at")), name="slot_positive_duration"),
        ]
        indexes = [models.Index(fields=["zone", "package", "start_at"])]


class SlotHold(UUIDStampedModel):
    slot = models.ForeignKey(AppointmentSlot, on_delete=models.PROTECT, related_name="holds")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    address = models.ForeignKey("locations.Address", on_delete=models.PROTECT)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=12, choices=[("ACTIVE", "Active"), ("CONSUMED", "Consumed"), ("RELEASED", "Released"), ("EXPIRED", "Expired")], default="ACTIVE")

    class Meta:
        indexes = [models.Index(fields=["slot", "status", "expires_at"])]


class CheckoutQuote(UUIDStampedModel):
    hold = models.ForeignKey(SlotHold, on_delete=models.PROTECT)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    pricing_rule = models.ForeignKey("catalog.PricingRule", on_delete=models.PROTECT)
    pricing_version = models.PositiveIntegerField()
    lines = models.JSONField()
    total_paise = models.PositiveBigIntegerField()
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=12, choices=[("ACTIVE", "Active"), ("ACCEPTED", "Accepted"), ("EXPIRED", "Expired")], default="ACTIVE")


class Booking(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    service = models.ForeignKey("catalog.Service", on_delete=models.PROTECT)
    package = models.ForeignKey("catalog.ServicePackage", on_delete=models.PROTECT, null=True)
    address = models.ForeignKey("locations.Address", on_delete=models.PROTECT, null=True)
    slot = models.ForeignKey(AppointmentSlot, on_delete=models.PROTECT, null=True)
    hold = models.OneToOneField(SlotHold, on_delete=models.PROTECT, null=True)
    status = models.CharField(max_length=32, choices=[("DRAFT", "Draft"), ("AWAITING_PAYMENT", "Awaiting payment"),
                                                      ("CONFIRMED", "Confirmed"), ("CONFIRMED_UNPAID", "Confirmed unpaid"),
                                                      ("CANCELLED", "Cancelled"), ("EXPIRED", "Expired")], default="DRAFT")
    payment_status = models.CharField(max_length=24, choices=[("UNPAID", "Unpaid"), ("PENDING", "Pending"),
                                                             ("AUTHORIZED", "Authorized"), ("PAID", "Paid"),
                                                             ("FAILED", "Failed"), ("REFUND_PENDING", "Refund pending"),
                                                             ("PARTIALLY_REFUNDED", "Partially refunded"),
                                                             ("REFUNDED", "Refunded")], default="UNPAID")
    payment_expires_at = models.DateTimeField(null=True, blank=True)
    reference = models.CharField(max_length=32, unique=True)
    version = models.PositiveIntegerField(default=1)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "-created_at"])]


class BookingItem(UUIDStampedModel):
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="items")
    package = models.ForeignKey("catalog.ServicePackage", on_delete=models.PROTECT)
    quantity = models.PositiveSmallIntegerField(default=1)


class BookingPriceSnapshot(UUIDStampedModel):
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT, related_name="price_snapshot")
    pricing_rule_id = models.UUIDField()
    pricing_version = models.PositiveIntegerField()
    lines = models.JSONField()
    total_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    payment_policy = models.CharField(max_length=24, default="PAY_AT_VISIT")
    cancellation_cutoff_minutes = models.PositiveIntegerField(null=True, blank=True)
    reschedule_cutoff_minutes = models.PositiveIntegerField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Booking price snapshots are immutable.")
        return super().save(*args, **kwargs)


class BookingStatusEvent(UUIDStampedModel):
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="events")
    from_status = models.CharField(max_length=32)
    to_status = models.CharField(max_length=32)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    reason = models.CharField(max_length=240, blank=True)

    class Meta:
        ordering = ["created_at"]


class BookingIdempotencyRecord(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    key = models.CharField(max_length=128)
    request_hash = models.CharField(max_length=64)
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="unique_booking_idempotency_user_key")]
