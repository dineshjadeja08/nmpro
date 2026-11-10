import os
import subprocess
import sys

import pytest
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from domains.catalog.models import Category, Service


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
