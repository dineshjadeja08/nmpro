import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from domains.bookings.models import AppointmentSlot, Booking
from domains.catalog.models import Category, PricingRule, Service, ServicePackage
from domains.locations.models import Address, City, ServiceCoverage, Zone


@pytest.fixture
def integration_setup(db, settings):
    from django.core.cache import cache

    cache.clear()
    settings.PILOT_ENABLED = False
    settings.PUBLIC_BOOKING_ENABLED = True
    settings.RAZORPAY_ENABLED = True
    settings.RAZORPAY_KEY_ID = "rzp_test_integration"
    settings.RAZORPAY_KEY_SECRET = "secret_integration"
    settings.RAZORPAY_WEBHOOK_SECRET = "webhook_secret"

    User = get_user_model()
    customer = User.objects.create_user(username="cust-1", phone_e164="+919876543210")
    city = City.objects.create(name="Chennai", slug="chennai", is_active=True)
    zone = Zone.objects.create(city=city, name="Adyar", state="Tamil Nadu", postal_code="600020",
                               operational_capacity=20, is_active=True)
    address = Address.objects.create(user=customer, label="Home", line_1="10, 1st Cross",
                                     locality="Adyar", city="Chennai", state="Tamil Nadu",
                                     postal_code="600020", contact_name="Customer One",
                                     contact_phone="+919876543210")
    category = Category.objects.create(name="Appliance Care", slug="appliance-care", is_active=True)
    service = Service.objects.create(category=category, name="AC Deep Clean", slug="ac-deep-clean", is_active=True)
    package = ServicePackage.objects.create(
        service=service, name="Split AC Service", pricing_model="FIXED_PRICE",
        duration_minutes=90, skill_code="AC_SERVICE", is_active=True)
    ServiceCoverage.objects.create(service=service, zone=zone, is_active=True)

    start = timezone.now() + timezone.timedelta(hours=5)
    end = start + timezone.timedelta(hours=2)
    slot = AppointmentSlot.objects.create(
        zone=zone, package=package, start_at=start, end_at=end, capacity=5, is_active=True)

    return {
        "customer": customer,
        "zone": zone,
        "address": address,
        "service": service,
        "package": package,
        "slot": slot,
    }


@pytest.mark.django_db
def test_firebase_phone_authentication(client):
    # Valid mock token exchange
    resp = client.post("/api/v1/auth/firebase/", {"id_token": "dev-token:+919876543299"}, format="json")
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["phone_e164"] == "+919876543299"

    # Authenticated user session verified via MeView
    me_resp = client.get("/api/v1/auth/me/")
    assert me_resp.status_code == 200
    assert me_resp.json()["phone_e164"] == "+919876543299"

    # Invalid token rejection
    client.post("/api/v1/auth/logout/")
    bad_resp = client.post("/api/v1/auth/firebase/", {"id_token": ""}, format="json")
    assert bad_resp.status_code == 400


