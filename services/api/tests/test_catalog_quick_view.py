"""Catalogue API for the home page, category page, quick view popup, reviews and guest cart merge."""
import itertools

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from domains.administration.models import StaffRole
from domains.bookings.models import AppointmentSlot, Booking, CartItem
from domains.catalog.models import FAQ, Category, PricingRule, Review, Service, ServicePackage
from domains.catalog.pricing import display_name
from domains.locations.models import Address, City, Zone

_ref = itertools.count(1)


@pytest.fixture
def catalog(db):
    from django.core.cache import cache

    cache.clear()
    city = City.objects.create(name="Chennai", slug="chennai", is_active=True)
    adyar = Zone.objects.create(city=city, name="Adyar", postal_code="600020", is_active=True)
    tnagar = Zone.objects.create(city=city, name="T Nagar", postal_code="600017", is_active=True)
    ac = Category.objects.create(name="AC Service", slug="ac-service", is_active=True, sort_order=1,
                                 icon_url="https://cdn.example.com/icons/ac.svg")
    washer = Category.objects.create(name="Washing Machine", slug="washing-machine", is_active=True, sort_order=2)

    def make_service(category, slug, order, **extra):
        service = Service.objects.create(category=category, name=slug.replace("-", " ").title(), slug=slug,
                                         is_active=True, sort_order=order, **extra)
        package = ServicePackage.objects.create(service=service, name=f"{slug} standard", pricing_model="FIXED_PRICE",
                                                duration_minutes=60, skill_code="AC", is_active=True)
        return service, package

    foam, foam_pkg = make_service(ac, "foam-jet-ac-service", 1, is_popular=True,
                                  brands=[{"name": "LG", "logo_url": ""}, {"name": "Daikin", "logo_url": ""}],
                                  inclusions=["Indoor unit jet wash"], exclusions=["Gas refill"])
    foam_pkg.original_price_paise = 89900
    foam_pkg.save()
    PricingRule.objects.create(package=foam_pkg, zone=adyar, base_paise=64900, payment_policy="PAY_AT_VISIT", is_active=True)
    PricingRule.objects.create(package=foam_pkg, zone=tnagar, base_paise=69900, payment_policy="PAY_AT_VISIT", is_active=True)

    install, install_pkg = make_service(ac, "ac-installation", 2)
    PricingRule.objects.create(package=install_pkg, zone=adyar, base_paise=149900, payment_policy="PAY_AT_VISIT", is_active=True)
    hidden, _ = make_service(ac, "ac-old-service", 3)
    hidden.is_active = False
    hidden.save()
    repair, _ = make_service(washer, "washing-machine-repair", 1, is_featured=True)
    make_service(washer, "washing-machine-install", 2)
    FAQ.objects.create(category=ac, question="Do I need gas?", answer="Usually not.", is_active=True)

    User = get_user_model()
    customer = User.objects.create_user(username="cust-qv", phone_e164="+919800000001",
                                        first_name="Priya", last_name="Sundaram", email="priya@example.com")
    address = Address.objects.create(user=customer, line_1="10, 1st Cross", locality="Adyar", city="Chennai",
                                      postal_code="600020", contact_name="Priya")
    slot = AppointmentSlot.objects.create(zone=adyar, package=foam_pkg, start_at=timezone.now(),
                                          end_at=timezone.now() + timezone.timedelta(hours=1), capacity=50, is_active=True)
    return {"adyar": adyar, "tnagar": tnagar, "ac": ac, "foam": foam, "foam_pkg": foam_pkg, "install": install,
            "hidden": hidden, "repair": repair, "customer": customer, "address": address, "slot": slot}


def add_review(catalog, rating, comment="", visible=True, service=None):
    service = service or catalog["foam"]
    booking = Booking.objects.create(user=catalog["customer"], service=service, package=catalog["foam_pkg"],
                                     address=catalog["address"], slot=catalog["slot"], status="COMPLETED",
                                     reference=f"NP-QV-{next(_ref):04d}")
    return Review.objects.create(booking=booking, service=service, customer=catalog["customer"],
                                 rating=rating, comment=comment, is_visible=visible)


def test_display_name_is_first_name_and_initial():
    User = get_user_model()
    assert display_name(User(first_name="Priya", last_name="Sundaram")) == "Priya S."
    assert display_name(User(first_name="Priya Devi", last_name="")) == "Priya"
    assert display_name(User(first_name="", last_name="")) == "Customer"
    assert display_name(None) == "Customer"


