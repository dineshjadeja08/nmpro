import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_local_env_file(env_path: Path) -> None:
    """Load simple KEY=VALUE lines from .env.local in development without overriding existing env."""
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_RUNNING_PYTEST = "pytest" in sys.modules or (
    len(sys.argv) > 0 and Path(sys.argv[0]).name.startswith("pytest")
)

ENVIRONMENT = os.getenv("NAMMAPROS_ENV", "development")
if ENVIRONMENT not in {"development", "test", "staging", "production"}:
    raise ImproperlyConfigured("NAMMAPROS_ENV must be development, test, staging or production")

if ENVIRONMENT == "development" and not _RUNNING_PYTEST:
    _load_local_env_file(BASE_DIR / ".env.local")
    _load_local_env_file(BASE_DIR.parent.parent / ".env.local")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "local-development-only-not-for-production")
DEBUG = ENVIRONMENT == "development" and os.getenv("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",") if host.strip()]
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003").split(",") if origin.strip()]
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [origin.strip() for origin in os.getenv(
    "DJANGO_CSRF_TRUSTED_ORIGINS", ",".join(CORS_ALLOWED_ORIGINS)).split(",") if origin.strip()]

if ENVIRONMENT in {"staging", "production"}:
    if DEBUG or SECRET_KEY == "local-development-only-not-for-production" or len(SECRET_KEY) < 50:
        raise ImproperlyConfigured("Staging and production need a private secret and DEBUG disabled")
    if not all(os.getenv(k) for k in ("DATABASE_URL", "DJANGO_ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS",
                                   "DJANGO_CSRF_TRUSTED_ORIGINS")):
        raise ImproperlyConfigured("Set explicit database, hosts, CORS and CSRF origins")
    if not ALLOWED_HOSTS or any(h == "*" or "localhost" in h or "127.0.0.1" in h for h in ALLOWED_HOSTS):
        raise ImproperlyConfigured("Use explicit public hosts")
    if any(not origin.startswith("https://") or "localhost" in origin or "127.0.0.1" in origin
           for origin in CORS_ALLOWED_ORIGINS + CSRF_TRUSTED_ORIGINS):
        raise ImproperlyConfigured("CORS and CSRF origins must be explicit HTTPS origins")

INSTALLED_APPS = [
    "django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions",
    "django.contrib.messages", "django.contrib.staticfiles", "corsheaders", "rest_framework", "drf_spectacular", "common",
    "domains.users", "domains.catalog", "domains.locations", "domains.bookings",
    "domains.technicians", "domains.payments", "domains.notifications", "domains.audit", "domains.operations",
    "domains.administration",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware", "common.middleware.RequestIdMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware", "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware", "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{"BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True,
              "OPTIONS": {"context_processors": ["django.template.context_processors.request"]}}]
WSGI_APPLICATION = "config.wsgi.application"
AUTH_USER_MODEL = "users.User"

_MIGRATION_COMMANDS = {"migrate", "makemigrations", "showmigrations", "squashmigrations"}
_is_migration_cmd = len(sys.argv) > 1 and sys.argv[1] in _MIGRATION_COMMANDS
_direct_database_url = os.getenv("DATABASE_URL_UNPOOLED") or os.getenv("DIRECT_URL")
database_url = (_direct_database_url if _is_migration_cmd and _direct_database_url else None) or os.getenv("DATABASE_URL")
if not database_url and ENVIRONMENT in {"staging", "production"}:
    raise ImproperlyConfigured("DATABASE_URL is required")
DATABASES = {"default": dj_database_url.parse(database_url) if database_url else {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
if DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql":
    db_host = str(DATABASES["default"].get("HOST", ""))
    if "-pooler" in db_host or os.getenv("DB_DISABLE_SERVER_SIDE_CURSORS", "false").lower() == "true":
        # Required by Neon PgBouncer transaction pooling when using psycopg3
        DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
    if ENVIRONMENT in {"staging", "production"}:
        DATABASES["default"]["CONN_MAX_AGE"] = int(os.getenv("DB_CONN_MAX_AGE", "0"))
        DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
        if not db_host.startswith("/cloudsql/"):
            DATABASES["default"].setdefault("OPTIONS", {})["sslmode"] = "require"
    elif "neon.tech" in db_host:
        DATABASES["default"]["CONN_MAX_AGE"] = int(os.getenv("DB_CONN_MAX_AGE", "0"))
        DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
        DATABASES["default"].setdefault("OPTIONS", {})["sslmode"] = "require"
elif ENVIRONMENT in {"staging", "production"}:
    raise ImproperlyConfigured("Managed environments require PostgreSQL")
if ENVIRONMENT == "test":
    DATABASES["default"] = {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
REDIS_URL = os.getenv("REDIS_URL", "")
if ENVIRONMENT in {"staging", "production"} and not REDIS_URL:
    raise ImproperlyConfigured("Managed environments need REDIS_URL for shared throttling and jobs")
_redis_host = (urlparse(REDIS_URL).hostname or "") if REDIS_URL else ""
_is_render_internal_redis = REDIS_URL.startswith("redis://") and _redis_host.startswith("red-") and "." not in _redis_host
if ENVIRONMENT in {"staging", "production"} and not (REDIS_URL.startswith("rediss://") or _is_render_internal_redis):
    raise ImproperlyConfigured("Managed Redis must use TLS (rediss://)")
CACHES = {"default": {"BACKEND": "django_redis.cache.RedisCache", "LOCATION": REDIS_URL,
                      "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient", "IGNORE_EXCEPTIONS": False},
                      "KEY_PREFIX": f"nammapros:{ENVIRONMENT}"}} if REDIS_URL and ENVIRONMENT != "test" else {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "common.jwt.BearerAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "EXCEPTION_HANDLER": "common.errors.exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle", "rest_framework.throttling.UserRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "120/min", "user": "120/min", "otp_request": "5/min", "otp_verify": "20/min"},
}
JWT_SIGNING_KEY = os.getenv("JWT_SIGNING_KEY", SECRET_KEY)
JWT_ACCESS_SECONDS = int(os.getenv("JWT_ACCESS_SECONDS", "3600"))
JWT_REFRESH_SECONDS = int(os.getenv("JWT_REFRESH_SECONDS", str(60 * 60 * 24 * 14)))
PUSH_PROVIDER = os.getenv("PUSH_PROVIDER", "")
BOOKING_HOLD_MINUTES = int(os.getenv("BOOKING_HOLD_MINUTES", "5"))
if not 1 <= BOOKING_HOLD_MINUTES <= 30:
    raise ImproperlyConfigured("BOOKING_HOLD_MINUTES must be between 1 and 30")
PAYMENT_CHECKOUT_MINUTES = int(os.getenv("PAYMENT_CHECKOUT_MINUTES", "10"))
if not 5 <= PAYMENT_CHECKOUT_MINUTES <= 30:
    raise ImproperlyConfigured("PAYMENT_CHECKOUT_MINUTES must be between 5 and 30")
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_ENABLED = os.getenv("RAZORPAY_ENABLED", "false").lower() == "true"
PUBLIC_BOOKING_ENABLED = os.getenv("PUBLIC_BOOKING_ENABLED", "true" if ENVIRONMENT == "development" else "false").lower() == "true"
PILOT_ENABLED = os.getenv("PILOT_ENABLED", "false").lower() == "true"
PILOT_ZONE_IDS = [part.strip() for part in os.getenv("PILOT_ZONE_IDS", "").split(",") if part.strip()]
PILOT_SERVICE_SLUGS = [part.strip() for part in os.getenv("PILOT_SERVICE_SLUGS", "").split(",") if part.strip()]
PILOT_DAILY_BOOKING_LIMIT = int(os.getenv("PILOT_DAILY_BOOKING_LIMIT", "0"))
if ENVIRONMENT != "development" and PUBLIC_BOOKING_ENABLED and not PILOT_ENABLED:
    raise ImproperlyConfigured("Managed environments require pilot limits before public booking can open")
if PILOT_ENABLED:
    if not PILOT_ZONE_IDS or not PILOT_SERVICE_SLUGS or not 1 <= PILOT_DAILY_BOOKING_LIMIT <= 100:
        raise ImproperlyConfigured("Pilot needs explicit zone IDs, service slugs and a daily booking limit")
    try:
        PILOT_ZONE_IDS = [str(UUID(zone_id)) for zone_id in PILOT_ZONE_IDS]
    except ValueError as exc:
        raise ImproperlyConfigured("Pilot zone IDs must be UUIDs") from exc
AUTOMATIC_DISPATCH_ENABLED = os.getenv("AUTOMATIC_DISPATCH_ENABLED", "true" if ENVIRONMENT == "development" else "false").lower() == "true"
NEW_SERVICE_ZONES_ENABLED = os.getenv("NEW_SERVICE_ZONES_ENABLED", "true" if ENVIRONMENT == "development" else "false").lower() == "true"
WHATSAPP_ENABLED = os.getenv("WHATSAPP_ENABLED", "false").lower() == "true"
TECHNICIAN_PAYOUTS_ENABLED = False  # No live payout provider is integrated.
MSG91_AUTH_KEY = os.getenv("MSG91_AUTH_KEY", "")
MSG91_OTP_TEMPLATE_ID = os.getenv("MSG91_OTP_TEMPLATE_ID", "")
OTP_CODE_LENGTH = int(os.getenv("OTP_CODE_LENGTH", "6"))
if OTP_CODE_LENGTH not in (4, 6):
    raise ImproperlyConfigured("OTP_CODE_LENGTH must be 4 or 6")
WHATSAPP_PROVIDER = os.getenv("WHATSAPP_PROVIDER", "")
WHATSAPP_INTEGRATED_NUMBER = os.getenv("WHATSAPP_INTEGRATED_NUMBER", "")
WHATSAPP_LANGUAGE_CODE = os.getenv("WHATSAPP_LANGUAGE_CODE", "en")
SMS_PROVIDER = os.getenv("SMS_PROVIDER", "")
SMS_VARIABLE_NAME = os.getenv("SMS_VARIABLE_NAME", "VAR1")
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "")
EMAIL_FROM_ADDRESS = os.getenv("EMAIL_FROM_ADDRESS", "")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = True
try:
    WHATSAPP_TEMPLATES = json.loads(os.getenv("WHATSAPP_TEMPLATES_JSON", "{}"))
    SMS_TEMPLATES = json.loads(os.getenv("SMS_TEMPLATES_JSON", "{}"))
except ValueError as exc:
    raise ImproperlyConfigured("Messaging template maps must be JSON objects") from exc
if not isinstance(WHATSAPP_TEMPLATES, dict) or not isinstance(SMS_TEMPLATES, dict):
    raise ImproperlyConfigured("Messaging template maps must be JSON objects")
if WHATSAPP_PROVIDER not in ("", "MSG91"):
    raise ImproperlyConfigured("Unsupported WHATSAPP_PROVIDER")
if WHATSAPP_PROVIDER == "MSG91" and not (MSG91_AUTH_KEY and WHATSAPP_INTEGRATED_NUMBER and WHATSAPP_TEMPLATES):
    raise ImproperlyConfigured("MSG91 WhatsApp needs auth, integrated number and approved templates")
if SMS_PROVIDER not in ("", "MSG91") or EMAIL_PROVIDER not in ("", "SMTP"):
    raise ImproperlyConfigured("Unsupported SMS or email provider")
if SMS_PROVIDER == "MSG91" and not (MSG91_AUTH_KEY and SMS_TEMPLATES and SMS_VARIABLE_NAME.isidentifier()):
    raise ImproperlyConfigured("MSG91 SMS needs auth, approved templates and a variable name")
if EMAIL_PROVIDER == "SMTP" and not all((EMAIL_FROM_ADDRESS, EMAIL_HOST, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD)):
    raise ImproperlyConfigured("SMTP email requires sender, host, user and password")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
FIREBASE_WEB_API_KEY = os.getenv("FIREBASE_WEB_API_KEY", "")
FIREBASE_AUTH_DOMAIN = os.getenv("FIREBASE_AUTH_DOMAIN", "")

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")
CLOUDINARY_ENABLED = bool(CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
LOCATION_PROVIDER_TIMEOUT_SECONDS = int(os.getenv("LOCATION_PROVIDER_TIMEOUT_SECONDS", "6"))
LOCATION_AUTOCOMPLETE_CACHE_SECONDS = int(os.getenv("LOCATION_AUTOCOMPLETE_CACHE_SECONDS", "300"))
LOCATION_REVERSE_CACHE_SECONDS = int(os.getenv("LOCATION_REVERSE_CACHE_SECONDS", "86400"))

if ENVIRONMENT in {"staging", "production"} and not (FIREBASE_PROJECT_ID or (MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID)):
    raise ImproperlyConfigured("Customer authentication in managed environments requires Firebase or approved OTP credentials")
if RAZORPAY_ENABLED:
    if not all((RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET)):
        raise ImproperlyConfigured("Razorpay requires API and webhook credentials")
    expected_prefix = "rzp_live_" if ENVIRONMENT == "production" else "rzp_test_"
    if not RAZORPAY_KEY_ID.startswith(expected_prefix):
        raise ImproperlyConfigured("Razorpay key mode does not match the environment")
elif ENVIRONMENT in {"staging", "production"} and any((RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET)):
    raise ImproperlyConfigured("Do not configure Razorpay credentials while payments are disabled")
if os.getenv("TECHNICIAN_PAYOUTS_ENABLED", "false").lower() == "true":
    raise ImproperlyConfigured("Live payouts are unavailable until a provider and reconciliation are implemented")
LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_TZ = True
STATIC_URL = "static/"
MEDIA_ROOT = BASE_DIR / "var" / "private-media"
PRIVATE_MEDIA_BUCKET = os.getenv("PRIVATE_MEDIA_BUCKET", "")
if PRIVATE_MEDIA_BUCKET:
    STORAGES = {"default": {"BACKEND": "common.storage.PrivateGCSStorage"},
                "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}}
elif ENVIRONMENT in {"staging", "production"}:
    raise ImproperlyConfigured("Managed environments require PRIVATE_MEDIA_BUCKET")
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_AGE = 60 * 60 * 12
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
CROSS_SITE_COOKIES = (
    ENVIRONMENT in {"staging", "production"}
    and os.getenv("DJANGO_CROSS_SITE_COOKIES", "true").lower() == "true"
)
SESSION_COOKIE_SAMESITE = "None" if CROSS_SITE_COOKIES else "Lax"
CSRF_COOKIE_SAMESITE = "None" if CROSS_SITE_COOKIES else "Lax"
if ENVIRONMENT in {"staging", "production"}:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_HSTS_SECONDS", "300"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if os.getenv(
        "DJANGO_TRUST_PROXY_HEADERS", "false").lower() == "true" else None

LOGGING = {
    "version": 1, "disable_existing_loggers": False,
    "formatters": {"json": {"format": "%(message)s", "class": "common.logging.JsonFormatter"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "json"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(dsn=SENTRY_DSN, environment=ENVIRONMENT, send_default_pii=False,
                    max_request_body_size="never",
                    traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0")))
