"""Coupons, referrals, technician GPS sharing, payment collection at the visit and web push."""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from domains.administration.models import StaffRole
from domains.bookings.models import AppointmentSlot, Booking
from domains.catalog.models import Category, PricingRule, Service, ServicePackage
from domains.locations.models import Address, City, ServiceCoverage, Zone
from domains.promotions.models import Coupon, CouponRedemption, Referral
from domains.technicians.models import JobAssignment, JobOffer, TechnicianProfile

User = get_user_model()


@pytest.fixture
def shop(db, django_capture_on_commit_callbacks):
    category = Category.objects.create(slug="appliances", name="Appliances", is_active=True)
    service = Service.objects.create(category=category, slug="ac-service", name="AC Service", is_active=True)
    package = ServicePackage.objects.create(service=service, name="Foam jet", pricing_model="FIXED_PRICE",
                                            duration_minutes=60, skill_code="AC", is_active=True)
    city = City.objects.create(name="Chennai", slug="chennai", is_active=True)
    zone = Zone.objects.create(city=city, name="Mylapore", postal_code="600004", is_active=True)
    ServiceCoverage.objects.create(zone=zone, service=service, is_active=True)
    PricingRule.objects.create(package=package, zone=zone, base_paise=100000, payment_policy="PAY_AT_VISIT",
                               is_active=True, cancellation_cutoff_minutes=60, reschedule_cutoff_minutes=60)
    start = timezone.now() + timedelta(days=2)
    slots = [AppointmentSlot.objects.create(zone=zone, package=package, start_at=start + timedelta(hours=2 * i),
                                            end_at=start + timedelta(hours=2 * i + 1), capacity=5, is_active=True)
             for i in range(4)]
    return {"package": package, "zone": zone, "slots": slots, "service": service}


@pytest.fixture
def promo_shop(shop, settings):
    """Discounts come off the online advance, so the price takes a ₹500 advance. General coupons are
    switched off in production (COUPONS_ENABLED); these tests switch them on to cover the coupon rules."""
    PricingRule.objects.filter(package=shop["package"]).update(
        payment_policy="ADVANCE", advance_type="FIXED", advance_amount_paise=50000)
    settings.COUPONS_ENABLED = True
    settings.RAZORPAY_ENABLED = True  # an advance is paid online
    settings.RAZORPAY_KEY_ID = "rzp_test_public"
    return shop


def customer(phone, name="Asha"):
    user = User.objects.create_user(username=phone, phone_e164=phone, first_name=name)
    address = Address.objects.create(user=user, line_1="12 North Street", locality="Mylapore", city="Chennai",
                                     postal_code="600004", latitude="13.033300", longitude="80.270000")
    client = APIClient()
    client.force_authenticate(user=user)
    return user, address, client


def book(client, shop, address, slot_index=0, code="", key="k"):
    held = client.post("/api/v1/checkout/holds/", {"package_id": str(shop["package"].id), "address_id": str(address.id),
                                                   "slot_id": str(shop["slots"][slot_index].id)}, format="json")
    assert held.status_code == 201, held.content
    body = {"hold_id": held.json()["id"]}
    if code:
        body["coupon_code"] = code
    quote = client.post("/api/v1/checkout/quote/", body, format="json")
    if quote.status_code != 201:
        return quote, None
    q = quote.json()
    booking = client.post("/api/v1/bookings/", {"hold_id": q["hold_id"], "quote_id": q["id"],
                                                "accepted_total_paise": q["total_paise"], "terms_accepted": True},
                          format="json", HTTP_IDEMPOTENCY_KEY=key)
    return quote, booking


def test_flat_and_percent_coupons_apply_and_are_limited(promo_shop):
    shop = promo_shop
    Coupon.objects.create(code="FLAT150", discount_type="FLAT", value=15000, description="₹150 off")
    Coupon.objects.create(code="TENPC", discount_type="PERCENT", value=10, max_discount_paise=5000)
    user, address, client = customer("+919800000101")

    quote, booking = book(client, shop, address, 0, "flat150", "a1")
    assert quote.status_code == 201, quote.content
    q = quote.json()
    assert q["total_paise"] == 85000 and q["discount_paise"] == 15000 and q["coupon_code"] == "FLAT150"
    assert q["lines"][-1]["code"] == "DISCOUNT" and q["lines"][-1]["amount_paise"] == -15000
    assert booking.status_code == 201, booking.content
    assert CouponRedemption.objects.filter(coupon__code="FLAT150", user=user).count() == 1

    again, _ = book(client, shop, address, 1, "FLAT150", "a2")
    assert again.status_code == 400 and "already used" in str(again.content)

    pct, _ = book(client, shop, address, 1, "TENPC", "a3")
    assert pct.json()["discount_paise"] == 5000  # 10% of ₹1000 capped at ₹50


