from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.administration.rbac import require
from domains.audit.models import AuditLog

from .models import Coupon
from .services import evaluate_code, normalize_code, referral_summary


def public_coupon_data(c):
    return {"code": c.code, "description": c.description, "discount_type": c.discount_type, "value": c.value,
            "max_discount_paise": c.max_discount_paise, "min_order_paise": c.min_order_paise,
            "valid_until": c.valid_until, "first_booking_only": c.first_booking_only}


def admin_coupon_data(c):
    return {**public_coupon_data(c), "id": str(c.id), "valid_from": c.valid_from, "usage_limit": c.usage_limit,
            "per_user_limit": c.per_user_limit, "is_active": c.is_active, "source": c.source,
            "owner_id": c.owner_id, "times_used": getattr(c, "times_used", c.redemptions.count()),
            "created_at": c.created_at}


class PublicOffersView(APIView):
    """Active public coupons to show on the site and at checkout."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        from django.conf import settings

        if not settings.COUPONS_ENABLED:
            return Response({"offers": []})
        now = timezone.now()
        rows = (Coupon.objects.filter(is_active=True, owner__isnull=True)
                .filter(Q(valid_from__isnull=True) | Q(valid_from__lte=now))
                .filter(Q(valid_until__isnull=True) | Q(valid_until__gt=now))
                .annotate(times_used=Count("redemptions"))
                .order_by("min_order_paise", "-created_at")[:20])
        offers = [c for c in rows if c.usage_limit is None or c.times_used < c.usage_limit]
        return Response({"offers": [public_coupon_data(c) for c in offers]})


class CheckCodeInput(serializers.Serializer):
    code = serializers.CharField(max_length=40)
    subtotal_paise = serializers.IntegerField(min_value=0, max_value=100_000_000)


class CheckCodeView(APIView):
    """Preview a code before checkout. The quote re-checks it; this never reserves anything."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = CheckCodeInput(data=request.data)
        data.is_valid(raise_exception=True)
        offer = evaluate_code(request.user, data.validated_data["code"], data.validated_data["subtotal_paise"])
        return Response({"code": offer.code, "kind": offer.kind, "label": offer.label,
                         "discount_paise": offer.discount_paise})


class MyReferralView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(referral_summary(request.user))


class CouponInput(serializers.Serializer):
    code = serializers.RegexField(r"^[A-Za-z0-9]{3,24}$", required=False)
    description = serializers.CharField(max_length=200, allow_blank=True, required=False)
    discount_type = serializers.ChoiceField(choices=[Coupon.PERCENT, Coupon.FLAT], required=False)
    value = serializers.IntegerField(min_value=1, max_value=10_000_000, required=False)
    max_discount_paise = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    min_order_paise = serializers.IntegerField(min_value=0, required=False)
    valid_from = serializers.DateTimeField(required=False, allow_null=True)
    valid_until = serializers.DateTimeField(required=False, allow_null=True)
    usage_limit = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    per_user_limit = serializers.IntegerField(min_value=1, max_value=100, required=False)
    first_booking_only = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        kind = attrs.get("discount_type", getattr(self.instance, "discount_type", None))
        value = attrs.get("value", getattr(self.instance, "value", None))
        if kind == Coupon.PERCENT and value is not None and value > 100:
            raise serializers.ValidationError({"value": "A percentage must be 1–100."})
        start = attrs.get("valid_from", getattr(self.instance, "valid_from", None))
        end = attrs.get("valid_until", getattr(self.instance, "valid_until", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"valid_until": "End must be after start."})
        if "code" in attrs:
            attrs["code"] = normalize_code(attrs["code"])
        return attrs


class AdminCouponsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        rows = Coupon.objects.annotate(times_used=Count("redemptions")).order_by("-created_at")
        if request.query_params.get("source"):
            rows = rows.filter(source=request.query_params["source"])
        if request.query_params.get("q"):
            rows = rows.filter(code__icontains=request.query_params["q"][:24])
        return Response({"results": [admin_coupon_data(c) for c in rows[:200]]})

    def post(self, request):
        require(request.user, "MANAGE_PRICING")
        data = CouponInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        missing = [f for f in ("code", "discount_type", "value") if f not in values]
        if missing:
            raise serializers.ValidationError({f: "This field is required." for f in missing})
        if Coupon.objects.filter(code=values["code"]).exists():
            raise serializers.ValidationError({"code": "A coupon with this code already exists."})
        coupon = Coupon.objects.create(created_by=request.user, **values)
        AuditLog.objects.create(actor=request.user, action="COUPON_CREATED", resource_type="Coupon",
                                resource_id=str(coupon.id), metadata={"code": coupon.code})
        return Response(admin_coupon_data(coupon), status=201)


class AdminCouponDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, coupon_id):
        require(request.user, "MANAGE_PRICING")
        coupon = get_object_or_404(Coupon, id=coupon_id)
        data = CouponInput(coupon, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        if "code" in values and values["code"] != coupon.code:
            if coupon.redemptions.exists():
                raise serializers.ValidationError({"code": "A used coupon's code can't change."})
            if Coupon.objects.filter(code=values["code"]).exclude(id=coupon.id).exists():
                raise serializers.ValidationError({"code": "A coupon with this code already exists."})
        for key, value in values.items():
            setattr(coupon, key, value)
        coupon.save()
        AuditLog.objects.create(actor=request.user, action="COUPON_UPDATED", resource_type="Coupon",
                                resource_id=str(coupon.id), metadata={"fields": list(values)})
        return Response(admin_coupon_data(coupon))
