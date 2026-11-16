from django.conf import settings
from django.db import models

from common.models import UUIDStampedModel


class Coupon(UUIDStampedModel):
    PERCENT = "PERCENT"
    FLAT = "FLAT"
    SOURCES = [("ADMIN", "Created by staff"), ("REFERRAL_REWARD", "Referral reward")]

    code = models.CharField(max_length=24, unique=True)
    description = models.CharField(max_length=200, blank=True, default="")
    discount_type = models.CharField(max_length=8, choices=[(PERCENT, "Percent"), (FLAT, "Flat amount")])
    # Percent (1-100) for PERCENT, paise for FLAT.
    value = models.PositiveIntegerField()
    max_discount_paise = models.PositiveBigIntegerField(null=True, blank=True)
    min_order_paise = models.PositiveBigIntegerField(default=0)
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    per_user_limit = models.PositiveIntegerField(default=1)
    first_booking_only = models.BooleanField(default=False)
    # A personal coupon (e.g. a referral reward) can only be used by its owner.
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True,
                              related_name="personal_coupons")
    source = models.CharField(max_length=20, choices=SOURCES, default="ADMIN")
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="+")

    def __str__(self):
        return self.code


class CouponRedemption(UUIDStampedModel):
    coupon = models.ForeignKey(Coupon, on_delete=models.PROTECT, related_name="redemptions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="coupon_redemptions")
    booking = models.OneToOneField("bookings.Booking", on_delete=models.CASCADE, related_name="coupon_redemption")
    discount_paise = models.PositiveBigIntegerField()

    class Meta:
        indexes = [models.Index(fields=["coupon", "user"])]


class ReferralCode(UUIDStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="referral_code")
    code = models.CharField(max_length=16, unique=True)


class Referral(UUIDStampedModel):
    STATUSES = [("PENDING", "Waiting for first booking to complete"), ("REWARDED", "Reward issued"),
                ("VOID", "First booking cancelled")]

    referrer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="referrals_made")
    referee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="referrals_received")
    booking = models.OneToOneField("bookings.Booking", on_delete=models.CASCADE, related_name="referral")
    discount_paise = models.PositiveBigIntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUSES, default="PENDING")
    reward_coupon = models.OneToOneField(Coupon, on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name="referral")
    rewarded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["referee"], condition=models.Q(status__in=["PENDING", "REWARDED"]),
                                               name="one_live_referral_per_referee")]
