"""Coupon and referral rules used by checkout quotes and booking confirmation."""
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import Coupon, CouponRedemption, Referral, ReferralCode

DISCOUNT_LINE = "DISCOUNT"
INACTIVE_BOOKING_STATUSES = ("CANCELLED", "EXPIRED")
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@dataclass
class Offer:
    kind: str  # "COUPON" or "REFERRAL"
    code: str
    discount_paise: int
    label: str
    coupon: Coupon | None = None
    referrer_id: int | None = None


def normalize_code(code):
    return "".join(str(code or "").split()).upper()[:24]


def has_prior_booking(user):
    from domains.bookings.models import Booking

    return Booking.objects.filter(user=user).exclude(status__in=INACTIVE_BOOKING_STATUSES).exists()


def _coupon_discount(coupon, subtotal):
    if coupon.discount_type == Coupon.PERCENT:
        amount = subtotal * min(coupon.value, 100) // 100
    else:
        amount = coupon.value
    if coupon.max_discount_paise:
        amount = min(amount, coupon.max_discount_paise)
    return max(0, min(amount, subtotal))


def _check_coupon(user, coupon, subtotal, lock=False):
    now = timezone.now()
    if not coupon.is_active or (coupon.owner_id and coupon.owner_id != user.id):
        raise ValidationError({"coupon_code": "This code is not valid."})
    if coupon.valid_from and coupon.valid_from > now:
        raise ValidationError({"coupon_code": "This offer has not started yet."})
    if coupon.valid_until and coupon.valid_until <= now:
        raise ValidationError({"coupon_code": "This offer has expired."})
    if subtotal < coupon.min_order_paise:
        raise ValidationError({"coupon_code": f"Add ₹{coupon.min_order_paise / 100:,.0f} or more to use this code."})
    if coupon.first_booking_only and has_prior_booking(user):
        raise ValidationError({"coupon_code": "This code is only for your first booking."})
    used = CouponRedemption.objects.filter(coupon=coupon)
    if coupon.usage_limit is not None and used.count() >= coupon.usage_limit:
        raise ValidationError({"coupon_code": "This offer has been fully used."})
    if used.filter(user=user).count() >= coupon.per_user_limit:
        raise ValidationError({"coupon_code": "You have already used this code."})
    discount = _coupon_discount(coupon, subtotal)
    if discount <= 0:
        raise ValidationError({"coupon_code": "This code gives no discount on this order."})
    return discount


def evaluate_code(user, code, subtotal, advance=None, lock=False):
    """Validate a referral code (or a referral reward code) for this user. Raises ValidationError.

    Discounts are funded by NammaPros out of the online advance, so the technician still collects the
    full balance at the visit. A booking with no online advance cannot take a discount.
    """
    code = normalize_code(code)
    if not code:
        raise ValidationError({"coupon_code": "Enter a code."})
    if advance is not None and advance <= 0:
        raise ValidationError({"coupon_code": "Referral discounts apply to the online advance. "
                                              "This service is paid fully at the visit."})
    cap = subtotal if advance is None else min(subtotal, advance)
    coupons = Coupon.objects.select_for_update() if lock else Coupon.objects
    coupon = coupons.filter(code=code).first()
    if coupon and coupon.source != "REFERRAL_REWARD" and not settings.COUPONS_ENABLED:
        coupon = None  # general offer codes are switched off; only referral rewards remain
    if coupon:
        discount = min(_check_coupon(user, coupon, subtotal), cap)
        label = coupon.description or f"Offer {coupon.code}"
        return Offer(kind="COUPON", code=code, discount_paise=discount, label=label, coupon=coupon)

    referral_code = ReferralCode.objects.filter(code=code).first()
    if referral_code:
        if referral_code.user_id == user.id:
            raise ValidationError({"coupon_code": "You can't use your own referral code."})
        if settings.REFERRAL_REFEREE_DISCOUNT_PAISE <= 0:
            raise ValidationError({"coupon_code": "Referral offers are paused right now."})
        if has_prior_booking(user) or Referral.objects.filter(referee=user, status__in=["PENDING", "REWARDED"]).exists():
            raise ValidationError({"coupon_code": "Referral codes work only on your first booking."})
        discount = min(settings.REFERRAL_REFEREE_DISCOUNT_PAISE, cap)
        return Offer(kind="REFERRAL", code=code, discount_paise=discount, label=f"Referral {code}",
                     referrer_id=referral_code.user_id)
    raise ValidationError({"coupon_code": "This code is not valid."})


