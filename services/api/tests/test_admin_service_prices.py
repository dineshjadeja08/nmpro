import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from domains.administration.models import StaffRole
from domains.catalog.models import Category, PricingRule, Service, ServicePackage
from domains.locations.models import City, ServiceCoverage, Zone


def admin_client():
    user = get_user_model().objects.create_user(
        username="+919999990881", phone_e164="+919999990881", is_active=True,
    )
    StaffRole.objects.create(user=user, role="SUPER_ADMIN", assigned_by=user)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_service_price_editor_versions_zone_price_and_shows_original():
    client = admin_client()
    category = Category.objects.create(slug="price-editor", name="Price editor", is_active=True)
    city = City.objects.create(slug="price-city", name="Price City", is_active=True)
    zone = Zone.objects.create(city=city, name="North", postal_code="600081", is_active=True)
    other_zone = Zone.objects.create(city=city, name="South", postal_code="600083", is_active=True)
    service = Service.objects.create(
        category=category, slug="price-editor-service", name="Example service",
        summary="Example service", starting_price_paise=70000, is_active=True,
    )
    package = ServicePackage.objects.create(
        service=service, name="Standard", pricing_model="FIXED_PRICE",
        duration_minutes=60, skill_code="PRICE_SPECIALIST", is_active=True,
    )
    old = PricingRule.objects.create(
        package=package, zone=zone, base_paise=70000,
        payment_policy="PAY_AT_VISIT", is_active=True, version=1,
    )
    other_rule = PricingRule.objects.create(
        package=package, zone=other_zone, base_paise=70000,
        payment_policy="PAY_AT_VISIT", is_active=True, version=1,
    )
    ServiceCoverage.objects.create(service=service, zone=zone, is_active=True)
    ServiceCoverage.objects.create(service=service, zone=other_zone, is_active=True)
    path = f"/api/v1/admin/services/{service.id}/price-settings/"

    before = client.get(path)
    assert before.status_code == 200
    assert before.json()["packages"][0]["zones"][0]["price_paise"] == 70000
    changed = client.patch(path, {
        "package_id": str(package.id),
        "original_price_paise": 80000,
        "zone_prices": [{
            "zone_id": str(zone.id), "price_paise": 65000,
            "expected_rule_id": str(old.id),
        }],
    }, format="json")
    assert changed.status_code == 200, changed.content
    package.refresh_from_db()
    service.refresh_from_db()
    old.refresh_from_db()
    latest = PricingRule.objects.get(package=package, zone=zone, is_active=True)
    assert old.is_active is False
    assert latest.version == 2
    assert latest.base_paise == 65000
    other_rule.refresh_from_db()
    assert other_rule.is_active and other_rule.base_paise == 70000
    assert package.original_price_paise == 80000
    assert service.starting_price_paise == 65000

    public = APIClient().get("/api/v1/catalog/services/", {
        "category": category.slug, "pincode": zone.postal_code,
    }).json()["services"][0]
    assert public["packages"][0]["price_paise"] == 65000
    assert public["packages"][0]["mrp_paise"] == 80000

    invalid = client.patch(path, {
        "package_id": str(package.id),
        "original_price_paise": 60000,
        "zone_prices": [],
    }, format="json")
    assert invalid.status_code == 400
    assert PricingRule.objects.filter(package=package, zone=zone).count() == 2


@pytest.mark.django_db
def test_service_price_editor_can_create_first_package():
    client = admin_client()
    category = Category.objects.create(slug="new-price-editor", name="New price editor", is_active=True)
    city = City.objects.create(slug="new-price-city", name="New Price City", is_active=True)
    zone = Zone.objects.create(city=city, name="South", postal_code="600082", is_active=True)
    service = Service.objects.create(
        category=category, slug="new-price-editor-service", name="New service",
        summary="New service", is_active=True,
    )
    changed = client.patch(f"/api/v1/admin/services/{service.id}/price-settings/", {
        "package_id": None, "duration_minutes": 45,
        "original_price_paise": 80000,
        "zone_prices": [{"zone_id": str(zone.id), "price_paise": 65000, "expected_rule_id": None}],
        "activate_package": True,
    }, format="json")
    assert changed.status_code == 200, changed.content
    package = ServicePackage.objects.get(service=service)
    assert package.is_active
    assert package.original_price_paise == 80000
    assert PricingRule.objects.get(package=package, zone=zone, is_active=True).base_paise == 65000
    assert ServiceCoverage.objects.get(service=service, zone=zone).is_active


@pytest.mark.django_db
def test_common_price_and_advance_apply_to_every_area_and_new_area():
    client = admin_client()
    category = Category.objects.create(slug="common-prices", name="Common prices", is_active=True)
    city = City.objects.create(slug="chennai", name="Chennai", is_active=True)
    north = Zone.objects.create(city=city, name="North", postal_code="600081", is_active=True)
    south = Zone.objects.create(city=city, name="South", postal_code="600083", is_active=True)
    service = Service.objects.create(category=category, slug="common-service", name="Common service", is_active=True)
    package = ServicePackage.objects.create(service=service, name="Standard", pricing_model="FIXED_PRICE",
                                            duration_minutes=60, skill_code="COMMON", is_active=True)
    for zone in (north, south):
        PricingRule.objects.create(package=package, zone=zone, base_paise=70000,
                                   payment_policy="PAY_AT_VISIT", is_active=True, version=1)
    response = client.patch(f"/api/v1/admin/services/{service.id}/price-settings/", {
        "package_id": str(package.id), "common_price_paise": 65000,
        "original_price_paise": 80000, "payment_policy": "ADVANCE", "advance_type": "FIXED",
        "advance_amount_paise": 4900, "advance_percentage": 0,
    }, format="json")
    assert response.status_code == 200, response.content
    rules = PricingRule.objects.filter(package=package, is_active=True)
    assert rules.count() == 2
    assert all(rule.base_paise == 65000 and rule.advance_amount_paise == 4900 for rule in rules)
    payment = client.patch(f"/api/v1/admin/services/{service.id}/price-settings/", {
        "apply_payment_to_service": True, "payment_policy": "ADVANCE", "advance_type": "FIXED",
        "advance_amount_paise": 9900, "advance_percentage": 0,
    }, format="json")
    assert payment.status_code == 200, payment.content
    assert all(rule.advance_amount_paise == 9900 for rule in PricingRule.objects.filter(package=package, is_active=True))
    created = client.post("/api/v1/admin/zones/", {"name": "East", "postal_code": "600084"}, format="json")
    assert created.status_code == 201, created.content
    new_zone = Zone.objects.get(postal_code="600084")
    assert new_zone.is_active and not new_zone.services_configured
    cloned = PricingRule.objects.get(package=package, zone=new_zone, is_active=True)
    assert cloned.base_paise == 65000 and cloned.advance_amount_paise == 9900
