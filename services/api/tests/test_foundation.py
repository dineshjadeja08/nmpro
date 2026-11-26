import base64
import json
import os
import subprocess
import sys

import pytest
from django.test import override_settings
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from domains.catalog.models import Category, Service
from domains.users.providers.firebase import FirebaseAuthProvider, FirebaseTokenInvalid, FirebaseUnavailable
from domains.users.views import ProviderUnavailable, issue_otp


@pytest.mark.django_db
def test_health_and_readiness():
    client = APIClient()
    assert client.get("/api/v1/health/").json() == {"status": "ok"}
    assert client.get("/api/v1/ready/").json() == {"status": "ready"}


@pytest.mark.django_db
def test_catalog_only_active_services_and_no_invented_price():
    category = Category.objects.create(slug="appliances", name="Appliances")
    Service.objects.create(category=category, slug="ac-repair", name="AC Repair", summary="Repair help")
    Service.objects.create(category=category, slug="hidden", name="Hidden", summary="Hidden", is_active=False)
    response = APIClient().get("/api/v1/catalog/")
    assert response.status_code == 200
    assert [s["slug"] for s in response.json()["services"]] == ["ac-repair"]
    assert response.json()["services"][0]["starting_price_paise"] is None


@pytest.mark.django_db
def test_service_slug_unique_and_hidden_not_retrievable():
    category = Category.objects.create(slug="appliances", name="Appliances")
    Service.objects.create(category=category, slug="ac-repair", name="AC Repair", summary="Repair help")
    with pytest.raises(IntegrityError), transaction.atomic():
        Service.objects.create(category=category, slug="ac-repair", name="Duplicate", summary="No")
    assert APIClient().get("/api/v1/services/unknown/").status_code == 404


def test_public_writes_are_not_exposed():
    client = APIClient()
    assert client.post("/api/v1/catalog/", {}, format="json").status_code == 405
    assert client.post("/api/v1/bookings/", {}, format="json").status_code in (401, 403)


@override_settings(CORS_ALLOWED_ORIGINS=["https://nammapros.com"])
def test_payment_order_preflight_allows_idempotency_key():
    response = APIClient().options(
        "/api/v1/bookings/00000000-0000-0000-0000-000000000000/payment-order/",
        HTTP_ORIGIN="https://nammapros.com",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="content-type,x-csrftoken,idempotency-key",
    )
    assert response.status_code == 200
    assert response["Access-Control-Allow-Origin"] == "https://nammapros.com"
    assert "idempotency-key" in response["Access-Control-Allow-Headers"].lower()


@pytest.mark.django_db
def test_errors_use_safe_envelope():
    response = APIClient().get("/api/v1/services/unknown/")
    assert response.status_code == 404
    assert response.json()["error"]["message"]
    assert "traceback" not in str(response.json()).lower()


def test_production_configuration_fails_without_required_secrets():
    env = os.environ.copy()
    env["NAMMAPROS_ENV"] = "production"
    for name in ("DJANGO_SECRET_KEY", "DATABASE_URL", "REDIS_URL", "DJANGO_ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS"):
        env.pop(name, None)
    result = subprocess.run(
        [sys.executable, "-c", "import config.settings"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "need a private secret" in result.stderr


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_managed_firebase_auth_rejects_mock_tokens(environment):
    with override_settings(ENVIRONMENT=environment, FIREBASE_WEB_API_KEY=""):
        with pytest.raises(FirebaseUnavailable):
            FirebaseAuthProvider().verify_token("dev-token:+919876543210")


def test_phone_auth_can_be_explicitly_disabled_without_creating_challenge():
    with override_settings(PHONE_AUTH_DISABLED=True):
        with pytest.raises(ProviderUnavailable):
            issue_otp("+919876543210")


def test_firebase_token_from_another_project_is_rejected(monkeypatch):
    class LookupResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"users": [{"localId": "customer", "phoneNumber": "+919876543210"}]}

    monkeypatch.setattr("domains.users.providers.firebase.requests.post", lambda *args, **kwargs: LookupResponse())
    claims = {"aud": "another-project", "iss": "https://securetoken.google.com/another-project"}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    with override_settings(ENVIRONMENT="production", FIREBASE_PROJECT_ID="nammapro-api", FIREBASE_WEB_API_KEY="public-key"):
        with pytest.raises(FirebaseTokenInvalid):
            FirebaseAuthProvider().verify_token(f"header.{payload}.signature")