def test_coupon_rules(promo_shop):
    shop = promo_shop
    now = timezone.now()
    Coupon.objects.create(code="OLD", discount_type="FLAT", value=1000, valid_until=now - timedelta(days=1))
    Coupon.objects.create(code="BIG", discount_type="FLAT", value=1000, min_order_paise=500000)
    Coupon.objects.create(code="FIRST", discount_type="FLAT", value=1000, first_booking_only=True)
    owner = User.objects.create_user(username="+919800000199", phone_e164="+919800000199")
    Coupon.objects.create(code="MINE", discount_type="FLAT", value=1000, owner=owner)
    user, address, client = customer("+919800000102")
    assert "expired" in str(book(client, shop, address, 0, "OLD", "b1")[0].content)
    assert "or more" in str(book(client, shop, address, 0, "BIG", "b2")[0].content)
    assert "not valid" in str(book(client, shop, address, 0, "MINE", "b3")[0].content)
    assert "not valid" in str(book(client, shop, address, 0, "NOPE", "b4")[0].content)
    quote, booking = book(client, shop, address, 0, "FIRST", "b5")
    assert booking.status_code == 201
    assert "first booking" in str(book(client, shop, address, 1, "FIRST", "b6")[0].content)


def test_coupon_released_when_booking_cancelled(promo_shop, django_capture_on_commit_callbacks):
    shop = promo_shop
    Coupon.objects.create(code="ONCE", discount_type="FLAT", value=1000, usage_limit=1)
    user, address, client = customer("+919800000103")
    _, booking = book(client, shop, address, 0, "ONCE", "c1")
    booking_obj = Booking.objects.get(id=booking.json()["id"])
    with django_capture_on_commit_callbacks(execute=True):
        booking_obj.status = "CANCELLED"
        booking_obj.save()
    assert not CouponRedemption.objects.exists()


def test_referral_discount_and_reward(promo_shop, django_capture_on_commit_callbacks):
    shop = promo_shop
    referrer, _, ref_client = customer("+919800000104", "Ravi")
    code = ref_client.get("/api/v1/referrals/me/").json()["code"]
    assert code.startswith("NP")
    assert "own referral" in str(book(ref_client, shop, Address.objects.get(user=referrer), 0, code, "r0")[0].content)

    friend, address, client = customer("+919800000105", "Meena")
    quote, booking = book(client, shop, address, 0, code.lower(), "r1")
    assert quote.json()["discount_paise"] == 10000
    referral = Referral.objects.get(referee=friend)
    assert referral.status == "PENDING"
    assert "first booking" in str(book(client, shop, address, 1, code, "r2")[0].content)

    booking_obj = Booking.objects.get(id=booking.json()["id"])
    with django_capture_on_commit_callbacks(execute=True):
        booking_obj.status = "COMPLETED"
        booking_obj.save()
    referral.refresh_from_db()
    assert referral.status == "REWARDED" and referral.reward_coupon.owner == referrer
    summary = ref_client.get("/api/v1/referrals/me/").json()
    assert summary["rewarded_count"] == 1 and summary["rewards"][0]["used"] is False
    reward_code = summary["rewards"][0]["code"]
    other, other_addr, other_client = customer("+919800000106")
    assert "not valid" in str(book(other_client, shop, other_addr, 1, reward_code, "r3")[0].content)


def test_general_coupons_off_by_default_but_referrals_work(shop, settings):
    """Production default: offer codes are switched off, referral codes still take money off the advance,
    and a service paid fully at the visit takes no code at all."""
    settings.COUPONS_ENABLED = False
    Coupon.objects.create(code="PUBLIC", discount_type="FLAT", value=1000)
    assert APIClient().get("/api/v1/offers/").json()["offers"] == []

    referrer, _, ref_client = customer("+919800000110", "Ravi")
    code = ref_client.get("/api/v1/referrals/me/").json()["code"]
    user, address, client = customer("+919800000111")
    assert "paid fully at the visit" in str(book(client, shop, address, 0, code, "d0")[0].content)

    PricingRule.objects.filter(package=shop["package"]).update(
        payment_policy="ADVANCE", advance_type="FIXED", advance_amount_paise=50000)
    settings.RAZORPAY_ENABLED = True
    settings.RAZORPAY_KEY_ID = "rzp_test_public"
    assert "not valid" in str(book(client, shop, address, 0, "PUBLIC", "d1")[0].content)
    quote, booking = book(client, shop, address, 0, code, "d2")
    assert quote.status_code == 201, quote.content
    q = quote.json()
    assert q["discount_paise"] == 10000 and q["advance_paise"] == 40000
    assert q["remaining_balance_paise"] == 50000  # the professional still collects the full balance