def test_category_list_includes_icon(catalog):
    data = APIClient().get("/api/v1/service-categories/").json()["categories"]
    ac = next(c for c in data if c["slug"] == "ac-service")
    assert ac["icon_url"] == "https://cdn.example.com/icons/ac.svg"


def test_zone_price_mrp_and_discount(catalog):
    client = APIClient()
    adyar = client.get(f"/api/v1/services/foam-jet-ac-service/?zone_id={catalog['adyar'].id}").json()
    pkg = adyar["packages"][0]
    assert pkg["price_paise"] == 64900
    assert pkg["mrp_paise"] == 89900
    assert pkg["discount_percent"] == 28
    assert pkg["is_available_in_zone"] is True
    assert adyar["starting_price_paise"] == 64900
    assert adyar["starting_mrp_paise"] == 89900

    by_pin = client.get("/api/v1/services/foam-jet-ac-service/?pincode=600017").json()
    assert by_pin["packages"][0]["price_paise"] == 69900

    no_zone = client.get("/api/v1/services/foam-jet-ac-service/").json()["packages"][0]
    assert no_zone["price_paise"] == 64900
    assert no_zone["price_is_from"] is True
    assert no_zone["is_available_in_zone"] is None

    install_tnagar = client.get(f"/api/v1/services/ac-installation/?zone_id={catalog['tnagar'].id}").json()["packages"][0]
    assert install_tnagar["price_paise"] is None
    assert install_tnagar["is_available_in_zone"] is False

    bad_zone = client.get("/api/v1/services/foam-jet-ac-service/?zone_id=not-a-uuid")
    assert bad_zone.status_code == 200


def test_mrp_hidden_when_not_above_price(catalog):
    catalog["foam_pkg"].original_price_paise = 60000
    catalog["foam_pkg"].save()
    pkg = APIClient().get(f"/api/v1/services/foam-jet-ac-service/?zone_id={catalog['adyar'].id}").json()["packages"][0]
    assert pkg["mrp_paise"] is None
    assert pkg["discount_percent"] is None


def test_ratings_on_service_cards(catalog):
    add_review(catalog, 5)
    add_review(catalog, 4)
    add_review(catalog, 1, visible=False)
    services = APIClient().get("/api/v1/services/?category=ac-service").json()["services"]
    foam = next(s for s in services if s["slug"] == "foam-jet-ac-service")
    assert foam["average_rating"] == 4.5
    assert foam["rating_avg"] == 4.5
    assert foam["review_count"] == 2
    install = next(s for s in services if s["slug"] == "ac-installation")
    assert install["average_rating"] is None
    assert install["review_count"] == 0


def test_popular_services_capped_and_filled(catalog):
    client = APIClient()
    popular = client.get("/api/v1/services/?popular=true").json()["services"]
    slugs = [s["slug"] for s in popular]
    assert len(slugs) == 4
    assert slugs[0] == "foam-jet-ac-service"
    assert slugs[1] == "washing-machine-repair"
    assert "ac-old-service" not in slugs
    assert len(client.get("/api/v1/services/?popular=true&limit=2").json()["services"]) == 2
    assert len(client.get("/api/v1/services/?popular=true&limit=50").json()["services"]) <= 12
    assert client.get("/api/v1/services/?limit=abc").status_code == 400


def test_category_page_lists_only_active_sub_services(catalog):
    data = APIClient().get(f"/api/v1/service-categories/ac-service/?zone_id={catalog['adyar'].id}").json()
    assert [s["slug"] for s in data["services"]] == ["foam-jet-ac-service", "ac-installation"]
    assert data["category"]["sub_service_count"] == 2
    assert data["services"][0]["brands"][0]["name"] == "LG"
    assert data["services"][0]["packages"][0]["price_paise"] == 64900
    assert data["faqs"][0]["question"] == "Do I need gas?"


def test_quick_view_in_one_call(catalog):
    add_review(catalog, 5, "Very clean work")
    add_review(catalog, 4, "On time")
    data = APIClient().get(f"/api/v1/services/foam-jet-ac-service/?zone_id={catalog['adyar'].id}").json()
    assert data["inclusions"] == ["Indoor unit jet wash"]
    assert data["exclusions"] == ["Gas refill"]
    assert data["brands"] == [{"name": "LG", "logo_url": ""}, {"name": "Daikin", "logo_url": ""}]
    assert data["rating_breakdown"] == {"5": 1, "4": 1, "3": 0, "2": 0, "1": 0}
    assert len(data["recent_reviews"]) == 2
    assert data["recent_reviews"][0]["customer_name"] == "Priya S."
    assert "images" in data and "popup_cover_image" in data