@pytest.mark.django_db
def test_advance_payment_flow_percentage(integration_setup, monkeypatch):
    from domains.payments import services as payments_services
    from domains.payments.models import PaymentIntent

    s = integration_setup
    # Create percentage advance pricing rule: 25% of 100,000 paise (Rs 1,000)
    rule = PricingRule.objects.create(
        package=s["package"], zone=s["zone"], base_paise=100000,
        payment_policy="ADVANCE", advance_type="PERCENTAGE", advance_percentage=25,
        is_active=True, version=1)

    client = APIClient()
    client.force_authenticate(user=s["customer"])

    # 1. Hold slot
    hold_resp = client.post("/api/v1/checkout/holds/", {
        "package_id": str(s["package"].id),
        "address_id": str(s["address"].id),
        "slot_id": str(s["slot"].id),
    }, format="json")
    assert hold_resp.status_code == 201, hold_resp.content
    hold_id = hold_resp.json()["id"]

    # 2. Quote shows total 100,000 and advance 25,000
    quote_resp = client.post("/api/v1/checkout/quote/", {"hold_id": hold_id}, format="json")
    assert quote_resp.status_code == 201
    quote = quote_resp.json()
    assert quote["total_paise"] == 100000
    assert quote["advance_paise"] == 25000
    assert quote["remaining_balance_paise"] == 75000
    assert quote["payment_policy"] == "ADVANCE"

    # 3. Confirm booking -> status AWAITING_PAYMENT, payment_status PENDING
    confirm_resp = client.post("/api/v1/bookings/", {
        "hold_id": hold_id,
        "quote_id": quote["id"],
        "accepted_total_paise": 100000,
        "terms_accepted": True,
    }, format="json", HTTP_IDEMPOTENCY_KEY="key-adv-1")
    assert confirm_resp.status_code == 201, confirm_resp.content
    booking_id = confirm_resp.json()["id"]
    booking = Booking.objects.get(id=booking_id)
    assert booking.status == "AWAITING_PAYMENT"
    assert booking.payment_status == "PENDING"
    assert booking.price_snapshot.advance_paise == 25000
    assert booking.price_snapshot.remaining_balance_paise == 75000

    # 4. Create Payment Order for advance
    class MockRazorpay:
        def create_order(self, amount, ref):
            return {"id": "order_adv_test_1", "amount": amount, "currency": "INR"}

        def fetch_payment(self, payment_id):
            return {"id": payment_id, "order_id": "order_adv_test_1", "amount": 25000, "currency": "INR", "status": "captured"}

        def verify_checkout(self, order_id, payment_id, signature):
            return signature == "valid_sig"

    monkeypatch.setattr("domains.payments.services.get_provider", lambda: MockRazorpay())
    monkeypatch.setattr("domains.payments.views.get_provider", lambda: MockRazorpay())

    order_resp = client.post(f"/api/v1/bookings/{booking_id}/payment-order/", format="json", HTTP_IDEMPOTENCY_KEY="ord-adv-1")
    assert order_resp.status_code == 201
    assert order_resp.json()["amount_paise"] == 25000  # Charged advance amount!
    assert order_resp.json()["order_id"] == "order_adv_test_1"

    # 5. Verify advance capture -> transitions to CONFIRMED and ADVANCE_PAID
    verify_resp = client.post(f"/api/v1/bookings/{booking_id}/payment-verify/", {
        "razorpay_order_id": "order_adv_test_1",
        "razorpay_payment_id": "pay_adv_test_1",
        "razorpay_signature": "valid_sig",
    }, format="json")
    assert verify_resp.status_code == 200, verify_resp.content
    booking.refresh_from_db()
    assert booking.status == "CONFIRMED"
    assert booking.payment_status == "ADVANCE_PAID"

    # 6. Remaining Balance Flow: At-visit collection (e.g. Cash / UPI)
    collect_resp = client.post(f"/api/v1/bookings/{booking_id}/balance-collect/", {"method": "CASH"}, format="json")
    assert collect_resp.status_code == 200
    booking.refresh_from_db()
    assert booking.payment_status == "PAID"
    assert booking.payments.count() == 2  # 1 advance payment, 1 balance payment