def test_public_offers_and_admin_coupons(promo_shop):
    shop = promo_shop
    Coupon.objects.create(code="PUBLIC", discount_type="FLAT", value=1000)
    Coupon.objects.create(code="EXPIRED", discount_type="FLAT", value=1000, valid_until=timezone.now() - timedelta(days=1))
    owner = User.objects.create_user(username="+919800000107", phone_e164="+919800000107")
    Coupon.objects.create(code="PERSONAL", discount_type="FLAT", value=1000, owner=owner)
    assert [o["code"] for o in APIClient().get("/api/v1/offers/").json()["offers"]] == ["PUBLIC"]

    admin = User.objects.create_user(username="+919800000108", phone_e164="+919800000108")
    StaffRole.objects.create(user=admin, role="SUPER_ADMIN", assigned_by=admin)
    client = APIClient()
    client.force_authenticate(user=admin)
    created = client.post("/api/v1/admin/coupons/", {"code": "monsoon", "discount_type": "PERCENT", "value": 20,
                                                     "max_discount_paise": 20000}, format="json")
    assert created.status_code == 201 and created.json()["code"] == "MONSOON"
    assert client.post("/api/v1/admin/coupons/", {"code": "MONSOON", "discount_type": "FLAT", "value": 5},
                       format="json").status_code == 400
    assert client.post("/api/v1/admin/coupons/", {"code": "BAD", "discount_type": "PERCENT", "value": 150},
                       format="json").status_code == 400
    off = client.patch(f"/api/v1/admin/coupons/{created.json()['id']}/", {"is_active": False}, format="json")
    assert off.json()["is_active"] is False
    customer_client = customer("+919800000109")[2]
    assert customer_client.post("/api/v1/admin/coupons/", {"code": "HACK", "discount_type": "FLAT", "value": 5},
                                format="json").status_code == 403


@pytest.fixture
def job(shop):
    user, address, client = customer("+919800000110")
    _, booking = book(client, shop, address, 0, "", "j1")
    booking_obj = Booking.objects.get(id=booking.json()["id"])
    tech_user = User.objects.create_user(username="+919800000111", phone_e164="+919800000111")
    tech = TechnicianProfile.objects.create(user=tech_user, display_name="Kumar R", verification_status="VERIFIED",
                                            is_active=True, app_login_enabled=True)
    offer = JobOffer.objects.create(booking=booking_obj, technician=tech, status="ACCEPTED", offered_by=tech_user,
                                    expires_at=timezone.now() + timedelta(minutes=5))
    assignment = JobAssignment.objects.create(booking=booking_obj, technician=tech, offer=offer, status="EN_ROUTE",
                                              assigned_at=timezone.now())
    tech_client = APIClient()
    tech_client.force_authenticate(user=tech_user)
    return {"booking": booking_obj, "assignment": assignment, "customer": client, "tech": tech_client}


def test_location_shared_only_while_on_the_way(job):
    url = f"/api/v1/technicians/jobs/{job['assignment'].id}/location/"
    read = f"/api/v1/bookings/{job['booking'].id}/technician-location/"
    assert job["customer"].get(read).json()["sharing"] is False
    assert job["tech"].post(url, {"latitude": "13.040000", "longitude": "80.260000", "accuracy_m": 15},
                            format="json").json()["accepted"] is True
    data = job["customer"].get(read).json()
    assert data["sharing"] is True and data["latitude"] == 13.04 and data["destination"]["latitude"] == 13.0333
    assert job["tech"].post(url, {"latitude": "200", "longitude": "80"}, format="json").status_code == 400
    stranger = customer("+919800000112")[2]
    assert stranger.get(read).status_code == 404
    assert stranger.post(url, {"latitude": "13", "longitude": "80"}, format="json").status_code == 403

    assignment = job["assignment"]
    assignment.status = "ARRIVED"
    assignment.save()
    assignment.refresh_from_db()
    assert assignment.last_latitude is None
    assert job["customer"].get(read).json()["sharing"] is False
    assert job["tech"].post(url, {"latitude": "13.04", "longitude": "80.26"}, format="json").status_code == 409


def test_collect_payment_at_visit(job):
    url = f"/api/v1/technicians/jobs/{job['assignment'].id}/collect/"
    due = job["tech"].get(url).json()
    assert due["total_due_paise"] == 100000 and due["can_collect"] is False  # not started yet
    assert job["tech"].post(url, {"method": "CASH", "amount_paise": 100000}, format="json").status_code == 409

    job["assignment"].status = "IN_PROGRESS"
    job["assignment"].save()
    assert job["tech"].get(url).json()["can_collect"] is True
    assert job["tech"].post(url, {"method": "UPI", "amount_paise": 5}, format="json").status_code == 409
    done = job["tech"].post(url, {"method": "UPI", "amount_paise": 100000, "upi_reference": "123456"}, format="json")
    assert done.status_code == 200, done.content
    job["booking"].refresh_from_db()
    assert job["booking"].payment_status == "PAID" and job["booking"].offline_collected_paise == 100000
    assert job["tech"].get(url).json()["total_due_paise"] == 0
    assert job["customer"].post(url, {"method": "CASH", "amount_paise": 100000}, format="json").status_code == 403


