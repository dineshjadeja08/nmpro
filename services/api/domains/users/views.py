import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import OTPChallenge
from .providers.msg91 import MSG91OTPProvider, MSG91Unavailable


class TooManyRequests(APIException):
    status_code = 429
    default_detail = "Too many attempts. Please wait before trying again."
    default_code = "RATE_LIMITED"


class ProviderUnavailable(APIException):
    status_code = 503
    default_detail = "Phone sign-in is temporarily unavailable."
    default_code = "OTP_UNAVAILABLE"


def get_otp_provider():
    return MSG91OTPProvider()


def valid_phone(value):
    if not isinstance(value, str) or not re.fullmatch(r"\+91[6-9]\d{9}", value):
        raise ValidationError({"phone_e164": ["Enter an Indian mobile number in +91 format."]})
    return value


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"csrf_token": get_token(request._request)})


@method_decorator(csrf_protect, name="dispatch")
class OTPRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_request"

    def post(self, request):
        phone = valid_phone(request.data.get("phone_e164"))
        now = timezone.now()
        latest = OTPChallenge.objects.filter(phone_e164=phone).order_by("-created_at").first()
        if latest and latest.created_at > now - timedelta(seconds=60):
            raise TooManyRequests("Wait one minute before requesting another code.")
        if OTPChallenge.objects.filter(phone_e164=phone, created_at__gte=now - timedelta(hours=1)).count() >= 5:
            raise TooManyRequests()
        if settings.ENVIRONMENT in {"staging", "production"}:
            try:
                get_otp_provider().send(phone)
            except MSG91Unavailable as exc:
                raise ProviderUnavailable() from exc
            code = None
        else:
            code = f"{secrets.randbelow(10 ** settings.OTP_CODE_LENGTH):0{settings.OTP_CODE_LENGTH}d}"
        challenge = OTPChallenge.objects.create(phone_e164=phone, code_hash=make_password(code),
                                                expires_at=now + timedelta(minutes=5))
        body = {"challenge_id": str(challenge.id), "expires_at": challenge.expires_at}
        if code is not None:
            body["development_code"] = code
        return Response(body)


@method_decorator(csrf_protect, name="dispatch")
class OTPVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    @transaction.atomic
    def post(self, request):
        phone = valid_phone(request.data.get("phone_e164"))
        challenge_id = serializers.UUIDField().run_validation(request.data.get("challenge_id"))
        code = request.data.get("code")
        if not isinstance(code, str) or not re.fullmatch(rf"\d{{{settings.OTP_CODE_LENGTH}}}", code):
            raise ValidationError({"code": ["Enter the configured verification code."]})
        challenge = OTPChallenge.objects.select_for_update().filter(id=challenge_id, phone_e164=phone).first()
        if not challenge or challenge.consumed_at or challenge.expires_at <= timezone.now():
            raise ValidationError({"code": ["This code expired. Request a new one."]})
        if challenge.attempts >= 5:
            raise TooManyRequests("Too many code attempts. Request a new code.")
        challenge.attempts += 1
        if settings.ENVIRONMENT in {"staging", "production"}:
            try:
                valid = get_otp_provider().verify(phone, code)
            except MSG91Unavailable as exc:
                raise ProviderUnavailable() from exc
        else:
            valid = check_password(code, challenge.code_hash)
        if not valid:
            challenge.save(update_fields=["attempts", "updated_at"])
            return Response({"error": {"code": "INVALID_OTP", "message": "The code is incorrect.",
                                       "fields": {"code": ["The code is incorrect."]}, "request_id": ""}}, status=400)
        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=["attempts", "consumed_at", "updated_at"])
        User = get_user_model()
        user, _ = User.objects.get_or_create(phone_e164=phone, defaults={"username": phone})
        login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
        request._request.session["privileged_verified_at"] = timezone.now().timestamp()
        return Response({"id": user.pk, "phone_e164": phone})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"id": request.user.pk, "phone_e164": request.user.phone_e164})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request._request)
        return Response({"status": "signed_out"})