def apply_discount(lines, total, advance, offer):
    """Return (lines, total, advance). The discount comes off the online advance only, so the balance
    the technician collects at the visit stays the same."""
    discount = min(offer.discount_paise, advance, total)
    new_total = total - discount
    new_advance = advance - discount
    line = {"code": DISCOUNT_LINE, "name": offer.label, "coupon_code": offer.code, "offer_kind": offer.kind,
            "amount_paise": -discount}
    return [*lines, line], new_total, new_advance


def discount_line(lines):
    return next((line for line in (lines or []) if isinstance(line, dict) and line.get("code") == DISCOUNT_LINE), None)


def revalidate_for_confirm(user, lines, gross_total, gross_advance=None):
    """Re-check the quote's code at confirmation. Returns (offer or None, discount)."""
    line = discount_line(lines)
    if not line:
        return None, 0
    offer = evaluate_code(user, line.get("coupon_code"), gross_total, advance=gross_advance, lock=True)
    if offer.discount_paise != -int(line.get("amount_paise", 0)):
        from domains.bookings.services import Conflict

        raise Conflict("The offer changed. Review the price again before confirming.")
    return offer, offer.discount_paise


def record_redemption(user, booking, offer):
    if offer is None:
        return
    if offer.kind == "COUPON":
        CouponRedemption.objects.create(coupon=offer.coupon, user=user, booking=booking,
                                        discount_paise=offer.discount_paise)
    else:
        try:
            with transaction.atomic():
                Referral.objects.create(referrer_id=offer.referrer_id, referee=user, booking=booking,
                                        discount_paise=offer.discount_paise)
        except IntegrityError as exc:
            raise ValidationError({"coupon_code": "Referral codes work only on your first booking."}) from exc


def referral_code_for(user):
    existing = ReferralCode.objects.filter(user=user).first()
    if existing:
        return existing
    for _ in range(10):
        code = "NP" + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        if Coupon.objects.filter(code=code).exists():
            continue
        try:
            with transaction.atomic():
                return ReferralCode.objects.create(user=user, code=code)
        except IntegrityError:
            existing = ReferralCode.objects.filter(user=user).first()
            if existing:
                return existing
    raise RuntimeError("Could not allocate a referral code.")


def referral_summary(user):
    code = referral_code_for(user)
    made = Referral.objects.filter(referrer=user).values("status").annotate(n=Count("id"))
    counts = {row["status"]: row["n"] for row in made}
    rewards = Coupon.objects.filter(owner=user, source="REFERRAL_REWARD").order_by("-created_at")
    used_ids = set(CouponRedemption.objects.filter(coupon__in=rewards).values_list("coupon_id", flat=True))
    return {
        "code": code.code,
        "referee_discount_paise": settings.REFERRAL_REFEREE_DISCOUNT_PAISE,
        "reward_paise": settings.REFERRAL_REWARD_PAISE,
        "pending_count": counts.get("PENDING", 0),
        "rewarded_count": counts.get("REWARDED", 0),
        "rewards": [{"code": c.code, "amount_paise": c.value, "valid_until": c.valid_until,
                     "used": c.id in used_ids} for c in rewards[:20]],
    }


def on_booking_status(booking):
    """Called whenever a booking is saved: issue referral rewards and release cancelled discounts."""
    if booking.status in INACTIVE_BOOKING_STATUSES:
        CouponRedemption.objects.filter(booking=booking).delete()
        Referral.objects.filter(booking=booking, status="PENDING").update(status="VOID")
        return
    if booking.status not in ("COMPLETED", "CLOSED"):
        return
    with transaction.atomic():
        referral = Referral.objects.select_for_update().filter(booking=booking, status="PENDING").first()
        if not referral:
            return
        reward = None
        if settings.REFERRAL_REWARD_PAISE > 0:
            for _ in range(10):
                code = "RW" + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
                if not Coupon.objects.filter(code=code).exists() and not ReferralCode.objects.filter(code=code).exists():
                    break
            reward = Coupon.objects.create(
                code=code, description="Referral reward", discount_type=Coupon.FLAT,
                value=settings.REFERRAL_REWARD_PAISE, owner_id=referral.referrer_id, source="REFERRAL_REWARD",
                usage_limit=1, per_user_limit=1,
                valid_until=timezone.now() + timedelta(days=settings.REFERRAL_REWARD_VALID_DAYS))
        referral.status = "REWARDED"
        referral.reward_coupon = reward
        referral.rewarded_at = timezone.now()
        referral.save(update_fields=["status", "reward_coupon", "rewarded_at", "updated_at"])