def test_upi_link_uses_configured_payee(job, settings):
    settings.UPI_PAYEE_VPA = "nammapros@okbank"
    job["assignment"].status = "IN_PROGRESS"
    job["assignment"].save()
    uri = job["tech"].get(f"/api/v1/technicians/jobs/{job['assignment'].id}/collect/").json()["upi_uri"]
    assert uri.startswith("upi://pay?pa=nammapros%40okbank") and "am=1000.00" in uri


def test_web_push_subscribe_and_offer_alert(job, settings, monkeypatch, django_capture_on_commit_callbacks):
    settings.WEB_PUSH_VAPID_PUBLIC_KEY = "pub"
    settings.WEB_PUSH_VAPID_PRIVATE_KEY = "priv"
    sent = []
    monkeypatch.setattr("pywebpush.webpush", lambda **kw: sent.append(kw))
    tech = job["tech"]
    assert tech.get("/api/v1/push/web/config/").json() == {"enabled": True, "public_key": "pub"}
    assert tech.post("/api/v1/push/web/subscribe/", {"endpoint": "http://insecure.example/x",
                                                     "keys": {"p256dh": "a", "auth": "b"}}, format="json").status_code == 400
    ok = tech.post("/api/v1/push/web/subscribe/", {"endpoint": "https://push.example.com/abc",
                                                   "keys": {"p256dh": "key", "auth": "secret"}}, format="json")
    assert ok.status_code == 201

    shop_booking = job["booking"]
    tech_profile = job["assignment"].technician
    other_tech_user = User.objects.create_user(username="+919800000113", phone_e164="+919800000113")
    with django_capture_on_commit_callbacks(execute=True):
        JobOffer.objects.create(booking=shop_booking, technician=TechnicianProfile.objects.create(
            user=other_tech_user, display_name="Other", verification_status="VERIFIED", is_active=True),
            status="OFFERED", offered_by=tech_profile.user, expires_at=timezone.now() + timedelta(minutes=2))
    assert sent == []  # the other technician has no subscription
    with django_capture_on_commit_callbacks(execute=True):
        second = Booking.objects.create(user=shop_booking.user, service=shop_booking.service, package=shop_booking.package,
                                        address=shop_booking.address, slot=shop_booking.slot, status="CONFIRMED",
                                        reference="NP-PUSH-0001")
        JobOffer.objects.create(booking=second, technician=tech_profile, status="OFFERED",
                                offered_by=tech_profile.user, expires_at=timezone.now() + timedelta(minutes=2))
    assert len(sent) == 1 and '"JOB_OFFER"' in sent[0]["data"]
    assert sent[0]["subscription_info"]["endpoint"] == "https://push.example.com/abc"


def test_fixed_price_job_runs_start_to_finish_with_start_code(job):
    tech, assignment, booking = job["tech"], job["assignment"], job["booking"]
    base = f"/api/v1/technicians/jobs/{assignment.id}"
    assert tech.post(f"{base}/arrived/", {}, format="json").status_code == 200
    assert tech.post(f"{base}/start-inspection/", {}, format="json").status_code == 200
    assert tech.post(f"{base}/start-work/", {"otp": "0000" if booking.start_otp_code != "0000" else "1111"},
                     format="json").status_code == 400
    started = tech.post(f"{base}/start-work/", {"otp": booking.start_otp_code}, format="json")
    assert started.status_code == 200, started.content
    assert started.json()["status"] == "IN_PROGRESS"
    done = tech.post(f"{base}/complete/", {"checklist": ["Work completed"], "work_notes": "Cleaned"}, format="json")
    assert done.status_code == 200, done.content


def test_leave_requests_listed_with_status(job):
    tech = job["tech"]
    start = (timezone.now() + timedelta(days=10)).isoformat()
    end = (timezone.now() + timedelta(days=11)).isoformat()
    created = tech.post("/api/v1/technicians/leaves/", {"start_at": start, "end_at": end, "reason": "Family function"},
                        format="json")
    assert created.status_code == 201, created.content
    rows = tech.get("/api/v1/technicians/leaves/").json()["results"]
    assert rows[0]["status"] == "PENDING" and rows[0]["reason"] == "Family function"