@pytest.mark.django_db
def test_advance_payment_flow_fixed_and_online_balance(integration_setup, monkeypatch):
    from domains.payments import services as payments_services

    s = integration_setup
    # Fixed advance pricing rule: Rs 300 (30,000 paise) fixed advance on Rs 800 (80,000 paise)
    rule = PricingRule.objects.create(
        package=s["package"], zone=s["zone"], base_paise=80000,
        payment_policy="ADVANCE", advance_type="FIXED", advance_amount_paise=30000,
        is_active=True, version=1)

    client = APIClient()
    client.force_authenticate(user=s["customer"])

    hold_resp = client.post("/api/v1/checkout/holds/", {
        "package_id": str(s["package"].id),
        "address_id": str(s["address"].id),
        "slot_id": str(s["slot"].id),
    }, format="json")
    hold_id = hold_resp.json()["id"]

    quote_resp = client.post("/api/v1/checkout/quote/", {"hold_id": hold_id}, format="json")
    quote = quote_resp.json()
    assert quote["advance_paise"] == 30000
    assert quote["remaining_balance_paise"] == 50000

    confirm_resp = client.post("/api/v1/bookings/", {
        "hold_id": hold_id,
        "quote_id": quote["id"],
        "accepted_total_paise": 80000,
        "terms_accepted": True,
    }, format="json", HTTP_IDEMPOTENCY_KEY="key-adv-2")
    booking_id = confirm_resp.json()["id"]

    class MockRazorpay:
        def create_order(self, amount, ref):
            order_id = "order_bal_1" if "-BAL" in ref else "order_adv_2"
            return {"id": order_id, "amount": amount, "currency": "INR"}

        def fetch_payment(self, payment_id):
            if payment_id == "pay_bal_1":
                return {"id": payment_id, "order_id": "order_bal_1", "amount": 50000, "currency": "INR", "status": "captured"}
            return {"id": payment_id, "order_id": "order_adv_2", "amount": 30000, "currency": "INR", "status": "captured"}

        def verify_checkout(self, order_id, payment_id, signature):
            return True

    monkeypatch.setattr("domains.payments.services.get_provider", lambda: MockRazorpay())
    monkeypatch.setattr("domains.payments.views.get_provider", lambda: MockRazorpay())

    # Advance payment
    client.post(f"/api/v1/bookings/{booking_id}/payment-order/", format="json", HTTP_IDEMPOTENCY_KEY="ord-adv-2")
    client.post(f"/api/v1/bookings/{booking_id}/payment-verify/", {
        "razorpay_order_id": "order_adv_2",
        "razorpay_payment_id": "pay_adv_2",
        "razorpay_signature": "valid",
    }, format="json")

    booking = Booking.objects.get(id=booking_id)
    assert booking.payment_status == "ADVANCE_PAID"

    # Online Balance Payment
    bal_order = client.post(f"/api/v1/bookings/{booking_id}/balance-order/", format="json", HTTP_IDEMPOTENCY_KEY="ord-bal-1")
    assert bal_order.status_code == 201
    assert bal_order.json()["amount_paise"] == 50000

    bal_verify = client.post(f"/api/v1/bookings/{booking_id}/balance-verify/", {
        "razorpay_order_id": "order_bal_1",
        "razorpay_payment_id": "pay_bal_1",
        "razorpay_signature": "valid",
    }, format="json")
    assert bal_verify.status_code == 200
    booking.refresh_from_db()
    assert booking.payment_status == "PAID"


@pytest.mark.django_db
def test_cloudinary_service_image_upload_and_catalog(integration_setup, monkeypatch):
    from domains.catalog.models import ServiceImage
    from domains.catalog.providers.cloudinary import CloudinaryProvider

    s = integration_setup
    User = get_user_model()
    admin_user = User.objects.create_user(username="admin-user", phone_e164="+919876543220")
    from domains.administration.models import StaffRole
    StaffRole.objects.create(user=admin_user, role="SUPER_ADMIN", assigned_by=admin_user)

    client = APIClient()
    client.force_authenticate(user=admin_user)

    # Mock Cloudinary upload
    monkeypatch.setattr(CloudinaryProvider, "is_configured", True)
    monkeypatch.setattr(
        CloudinaryProvider,
        "upload_image",
        lambda self, file_obj, filename=None, folder="": {
            "secure_url": "https://res.cloudinary.com/nammapros/image/upload/v12345/service_clean.webp",
            "public_id": "catalog/services/service_clean",
        },
    )

    fake_file = SimpleUploadedFile("clean.jpg", b"\xff\xd8\xff\xe0testimagecontent", content_type="image/jpeg")
    upload_resp = client.post(f"/api/v1/admin/services/{s['service'].id}/images/", {"file": fake_file}, format="multipart")
    assert upload_resp.status_code == 201, upload_resp.content
    assert upload_resp.json()["url"] == "https://res.cloudinary.com/nammapros/image/upload/v12345/service_clean.webp"

    # Catalog listing now includes Cloudinary URL
    public_client = APIClient()
    cat_resp = public_client.get("/api/v1/catalog/services/")
    assert cat_resp.status_code == 200
    svc = next(item for item in cat_resp.json()["services"] if item["id"] == str(s["service"].id))
    assert len(svc["images"]) > 0
    assert svc["images"][0]["url"].startswith("https://res.cloudinary.com/")


