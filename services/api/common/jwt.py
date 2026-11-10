import base64
import hashlib
import hmac
import json
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def _signing_key() -> bytes:
    key = getattr(settings, "JWT_SIGNING_KEY", "") or settings.SECRET_KEY
    return key.encode("utf-8")


def encode_jwt(payload: dict, ttl_seconds: int) -> str:
    now = int(timezone.now().timestamp())
    claims = {
        **payload,
        "iat": now,
        "exp": now + ttl_seconds,
        "jti": payload.get("jti") or secrets.token_hex(16),
    }
    header_b64 = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(claims, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    sig = hmac.new(_signing_key(), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(sig)}"


def decode_jwt(token: str, expected_type: str = "access") -> dict:
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_sig = hmac.new(_signing_key(), signing_input, hashlib.sha256).digest()
        actual_sig = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            raise AuthenticationFailed("Invalid token signature.")
        claims = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except AuthenticationFailed:
        raise
    except Exception as exc:
        raise AuthenticationFailed("Malformed authentication token.") from exc

    now = int(timezone.now().timestamp())
    if int(claims.get("exp", 0)) <= now:
        raise AuthenticationFailed("Authentication token has expired.")
    if claims.get("token_type") != expected_type:
        raise AuthenticationFailed("Unsupported authentication token type.")
    return claims


def issue_token_pair(user) -> dict:
    access_ttl = getattr(settings, "JWT_ACCESS_SECONDS", 3600)
    refresh_ttl = getattr(settings, "JWT_REFRESH_SECONDS", 60 * 60 * 24 * 14)
    access = encode_jwt({"sub": str(user.pk), "phone": user.phone_e164 or "", "token_type": "access"}, access_ttl)
    refresh = encode_jwt({"sub": str(user.pk), "token_type": "refresh"}, refresh_ttl)
    return {"access": access, "refresh": refresh, "expires_in": access_ttl}


class BearerAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header or not header.startswith(f"{self.keyword} "):
            return None
        token = header[len(self.keyword) + 1:].strip()
        if not token:
            return None
        claims = decode_jwt(token, expected_type="access")
        User = get_user_model()
        user = User.objects.filter(pk=claims.get("sub"), is_active=True).first()
        if not user:
            raise AuthenticationFailed("User account not found or inactive.")
        return user, claims


try:
    from drf_spectacular.extensions import OpenApiAuthenticationExtension

    class BearerAuthenticationScheme(OpenApiAuthenticationExtension):
        target_class = "common.jwt.BearerAuthentication"
        name = "bearerAuth"

        def get_security_definition(self, auto_schema):
            return {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}
except Exception:
    pass