def test_reviews_are_private_paginated_and_filtered(catalog):
    for i in range(12):
        add_review(catalog, 5 if i % 2 else 3, comment="Good" if i % 3 else "")
    add_review(catalog, 1, "hidden", visible=False)
    client = APIClient()
    first = client.get("/api/v1/services/foam-jet-ac-service/reviews/").json()
    assert first["count"] == 12
    assert len(first["results"]) == 10
    assert first["next"] and first["previous"] is None
    body = str(first)
    assert "Sundaram" not in body and "priya@example.com" not in body and "+919800000001" not in body
    assert first["results"][0]["customer_name"] == "Priya S."

    second = client.get("/api/v1/services/foam-jet-ac-service/reviews/?page=2").json()
    assert len(second["results"]) == 2 and second["next"] is None
    assert client.get("/api/v1/services/foam-jet-ac-service/reviews/?rating=5").json()["count"] == 6
    assert client.get("/api/v1/services/foam-jet-ac-service/reviews/?with_comment=true").json()["count"] == 8
    assert client.get("/api/v1/services/foam-jet-ac-service/reviews/?page_size=99").status_code == 400
    assert client.get("/api/v1/services/foam-jet-ac-service/reviews/?rating=9").status_code == 400


def test_catalogue_queries_do_not_grow_with_services(catalog, django_assert_max_num_queries):
    client = APIClient()
    zone = catalog["adyar"].id
    with django_assert_max_num_queries(8):
        client.get(f"/api/v1/service-categories/ac-service/?zone_id={zone}")
    with django_assert_max_num_queries(8):
        client.get(f"/api/v1/services/?zone_id={zone}")
    for i in range(10):
        Service.objects.create(category=catalog["ac"], name=f"Extra {i}", slug=f"extra-{i}", is_active=True)
    with django_assert_max_num_queries(8):
        client.get(f"/api/v1/service-categories/ac-service/?zone_id={zone}")


def test_cart_merge(catalog):
    client = APIClient()
    payload = {"items": [
        {"service_id": str(catalog["foam"].id), "package_id": str(catalog["foam_pkg"].id), "quantity": 50},
        {"service_id": str(catalog["install"].id)},
        {"service_id": str(catalog["hidden"].id)},
        {"service_id": "00000000-0000-0000-0000-000000000000"},
    ]}
    assert client.post("/api/v1/cart/merge/", payload, format="json").status_code in (401, 403)

    client.force_authenticate(user=catalog["customer"])
    data = client.post("/api/v1/cart/merge/", payload, format="json").json()
    assert len(data["items"]) == 2
    foam_item = next(i for i in data["items"] if i["service_id"] == str(catalog["foam"].id))
    assert foam_item["quantity"] == 20
    assert data["item_count"] == 21
    assert len(data["skipped"]) == 2

    again = client.post("/api/v1/cart/merge/", {"items": [
        {"service_id": str(catalog["foam"].id), "package_id": str(catalog["foam_pkg"].id), "quantity": 2}]},
        format="json").json()
    assert len(again["items"]) == 2
    assert CartItem.objects.filter(cart__user=catalog["customer"]).count() == 2
    assert next(i for i in again["items"] if i["service_id"] == str(catalog["foam"].id))["quantity"] == 2


def _admin():
    User = get_user_model()
    user = User.objects.create_user(username="+919999990077", phone_e164="+919999990077", is_active=True)
    StaffRole.objects.create(user=user, role="SUPER_ADMIN", assigned_by=user)
    return user


def test_admin_brand_validation_and_package_mrp(catalog):
    client = APIClient()
    client.force_authenticate(user=_admin())
    url = f"/api/v1/admin/services/{catalog['foam'].id}/"
    ok = client.patch(url, {"brands": [{"name": " Voltas ", "logo_url": "https://cdn.example.com/voltas.png"}]},
                      format="json")
    assert ok.status_code == 200, ok.content
    assert ok.json()["brands"] == [{"name": "Voltas", "logo_url": "https://cdn.example.com/voltas.png"}]
    assert client.patch(url, {"brands": [{"name": "LG"}, {"name": "lg"}]}, format="json").status_code == 400
    assert client.patch(url, {"brands": [{"name": "LG", "logo_url": "http://x.com/a.png"}]},
                        format="json").status_code == 400
    assert client.patch(url, {"brands": [{"name": "  "}]}, format="json").status_code == 400
    too_many = [{"name": f"Brand {i}"} for i in range(31)]
    assert client.patch(url, {"brands": too_many}, format="json").status_code == 400

    pkg = client.patch(f"/api/v1/admin/packages/{catalog['foam_pkg'].id}/",
                       {"original_price_paise": 99900, "is_most_booked": True}, format="json")
    assert pkg.status_code == 200, pkg.content
    assert pkg.json()["original_price_paise"] == 99900
    assert pkg.json()["is_most_booked"] is True