@pytest.mark.django_db
def test_google_maps_location_provider_and_endpoints(monkeypatch):
    client = APIClient()

    # 1. Autocomplete
    resp = client.get("/api/v1/location/autocomplete/?input=Anna")
    assert resp.status_code == 200, resp.content
    suggestions = resp.json()["suggestions"]
    assert len(suggestions) > 0
    assert any("Anna Nagar" in s["main_text"] for s in suggestions)

    # 2. Geocode Place
    place_id = suggestions[0]["id"]
    geo_resp = client.get(f"/api/v1/location/geocode/?place_id={place_id}")
    assert geo_resp.status_code == 200, geo_resp.content
    place_data = geo_resp.json()
    assert place_data["city"] == "Chennai"
    assert place_data["postal_code"] == "600040"
    assert place_data["locality"] == "Anna Nagar"
    assert place_data["latitude"] is not None
    assert place_data["longitude"] is not None

    # 3. Reverse Geocode (verifies coordinate rounding to <= 6 decimal places)
    rev_resp = client.get("/api/v1/location/reverse-geocode/?lat=13.08501234&lng=80.21015678")
    assert rev_resp.status_code == 200, rev_resp.content
    rev_data = rev_resp.json()
    assert rev_data["city"] == "Chennai"
    assert rev_data["postal_code"] == "600040"
    assert rev_data["latitude"] == 13.085012
    assert rev_data["longitude"] == 80.210157

    # 4. Public service-areas/check with postal_code and city/locality fallback
    from domains.locations.models import City, Zone
    city = City.objects.create(name="Chennai", slug="chennai-geo-test", is_active=True)
    Zone.objects.create(
        city=city,
        name="Anna Nagar",
        postal_code="600040",
        locality_aliases=["Anna Nagar West"],
        services_configured=False,
        is_active=True,
    )
    pin_check = client.get("/api/v1/service-areas/check/?postal_code=600040&city=Chennai")
    assert pin_check.status_code == 200, pin_check.content
    assert pin_check.json()["supported"] is True
    assert pin_check.json()["service_area"]["name"] == "Anna Nagar"

    city_check = client.get("/api/v1/service-areas/check/?city=Chennai&locality=Anna%20Nagar")
    assert city_check.status_code == 200, city_check.content
    assert city_check.json()["supported"] is True

    miss_check = client.get("/api/v1/service-areas/check/?postal_code=699999&city=Chennai")
    assert miss_check.status_code == 200, miss_check.content
    assert miss_check.json()["supported"] is False


@pytest.mark.django_db
def test_admin_lead_address_coordinates_and_conversion(integration_setup):
    from django.contrib.auth import get_user_model
    from domains.administration.models import StaffRole
    from domains.locations.models import Address

    admin_user = get_user_model().objects.create_user(username="ops_geo", phone_e164="+919999988888", is_active=True)
    StaffRole.objects.get_or_create(user=admin_user, role="SUPER_ADMIN", defaults={"assigned_by": admin_user})

    client = APIClient()
    client.force_authenticate(user=admin_user)

    service = integration_setup["service"]
    create_resp = client.post(
        "/api/v1/operations/leads/",
        {
            "customer_name": "Karthik",
            "mobile_number": "+919876500112",
            "service_category_id": str(service.category_id),
            "service_id": str(service.id),
            "address": "2nd Avenue, Anna Nagar, Chennai",
            "area": "Anna Nagar",
            "city": "Chennai",
            "pincode": "600040",
            "latitude": 13.08501234,
            "longitude": 80.21015678,
            "source": "PHONE_CALL",
        },
        format="json",
    )
    assert create_resp.status_code == 201, create_resp.content
    lead = create_resp.json()
    assert lead["city"] == "Chennai"
    assert lead["pincode"] == "600040"
    assert lead["latitude"] == 13.085012
    assert lead["longitude"] == 80.210157

    patch_resp = client.patch(
        f"/api/v1/operations/leads/{lead['id']}/",
        {"address": "Usman Road, T. Nagar", "area": "T. Nagar", "pincode": "600017", "latitude": 13.0418, "longitude": 80.2341},
        format="json",
    )
    assert patch_resp.status_code == 200, patch_resp.content
    updated = patch_resp.json()
    assert updated["pincode"] == "600017"
    assert updated["latitude"] == 13.0418
    assert updated["longitude"] == 80.2341

    convert_resp = client.post(f"/api/v1/operations/leads/{lead['id']}/convert/", {"notes": "Confirmed"}, format="json")
    assert convert_resp.status_code == 200, convert_resp.content
    converted = convert_resp.json()
    assert converted["converted_booking_id"] is not None
    addr = Address.objects.get(booking__id=converted["converted_booking_id"])
    assert float(addr.latitude) == 13.0418
    assert float(addr.longitude) == 80.2341


