import re
import secrets
from datetime import timedelta

from datetime import datetime, timezone as dt_timezone
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers
from rest_framework.exceptions import APIException, AuthenticationFailed, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from common.jwt import decode_jwt, issue_token_pair
from .models import BlacklistedRefreshToken, CustomerProfile, OTPChallenge
from .providers.firebase import FirebaseAuthProvider, FirebaseTokenInvalid, FirebaseUnavailable
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
        tokens = issue_token_pair(user)
        return Response({"id": user.pk, "phone_e164": phone, **tokens})


@method_decorator(csrf_protect, name="dispatch")
class FirebaseAuthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        id_token = request.data.get("id_token")
        if not id_token:
            raise ValidationError({"id_token": ["Firebase ID token is required."]})
        provider = FirebaseAuthProvider()
        try:
            claims = provider.verify_token(id_token)
        except FirebaseTokenInvalid as exc:
            return Response({"error": {"code": "INVALID_TOKEN", "message": str(exc), "request_id": ""}}, status=400)
        except FirebaseUnavailable as exc:
            raise ProviderUnavailable("Firebase sign-in is temporarily unavailable.") from exc

        phone = claims.get("phone_number", "")
        phone = valid_phone(phone)
        User = get_user_model()
        user, _ = User.objects.get_or_create(phone_e164=phone, defaults={"username": phone})
        login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
        request._request.session["privileged_verified_at"] = timezone.now().timestamp()
        tokens = issue_token_pair(user)
        return Response({"id": user.pk, "phone_e164": phone, **tokens})


class PasswordLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        identifier = (request.data.get("username") or request.data.get("phone_e164") or "").strip()
        password = request.data.get("password") or ""
        if not identifier or not password:
            raise ValidationError({"detail": "Username or phone and password are required."})
        User = get_user_model()
        candidate = User.objects.filter(phone_e164=identifier).first() or User.objects.filter(username=identifier).first()
        user = authenticate(request._request, username=candidate.username, password=password) if candidate else None
        if not user or not user.is_active:
            return Response({"error": {"code": "INVALID_CREDENTIALS", "message": "Invalid credentials.", "fields": {}, "request_id": ""}}, status=401)
        login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
        request._request.session["privileged_verified_at"] = timezone.now().timestamp()
        tokens = issue_token_pair(user)
        return Response({"id": user.pk, "phone_e164": user.phone_e164, **tokens})


class DevPhoneLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if settings.ENVIRONMENT not in {"development", "test"}:
            raise PermissionDenied("Development phone login is disabled in managed environments.")
        phone = valid_phone(request.data.get("phone_e164"))
        User = get_user_model()
        user, _ = User.objects.get_or_create(phone_e164=phone, defaults={"username": phone, "is_active": True})
        if not user.is_active:
            raise PermissionDenied("User account is inactive.")
        login(request._request, user, backend="django.contrib.auth.backends.ModelBackend")
        request._request.session["privileged_verified_at"] = timezone.now().timestamp()
        tokens = issue_token_pair(user)
        return Response({"id": user.pk, "phone_e164": user.phone_e164, **tokens})


class RefreshTokenView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @transaction.atomic
    def post(self, request):
        refresh = (request.data.get("refresh") or "").strip()
        if not refresh:
            raise ValidationError({"refresh": ["Refresh token is required."]})
        try:
            claims = decode_jwt(refresh, expected_type="refresh")
            jti = claims.get("jti", "")
            if BlacklistedRefreshToken.objects.filter(jti=jti).exists():
                raise AuthenticationFailed("Refresh token has been revoked.")
            User = get_user_model()
            user = User.objects.filter(pk=claims.get("sub"), is_active=True).first()
            if not user:
                raise AuthenticationFailed("User account not found or inactive.")
        except AuthenticationFailed as exc:
            return Response({"error": {"code": "INVALID_REFRESH", "message": str(exc.detail), "fields": {}, "request_id": ""}}, status=401)
        exp_dt = datetime.fromtimestamp(int(claims["exp"]), tz=dt_timezone.utc)
        BlacklistedRefreshToken.objects.get_or_create(jti=jti, defaults={"user": user, "expires_at": exp_dt})
        tokens = issue_token_pair(user)
        return Response(tokens)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = CustomerProfile.objects.filter(user=request.user).first()
        return Response({
            "id": request.user.pk,
            "customer_code": request.user.customer_code,
            "phone_e164": request.user.phone_e164,
            "username": request.user.username,
            "email": request.user.email,
            "full_name": profile.full_name if profile else request.user.get_full_name(),
            "alternate_phone": profile.alternate_phone if profile else "",
            "preferred_language": profile.preferred_language if profile else "en",
        })

    def patch(self, request):
        profile, _ = CustomerProfile.objects.get_or_create(user=request.user)
        for field in ("full_name", "alternate_phone", "preferred_language"):
            if field in request.data:
                setattr(profile, field, str(request.data[field])[:120])
        if "email" in request.data:
            request.user.email = serializers.EmailField(allow_blank=True).run_validation(request.data["email"])
            request.user.save(update_fields=["email"])
        profile.save()
        return self.get(request)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = (request.data.get("refresh") or "").strip()
        if refresh:
            try:
                claims = decode_jwt(refresh, expected_type="refresh")
                exp_dt = datetime.fromtimestamp(int(claims["exp"]), tz=dt_timezone.utc)
                BlacklistedRefreshToken.objects.get_or_create(
                    jti=claims.get("jti", ""),
                    defaults={"user": request.user, "expires_at": exp_dt},
                )
            except AuthenticationFailed:
                pass
        logout(request._request)
        return Response({"status": "signed_out"})
