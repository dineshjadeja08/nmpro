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
    advance_paise = models.PositiveBigIntegerField(default=0)
    remaining_balance_paise = models.PositiveBigIntegerField(default=0)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=12, choices=[("ACTIVE", "Active"), ("ACCEPTED", "Accepted"), ("EXPIRED", "Expired")], default="ACTIVE")


class ScheduleClosure(UUIDStampedModel):
    zone = models.ForeignKey("locations.Zone", on_delete=models.CASCADE, null=True, blank=True, related_name="closures")
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    reason = models.CharField(max_length=240, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["is_active", "start_at", "end_at"])]


class Cart(UUIDStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cart")


class CartItem(UUIDStampedModel):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    service = models.ForeignKey("catalog.Service", on_delete=models.CASCADE)
    package = models.ForeignKey("catalog.ServicePackage", on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.PositiveSmallIntegerField(default=1)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["cart", "package"], name="unique_cart_package_item")]


BOOKING_STATUS_CHOICES = [
    ("DRAFT", "Draft"),
    ("REQUESTED", "Requested"),
    ("AWAITING_PAYMENT", "Awaiting payment"),
    ("PENDING_PAYMENT", "Pending payment"),
    ("PAYMENT_FAILED", "Payment failed"),
    ("CONFIRMED", "Confirmed"),
    ("CONFIRMED_UNPAID", "Confirmed unpaid"),
    ("TECHNICIAN_ASSIGNED", "Technician assigned"),
    ("TECHNICIAN_EN_ROUTE", "Technician en route"),
    ("TECHNICIAN_ARRIVED", "Technician arrived"),
    ("IN_PROGRESS", "In progress"),
    ("COMPLETED", "Completed"),
    ("CLOSED", "Closed"),
    ("CANCELLED", "Cancelled"),
    ("EXPIRED", "Expired"),
]


class Booking(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    service = models.ForeignKey("catalog.Service", on_delete=models.PROTECT)
    package = models.ForeignKey("catalog.ServicePackage", on_delete=models.PROTECT, null=True)
    address = models.ForeignKey("locations.Address", on_delete=models.PROTECT, null=True)
    slot = models.ForeignKey(AppointmentSlot, on_delete=models.PROTECT, null=True)
    hold = models.OneToOneField(SlotHold, on_delete=models.PROTECT, null=True)
    status = models.CharField(max_length=32, choices=BOOKING_STATUS_CHOICES, default="DRAFT")
    payment_status = models.CharField(max_length=24, choices=[("UNPAID", "Unpaid"), ("PENDING", "Pending"),
                                                             ("AUTHORIZED", "Authorized"), ("ADVANCE_PAID", "Advance paid"),
                                                             ("PAID", "Paid"),
                                                             ("FAILED", "Failed"), ("REFUND_PENDING", "Refund pending"),
                                                             ("PARTIALLY_REFUNDED", "Partially refunded"),
                                                             ("REFUNDED", "Refunded")], default="UNPAID")
    payment_expires_at = models.DateTimeField(null=True, blank=True)
    reference = models.CharField(max_length=32, unique=True)
    version = models.PositiveIntegerField(default=1)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    start_otp_code = models.CharField(max_length=4, blank=True, default="")
    start_otp_attempts = models.PositiveSmallIntegerField(default=0)
    is_manual_work_order = models.BooleanField(default=False)
    problem_description = models.TextField(max_length=2000, blank=True, default="")
    offline_collected_paise = models.PositiveBigIntegerField(default=0)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="closed_bookings")
    closure_note = models.CharField(max_length=240, blank=True, default="")

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
    advance_type = models.CharField(max_length=20, default="NONE")
    advance_percentage = models.PositiveSmallIntegerField(default=0)
    advance_paise = models.PositiveBigIntegerField(default=0)
    remaining_balance_paise = models.PositiveBigIntegerField(default=0)
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