def test_admin_can_add_service_review_without_booking_and_publish_it(catalog):
    client = APIClient()
    client.force_authenticate(user=_admin())
    url = "/api/v1/admin/reviews/"
    payload = {"service_id": str(catalog["foam"].id), "reviewer_name": "Anita",
        "rating": 5, "comment": "The service was quick and careful.", "is_visible": False}
    created = client.post(url, payload, format="json")
    assert created.status_code == 201, created.content
    review = created.json()
    assert review["source"] == "MANUAL" and review["booking_id"] is None
    assert APIClient().get("/api/v1/services/foam-jet-ac-service/reviews/").json()["count"] == 0
    edited = client.patch(f"{url}{review['id']}/", {"is_visible": True, "reviewer_name": "Anita S."}, format="json")
    assert edited.status_code == 200, edited.content
    public = APIClient().get("/api/v1/services/foam-jet-ac-service/reviews/").json()
    assert public["count"] == 1
    assert public["results"][0]["source"] == "MANUAL"
    assert public["results"][0]["customer_name"] == "Anita S."
    assert client.get(url, {"service_id": str(catalog["foam"].id)}).json()["count"] == 1
    assert client.post(url, {**payload, "rating": 6}, format="json").status_code == 400


def test_single_brands_image_is_available_in_service_popup(catalog, tmp_path, settings, monkeypatch):
    from django.core.files.uploadedfile import SimpleUploadedFile
    from domains.administration import views_core

    settings.MEDIA_ROOT = tmp_path
    client = APIClient()
    client.force_authenticate(user=_admin())
    image = SimpleUploadedFile("brands.png", b"\x89PNG\r\n\x1a\n" + b"0" * 40, content_type="image/png")
    monkeypatch.setattr(views_core, "_validate_and_upload_catalog_image", lambda request: (request.FILES["file"], "image/png", None))
    url = f"/api/v1/admin/services/{catalog['foam'].id}/images/"
    uploaded = client.post(url, {"slot": "brands_image", "file": image}, format="multipart")
    assert uploaded.status_code == 200, uploaded.content
    public = APIClient().get("/api/v1/services/foam-jet-ac-service/").json()
    assert public["brands_image"] == uploaded.json()["url"]
    assert public["brands"] == catalog["foam"].brands
    assert client.delete(url + "?slot=brands_image").status_code == 200
    assert APIClient().get("/api/v1/services/foam-jet-ac-service/").json()["brands_image"] is None


def test_city_landing_pages(catalog):
    from domains.catalog.models import SEOLandingPage

    client = APIClient()
    slugs = client.get("/api/v1/landing-pages/").json()["slugs"]
    assert "ac-service-chennai" in slugs and "washing-machine-service-chennai" in slugs

    page = client.get("/api/v1/landing-pages/ac-service-chennai/").json()
    assert page["kind"] == "generated" and page["heading"] == "AC Service in Chennai"
    assert [s["slug"] for s in page["services"]] == ["foam-jet-ac-service", "ac-installation"]
    assert page["faqs"][0]["question"] == "Do I need gas?"
    assert {a["name"] for a in page["areas"]} == {"Adyar", "T Nagar"}

    repair = client.get("/api/v1/landing-pages/washing-machine-repair-chennai/").json()
    assert repair == {"kind": "redirect", "slug": "washing-machine-service-chennai"}

    priced = client.get("/api/v1/landing-pages/ac-service-chennai/?pincode=600017").json()
    assert priced["services"][0]["packages"][0]["price_paise"] == 69900

    for bad in ("ac-service-mumbai", "unknown-chennai", "x" * 5, "..%2f"):
        assert client.get(f"/api/v1/landing-pages/{bad}/").status_code == 404

    SEOLandingPage.objects.create(page_slug="best-ac-cleaning-adyar", title="AC cleaning in Adyar",
                                  service=catalog["foam"], hero_heading="Spotless ACs in Adyar", status="PUBLISHED")
    seo = client.get("/api/v1/landing-pages/best-ac-cleaning-adyar/").json()
    assert seo["kind"] == "seo_page" and seo["heading"] == "Spotless ACs in Adyar"
    assert seo["services"][0]["slug"] == "foam-jet-ac-service"