@pytest.mark.django_db
def test_public_slots_and_enriched_reviews(integration_setup):
    from django.utils import timezone
    from domains.bookings.models import AppointmentSlot, Booking, BookingPriceSnapshot
    from domains.catalog.models import PricingRule

    pkg = integration_setup["package"]
    zone = integration_setup["zone"]
    PricingRule.objects.create(
        package=pkg,
        zone=zone,
        base_paise=64900,
        payment_policy="PAY_AT_VISIT",
        is_active=True,
    )
    full_slot = AppointmentSlot.objects.create(
        zone=zone,
        package=pkg,
        start_at=timezone.now() + timezone.timedelta(days=1),
        end_at=timezone.now() + timezone.timedelta(days=1, hours=1),
        capacity=1,
        is_active=True,
    )
    full_booking = Booking.objects.create(
        user=integration_setup["customer"],
        service=integration_setup["service"],
        package=pkg,
        address=integration_setup["address"],
        slot=full_slot,
        status="CONFIRMED",
        payment_status="PAID",
        reference="NP-FULL-001",
    )
    BookingPriceSnapshot.objects.create(booking=full_booking, pricing_rule_id=pkg.id, pricing_version=1, lines=[], total_paise=64900)

    client = APIClient()
    slots_resp = client.get(f"/api/v1/slots/?package_id={pkg.id}&include_full=1")
    assert slots_resp.status_code == 200, slots_resp.content
    assert any(s["remaining"] == 0 for s in slots_resp.json()["slots"])
    assert any(s["remaining"] > 0 for s in slots_resp.json()["slots"])

    booking = Booking.objects.create(
        user=integration_setup["customer"],
        service=integration_setup["service"],
        package=pkg,
        address=integration_setup["address"],
        slot=integration_setup["slot"],
        status="COMPLETED",
        payment_status="PAID",
        reference="NP-REV-001",
    )
    BookingPriceSnapshot.objects.create(booking=booking, pricing_rule_id=pkg.id, pricing_version=1, lines=[], total_paise=64900)

    client.force_authenticate(user=integration_setup["customer"])
    rev_post = client.post(
        f"/api/v1/bookings/{booking.id}/review/",
        {"rating": 5, "comment": "Very clean service", "tags": ["On time", "Clean work"]},
        format="json",
    )
    assert rev_post.status_code == 201, rev_post.content
    assert rev_post.json()["tags"] == ["On time", "Clean work"]
    assert rev_post.json()["area"] == "Adyar"

    svc_reviews = client.get(f"/api/v1/services/{integration_setup['service'].slug}/reviews/")
    assert svc_reviews.status_code == 200
    assert svc_reviews.json()["average_rating"] == 5.0
    assert svc_reviews.json()["rating_breakdown"]["5"] == 1
    assert len(svc_reviews.json()["results"]) == 1

    cat_resp = client.get("/api/v1/catalog/")
    assert cat_resp.status_code == 200
    assert cat_resp.json()["trust_stats"]["average_rating"] == 5.0
    assert cat_resp.json()["trust_stats"]["review_count"] == 1


@pytest.mark.django_db
def test_firebase_auth_only_for_customers_and_creates_default_preferences(monkeypatch):
    from django.contrib.auth import get_user_model
    from domains.administration.models import StaffRole
    from domains.notifications.models import NotificationPreference
    from domains.users.models import CustomerProfile

    User = get_user_model()
    staff_user = User.objects.create_user(username="staff_fb", phone_e164="+919876501010", is_staff=True, is_active=True)
    StaffRole.objects.create(user=staff_user, role="SUPER_ADMIN", assigned_by=staff_user)

    client = APIClient()
    staff_resp = client.post("/api/v1/auth/firebase/", {"id_token": "dev-token:+919876501010"}, format="json")
    assert staff_resp.status_code == 403, staff_resp.content

    cust_resp = client.post("/api/v1/auth/firebase/", {"id_token": "dev-token:+919876502020"}, format="json")
    assert cust_resp.status_code == 200, cust_resp.content
    assert cust_resp.json()["role"] == "CUSTOMER"

    customer = User.objects.get(phone_e164="+919876502020")
    assert CustomerProfile.objects.filter(user=customer).exists()
    pref = NotificationPreference.objects.get(user=customer)
    assert pref.sms_opt_in is True
    assert pref.whatsapp_opt_in is True


@pytest.mark.django_db
def test_msg91_transactional_notifications_dispatch_for_all_lifecycle_events(integration_setup, monkeypatch, settings):
    from django.contrib.auth import get_user_model
    from domains.bookings.models import Booking, BookingPriceSnapshot
    from domains.notifications.models import Notification, OutboxEvent
    from domains.notifications.tasks import dispatch_sms_notifications, dispatch_whatsapp_notifications, process_booking_outbox
    from domains.technicians.services import notify

    settings.MSG91_AUTH_KEY = "msg91-test-key"
    settings.WHATSAPP_ENABLED = True
    settings.WHATSAPP_PROVIDER = "MSG91"
    settings.SMS_PROVIDER = "MSG91"
    templates = {
        "BOOKING_CONFIRMED": "tmpl_booking_confirmed",
        "PAYMENT_SUCCESS": "tmpl_payment_success",
        "TECHNICIAN_ASSIGNED": "tmpl_tech_assigned",
        "TECHNICIAN_EN_ROUTE": "tmpl_tech_en_route",
    }
    settings.WHATSAPP_TEMPLATES = templates
    settings.SMS_TEMPLATES = templates

    wa_calls = []
    sms_calls = []
    monkeypatch.setattr(
        "domains.notifications.providers.msg91_whatsapp.MSG91WhatsAppProvider.send_template",
        lambda self, phone_e164, template_name, booking_reference: wa_calls.append(
            (phone_e164, template_name, booking_reference)
        ) or {"type": "success"},
    )
    monkeypatch.setattr(
        "domains.notifications.providers.msg91_sms.MSG91SMSProvider.send_template",
        lambda self, phone_e164, template_id, booking_reference: sms_calls.append(
            (phone_e164, template_id, booking_reference)
        ) or {"type": "success"},
    )

    fresh_customer = get_user_model().objects.create_user(username="fresh_cust", phone_e164="+919811122233", is_active=True)
    booking = Booking.objects.create(
        user=fresh_customer,
        service=integration_setup["service"],
        package=integration_setup["package"],
        address=integration_setup["address"],
        slot=integration_setup["slot"],
        status="CONFIRMED",
        payment_status="ADVANCE_PAID",
        reference="NP-MSG91-001",
    )
    BookingPriceSnapshot.objects.create(
        booking=booking, pricing_rule_id=integration_setup["package"].id, pricing_version=1, lines=[], total_paise=99900
    )

    # 1. Technician lifecycle notification without pre-existing NotificationPreference row
    notify(fresh_customer, "TECHNICIAN_ASSIGNED", booking=booking)
    notify(fresh_customer, "TECHNICIAN_EN_ROUTE", booking=booking)

    # 2. Outbox booking confirmed + balance/payment success
    OutboxEvent.objects.create(event_type="BOOKING_CONFIRMED", aggregate_id=booking.id, payload={"booking_id": str(booking.id)})
    OutboxEvent.objects.create(event_type="PAYMENT_SUCCESS", aggregate_id=booking.id, payload={"booking_id": str(booking.id), "type": "BALANCE"})
    process_booking_outbox()

    # None of the queued notifications should fall back to channel="NONE"
    notifications = list(Notification.objects.filter(recipient=fresh_customer))
    assert len(notifications) >= 4
    assert all(n.channel != "NONE" for n in notifications)

    dispatch_whatsapp_notifications()
    dispatch_sms_notifications()
    assert len(wa_calls) + len(sms_calls) >= 4




