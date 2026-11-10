import re
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from domains.administration.models import AdminAuditLog, StaffRole
from domains.bookings.models import AppointmentSlot, Booking
from domains.catalog.models import Category, PricingRule, Service, ServicePackage
from domains.locations.models import Address, City, Zone
from domains.notifications.models import DeviceToken, Notification
from domains.operations.models import Lead
from domains.technicians.models import JobAssignment, JobOffer, TechnicianProfile


def _make_admin(phone="+919999990001", role="SUPER_ADMIN"):
    User = get_user_model()
    user = User.objects.create_user(username=phone, phone_e164=phone, is_active=True)
    user.set_password("secret-pass-123")
    user.save()
    StaffRole.objects.create(user=user, role=role, assigned_by=user)
    return user


@pytest.mark.django_db
def test_jwt_auth_password_dev_phone_refresh_and_logout_blacklist():
    user = _make_admin("+919999990002", "OPERATIONS_MANAGER")
    client = APIClient()

    # Password login returns JWT tokens
    res = client.post("/api/v1/auth/password/login/", {"phone_e164": "+919999990002", "password": "secret-pass-123"}, format="json")
    assert res.status_code == 200
    tokens = res.json()
    assert tokens["access"] and tokens["refresh"]

    # Bearer auth works on /auth/me/
    bearer = APIClient()
    bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    me = bearer.get("/api/v1/auth/me/")
    assert me.status_code == 200
    assert me.json()["phone_e164"] == "+919999990002"

    # Refresh rotates token and blacklists old refresh token
    ref = APIClient().post("/api/v1/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
    assert ref.status_code == 200
    new_tokens = ref.json()
    assert APIClient().post("/api/v1/auth/refresh/", {"refresh": tokens["refresh"]}, format="json").status_code == 401

    # Logout blacklists the active refresh token
    bearer.credentials(HTTP_AUTHORIZATION=f"Bearer {new_tokens['access']}")
    assert bearer.post("/api/v1/auth/logout/", {"refresh": new_tokens["refresh"]}, format="json").status_code == 200
    assert APIClient().post("/api/v1/auth/refresh/", {"refresh": new_tokens["refresh"]}, format="json").status_code == 401

    # Dev phone login works in test/development
    dev = APIClient().post("/api/v1/auth/dev-phone/", {"phone_e164": "+919888881111"}, format="json")
    assert dev.status_code == 200
    assert dev.json()["access"]


@pytest.mark.django_db
def test_staff_groups_and_denied_admin_audit_logging():
    admin_user = _make_admin("+919999990003", "SUPER_ADMIN")
    staff_user = get_user_model().objects.create_user(username="staff-1", phone_e164="+919888882222", is_active=True)
    admin_client = APIClient()
    admin_client.force_authenticate(user=admin_user)
    s = admin_client.session
    s["privileged_verified_at"] = timezone.now().timestamp()
    s.save()

    # Non-staff access denied gets audited
    staff_client = APIClient()
    staff_client.force_authenticate(user=staff_user)
    assert staff_client.get("/api/v1/admin/settings/").status_code == 403
    assert AdminAuditLog.objects.filter(action="PERMISSION_DENIED", actor=staff_user).exists()

    # Add user to StaffGroup with VIEW_ADMIN + CHANGE_SETTINGS
    grp = admin_client.post("/api/v1/admin/staff-groups/", {
        "name": "Settings Operators",
        "permissions": ["VIEW_ADMIN", "CHANGE_SETTINGS"],
        "member_ids": [staff_user.id],
    }, format="json")
    assert grp.status_code == 201, grp.content
    assert staff_client.get("/api/v1/admin/settings/").status_code == 200
    assert staff_client.patch("/api/v1/admin/settings/", {"key": "brand", "value": {"name": "NammaPros"}}, format="json").status_code == 200


@pytest.mark.django_db
def test_catalogue_seo_blog_faq_banners_and_slug_redirect():
    admin = _make_admin("+919999990004")
    c = APIClient()
    c.force_authenticate(user=admin)

    cat = Category.objects.create(slug="cooling", name="Cooling", is_active=True)
    svc = Service.objects.create(category=cat, slug="ac-old", name="AC Service", summary="AC work", is_active=True)
    svc.slug = "ac-new"
    svc.save()

    # Old slug permanently redirects to new slug
    redir = APIClient().get("/api/v1/services/ac-old/")
    assert redir.status_code == 301
    assert redir["Location"].endswith("/api/v1/services/ac-new/")
    assert APIClient().get("/api/v1/services/ac-new/").status_code == 200

    # SEO landing page, BlogPost, FAQ, HomepageBanner CRUD + public reads
    seo = c.post("/api/v1/admin/seo-pages/", {
        "page_slug": "ac-service-chennai",
        "title": "AC Service Chennai",
        "service_id": str(svc.id),
        "status": "PUBLISHED",
        "featured_service_ids": [str(svc.id)],
    }, format="json")
    assert seo.status_code == 201
    assert APIClient().get("/api/v1/seo-pages/ac-service-chennai/").json()["featured_services"][0]["slug"] == "ac-new"

    blog = c.post("/api/v1/admin/blog-posts/", {
        "slug": "summer-ac-tips",
        "title": "Summer AC Tips",
        "is_published": True,
    }, format="json")
    assert blog.status_code == 201
    assert APIClient().get("/api/v1/blog-posts/summer-ac-tips/").status_code == 200

    assert c.post("/api/v1/admin/faqs/", {"question": "How long?", "answer": "60 min", "service_id": str(svc.id)}, format="json").status_code == 201
    assert len(APIClient().get("/api/v1/faqs/", {"service_id": str(svc.id)}).json()["results"]) == 1

    assert c.post("/api/v1/admin/homepage-banners/", {"title": "Hero Offer", "placement": "HERO"}, format="json").status_code == 201
    assert len(APIClient().get("/api/v1/homepage-banners/").json()["results"]) == 1


@pytest.mark.django_db
def test_service_area_unconfigured_closure_cart_start_otp_review_work_order_and_leads():
    admin = _make_admin("+919999990005")
    admin_client = APIClient()
    admin_client.force_authenticate(user=admin)

    customer = get_user_model().objects.create_user(username="cust-prd", phone_e164="+919876500001", is_active=True)
    cust_client = APIClient()
    cust_client.force_authenticate(user=customer)

    cat = Category.objects.create(slug="plumbing", name="Plumbing", is_active=True)
    svc = Service.objects.create(category=cat, slug="tap-repair", name="Tap Repair", summary="Fix taps", is_active=True)
    pkg = ServicePackage.objects.create(service=svc, name="Basic Tap Repair", pricing_model="FIXED_PRICE",
                                        duration_minutes=60, skill_code="PLUMBING", is_active=True)
    city = City.objects.create(name="Chennai", slug="chennai", is_active=True)
    # Zone with services_configured=False accepts all active services
    zone = Zone.objects.create(city=city, name="Adyar", postal_code="600020", is_active=True, services_configured=False)
    PricingRule.objects.create(package=pkg, zone=zone, base_paise=39900, payment_policy="PAY_AT_VISIT", is_active=True)

    # Admin edit checks: packages, zones, pricing, FAQs, banners
    assert admin_client.patch(f"/api/v1/admin/packages/{pkg.id}/", {
        "inclusions": ["Filter wash"], "requirements": ["Power socket"],
    }, format="json").status_code == 200
    assert admin_client.patch(f"/api/v1/admin/zones/{zone.id}/", {
        "operational_capacity": 12, "working_hours": [{"day": "MON"}],
    }, format="json").status_code == 200
    pr = PricingRule.objects.get(package=pkg, zone=zone, is_active=True)
    pr_patch = admin_client.patch(f"/api/v1/admin/pricing/{pr.id}/", {
        "package_id": str(pkg.id), "zone_id": str(zone.id), "base_paise": 39900, "fee_paise": 5000, "is_active": True,
    }, format="json")
    assert pr_patch.status_code == 200 and pr_patch.json()["fee_paise"] == 5000
    faq = admin_client.post("/api/v1/admin/faqs/", {"question": "Warranty?", "answer": "30 days"}, format="json")
    assert faq.status_code == 201
    assert admin_client.patch(f"/api/v1/admin/faqs/{faq.json()['id']}/", {"is_active": False}, format="json").status_code == 200
    assert admin_client.delete(f"/api/v1/admin/faqs/{faq.json()['id']}/").status_code == 204
    banner = admin_client.post("/api/v1/admin/homepage-banners/", {"title": "Summer Promo", "placement": "HERO"}, format="json")
    assert banner.status_code == 201
    assert admin_client.patch(f"/api/v1/admin/homepage-banners/{banner.json()['id']}/", {"is_active": False}, format="json").status_code == 200
    assert admin_client.delete(f"/api/v1/admin/homepage-banners/{banner.json()['id']}/").status_code == 204

    # Direct Lead Creation + service_items update + quick work order conversion
    lead_post = admin_client.post("/api/v1/operations/leads/", {
        "customer_name": "Walkin Lead", "mobile_number": "+919876511122",
        "address": "Adyar, Chennai", "city": "Chennai", "area": "Adyar", "pincode": "600020",
        "service_category_id": str(cat.id), "service_id": str(svc.id), "source": "PHONE_CALL",
    }, format="json")
    assert lead_post.status_code == 201, lead_post.content
    lead_id = lead_post.json()["id"]
    lead_items = admin_client.patch(f"/api/v1/operations/leads/{lead_id}/", {
        "service_items": [{"service_id": str(svc.id), "quantity": 2}],
    }, format="json")
    assert lead_items.status_code == 200 and lead_items.json()["service_items"] == [{"service_id": str(svc.id), "quantity": 2}]
    lead_conv = admin_client.post(f"/api/v1/operations/leads/{lead_id}/convert/", {"notes": "Converted in test"}, format="json")
    assert lead_conv.status_code == 200 and lead_conv.json()["status"] == "CONVERTED" and lead_conv.json()["converted_booking_id"]

    # Technician Admin Create, Profile Edit, Services, Locations & Reviews Filter
    new_tech = admin_client.post("/api/v1/admin/technicians/", {
        "display_name": "AS Refrigeration", "phone": "+919876522233", "city": "Chennai", "technician_type": "PARTNER",
    }, format="json")
    assert new_tech.status_code == 201 and new_tech.json()["employee_code"].startswith("NPT-")
    nt_id = new_tech.json()["id"]
    nt_patch = admin_client.patch(f"/api/v1/admin/technicians/{nt_id}/", {
        "lead_per_day": 5, "job_per_day": 4, "no_of_teams": 2,
        "supported_service_ids": [str(svc.id)], "service_area_ids": [str(zone.id)],
    }, format="json")
    assert nt_patch.status_code == 200 and len(nt_patch.json()["supported_services"]) == 1 and len(nt_patch.json()["service_areas"]) == 1
    assert admin_client.get(f"/api/v1/admin/reviews/?technician={nt_id}").status_code == 200

    check = APIClient().get("/api/v1/service-areas/check/", {"postal_code": "600020"})
    assert check.status_code == 200 and check.json()["is_supported"] is True

    start = timezone.now() + timedelta(days=2)
    slot = AppointmentSlot.objects.create(zone=zone, package=pkg, start_at=start, end_at=start + timedelta(hours=1), capacity=2, is_active=True)
    address = Address.objects.create(user=customer, zone=zone, line_1="10 Adyar", house_flat="10", street="Adyar",
                                     locality="Adyar", city="Chennai", state="Tamil Nadu", postal_code="600020")

    # Schedule closure blocks slot availability and checkout
    closure = admin_client.post("/api/v1/admin/schedule-closures/", {
        "zone_id": str(zone.id),
        "start_at": (start - timedelta(minutes=30)).isoformat(),
        "end_at": (start + timedelta(minutes=90)).isoformat(),
        "reason": "Public holiday",
    }, format="json")
    assert closure.status_code == 201
    assert APIClient().get("/api/v1/slots/", {"service_id": str(svc.id), "postal_code": "600020", "city": "Chennai"}).json()["slots"] == []

    # Lift closure
    assert admin_client.delete(f"/api/v1/admin/schedule-closures/{closure.json()['id']}/").status_code == 204
    assert len(APIClient().get("/api/v1/slots/", {"service_id": str(svc.id), "postal_code": "600020", "city": "Chennai"}).json()["slots"]) == 1

    # Open lead for same customer gets linked on booking confirmation
    lead = Lead.objects.create(
        lead_reference="NL-PRD-001", customer_name="Customer", mobile_number="+919876500001",
        service_category=cat, service=svc, zone=zone, source="PHONE_CALL", created_by=admin,
    )

    # Cart add + checkout
    assert cust_client.put(f"/api/v1/cart/items/{svc.id}/", {"package_id": str(pkg.id), "quantity": 1}, format="json").status_code == 200
    checkout = cust_client.post("/api/v1/cart/checkout/", {"address_id": str(address.id), "slot_id": str(slot.id)}, format="json")
    assert checkout.status_code == 201, checkout.content
    assert re.fullmatch(r"NPBK-\d{6}-\d{4}", checkout.json()["reference"])
    assert re.fullmatch(r"NPC-\d{5}", cust_client.get("/api/v1/auth/me/").json()["customer_code"])
    booking_id = checkout.json()["id"]
    lead.refresh_from_db()
    assert str(lead.converted_booking_id) == booking_id and lead.status == "CONVERTED"

    # Admin confirms booking & edits catalogue service PurpleSquad fields
    confirm_res = admin_client.post(f"/api/v1/admin/bookings/{booking_id}/confirm/", {"reason": "Approved"}, format="json")
    assert confirm_res.status_code == 200 and confirm_res.json()["status"] == "CONFIRMED"
    svc_patch = admin_client.patch(f"/api/v1/admin/services/{svc.id}/", {
        "is_popular": True, "inclusions": ["Filter wash", "Coil check"], "important_notes": "Power supply needed",
    }, format="json")
    assert svc_patch.status_code == 200 and svc_patch.json()["is_popular"] is True
    assert svc_patch.json()["inclusions"] == ["Filter wash", "Coil check"]

    # Owner gets 4-digit start OTP; other users cannot read it
    otp_res = cust_client.get(f"/api/v1/bookings/{booking_id}/start-otp/")
    assert otp_res.status_code == 200
    start_otp = otp_res.json()["start_otp"]
    assert len(start_otp) == 4
    other = get_user_model().objects.create_user(username="other-cust", phone_e164="+919876500009")
    other_client = APIClient()
    other_client.force_authenticate(user=other)
    assert other_client.get(f"/api/v1/bookings/{booking_id}/start-otp/").status_code == 404

    # Technician flow with company user, OTP attempt limit, and completion + review
    tech_owner = get_user_model().objects.create_user(username="tech-owner", phone_e164="+919876500002")
    tech_member = get_user_model().objects.create_user(username="tech-member", phone_e164="+919876500003")
    profile = TechnicianProfile.objects.create(user=tech_owner, display_name="Partner Co", city="Chennai",
                                               verification_status="VERIFIED", is_active=True, is_online=True)
    cu = admin_client.post(f"/api/v1/admin/technicians/{profile.id}/company-users/",
                           {"user_id": tech_member.id, "role": "TECHNICIAN"}, format="json")
    assert cu.status_code == 201

    offer = JobOffer.objects.create(booking_id=booking_id, technician=profile, expires_at=timezone.now() + timedelta(hours=2), offered_by=admin)
    assignment = JobAssignment.objects.create(booking_id=booking_id, technician=profile, offer=offer, status="INSPECTING", assigned_at=timezone.now())

    tech_client = APIClient()
    tech_client.force_authenticate(user=tech_member)
    # Wrong OTP rejected (increments attempts), correct OTP succeeds and syncs Booking -> IN_PROGRESS -> COMPLETED
    assignment.status = "AWAITING_QUOTATION_APPROVAL"
    assignment.save()
    pre_detail = cust_client.get(f"/api/v1/bookings/{booking_id}/").json()
    assert pre_detail["start_otp_code"] == start_otp
    assert pre_detail["technician"]["name"] == "Partner Co"
    assert tech_client.post(f"/api/v1/technicians/jobs/{assignment.id}/start-work/", {"otp": "9999"}, format="json").status_code == 400
    b = Booking.objects.get(id=booking_id)
    assert b.start_otp_attempts == 1
    assert tech_client.post(f"/api/v1/technicians/jobs/{assignment.id}/start-work/", {"otp": start_otp}, format="json").status_code == 200
    in_prog_detail = cust_client.get(f"/api/v1/bookings/{booking_id}/").json()
    assert in_prog_detail["status"] == "IN_PROGRESS" and in_prog_detail["start_otp_code"] == ""
    assert tech_client.post(f"/api/v1/technicians/jobs/{assignment.id}/complete/", {"checklist": ["Done"], "work_notes": "All fixed"}, format="json").status_code == 200
    done_detail = cust_client.get(f"/api/v1/bookings/{booking_id}/").json()
    assert done_detail["status"] == "COMPLETED" and done_detail["can_review"] is True

    # Customer leaves review and admin moderates it
    rev = cust_client.post(f"/api/v1/bookings/{booking_id}/review/", {"rating": 5, "comment": "Great service"}, format="json")
    assert rev.status_code == 201
    assert APIClient().get(f"/api/v1/services/{svc.id}/reviews/").json()["review_count"] == 1
    assert admin_client.patch(f"/api/v1/admin/reviews/{rev.json()['id']}/", {"is_visible": False}, format="json").status_code == 200
    assert APIClient().get(f"/api/v1/services/{svc.id}/reviews/").json()["review_count"] == 0

    # Technician performance & leaves review
    assert tech_client.get("/api/v1/technicians/performance/").json()["completed_jobs"] == 1
    leave = tech_client.post("/api/v1/technicians/leaves/", {
        "start_at": (timezone.now() + timedelta(days=5)).isoformat(),
        "end_at": (timezone.now() + timedelta(days=6)).isoformat(),
        "reason": "Personal",
    }, format="json")
    assert leave.status_code == 201
    assert admin_client.post(f"/api/v1/admin/technician-leaves/{leave.json()['id']}/review/", {"status": "APPROVED"}, format="json").json()["status"] == "APPROVED"

    # Admin activities, photos, work-order close, global search, push device & notification controls
    assert admin_client.get(f"/api/v1/admin/bookings/{booking_id}/activities/").status_code == 200
    assert admin_client.get(f"/api/v1/admin/bookings/{booking_id}/photos/").status_code == 200
    assert admin_client.post(f"/api/v1/admin/work-orders/{booking_id}/close/", {"note": "Settled"}, format="json").json()["status"] == "CLOSED"
    assert len(admin_client.get("/api/v1/admin/search/", {"q": "Partner Co"}).json()["technicians"]) == 1

    # Manual work order + record balance
    wo = admin_client.post("/api/v1/admin/work-orders/", {
        "customer_phone": "+919876500001", "package_id": str(pkg.id), "slot_id": str(slot.id),
    }, format="json")
    assert wo.status_code == 201
    assert re.fullmatch(r"NPWO-\d{6}-\d{4}", wo.json()["reference"])
    from domains.payments.models import Invoice
    inv = Invoice.objects.create(
        booking_id=wo.json()["id"],
        issue_date=timezone.localdate(),
        seller_name="NammaPros",
        seller_address="Chennai",
        subtotal_paise=39900,
        tax_paise=0,
        total_paise=39900,
    )
    assert re.fullmatch(r"NPINV-\d{4}-\d{4}", inv.invoice_number)
    assert admin_client.post(f"/api/v1/admin/bookings/{wo.json()['id']}/record-balance/", {"amount_paise": wo.json()["price_paise"], "method": "CASH"}, format="json").json()["payment_status"] == "PAID"

    # Device registration + Notification retry/cancel
    assert cust_client.post("/api/devices/register/", {"platform": "ANDROID", "token": "fcm-tok-123"}, format="json").status_code == 201
    assert DeviceToken.objects.filter(user=customer, token="fcm-tok-123", is_active=True).exists()
    notif = Notification.objects.create(recipient=customer, channel="SMS", event="BOOKING_CONFIRMED", status="FAILED_REVIEW")
    assert admin_client.post(f"/api/v1/admin/notifications/{notif.id}/retry/").json()["status"] == "BLOCKED_CONFIGURATION"
    assert admin_client.post(f"/api/v1/admin/notifications/{notif.id}/cancel/").json()["status"] == "CANCELLED"

    # Leads CRM endpoints (schedule, contact, payment link, manual payment, export)
    lead2 = Lead.objects.create(lead_reference="NL-PRD-002", customer_name="Lead Two", mobile_number="+919876500010",
                                service_category=cat, service=svc, zone=zone, source="WEBSITE", created_by=admin)
    assert admin_client.post(f"/api/v1/admin/leads/{lead2.id}/schedule/", {"preferred_date": timezone.localdate().isoformat()}, format="json").status_code == 200
    assert admin_client.post(f"/api/v1/admin/leads/{lead2.id}/record-contact/", {"channel": "PHONE", "outcome": "Interested"}, format="json").json()["status"] == "CONTACTED"
    assert admin_client.post(f"/api/v1/admin/leads/{lead2.id}/send-payment-link/", {"amount_paise": 19900}, format="json").status_code == 200
    assert admin_client.post(f"/api/v1/admin/leads/{lead2.id}/record-manual-payment/", {"amount_paise": 19900, "method": "UPI"}, format="json").json()["payment_status"] == "PAID"
    assert admin_client.get("/api/v1/admin/leads/export/").status_code == 200
    from django.core.cache import cache
    cache.clear()


@pytest.mark.django_db
def test_unified_services_categories_banners_and_gallery():
    from django.core.cache import cache
    from django.core.files.uploadedfile import SimpleUploadedFile

    cache.clear()
    admin = _make_admin("+919999990006")
    admin_client = APIClient()
    admin_client.force_authenticate(user=admin)

    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00\x04\x00\x01\xf5\x8b\xb2\xee\x00\x00\x00\x00IEND\xaeB`\x82"
    ac_cat = admin_client.post("/api/v1/admin/categories/", {"slug": "ac", "name": "AC", "description": "AC care"}, format="json").json()
    assert ac_cat["banner_image"] == ""
    assert ac_cat["image_url"] == ""
    banner_patch = admin_client.patch(f"/api/v1/admin/categories/{ac_cat['id']}/", {
        "banner_title": "AC Service Banner", "banner_subtitle": "Certified AC technicians",
        "banner_button_text": "Book AC", "banner_button_link": "/book", "banner_is_active": True,
    }, format="json")
    assert banner_patch.status_code == 200 and banner_patch.json()["banner_title"] == "AC Service Banner"
    banner_up = admin_client.post(f"/api/v1/admin/categories/{ac_cat['id']}/images/", {
        "slot": "banner", "file": SimpleUploadedFile("banner.png", png_bytes, content_type="image/png"),
    })
    assert banner_up.status_code == 200 and "/media/banner/" in banner_up.json()["url"]
    sub_svc = admin_client.post("/api/v1/admin/services/", {
        "category_id": ac_cat["id"], "slug": "ac-installation", "name": "AC Installation", "summary": "Split AC setup",
    }, format="json").json()
    assert sub_svc["main_image"] == ""
    sub_patch = admin_client.patch(f"/api/v1/admin/services/{sub_svc['id']}/", {
        "description": "<p>Full install guide</p>", "price_note": "Standard split AC",
        "features": ["Vacuum test"], "faqs": [{"question": "Pipe included?", "answer": "Standard kit"}],
        "seo_title": "AC Installation Chennai", "seo_description": "Book AC install",
    }, format="json")
    assert sub_patch.status_code == 200 and sub_patch.json()["features"] == ["Vacuum test"]
    gal_up = admin_client.post(f"/api/v1/admin/services/{sub_svc['id']}/images/", {
        "slot": "gallery", "alt_text": "Install photo", "file": SimpleUploadedFile("g.png", png_bytes, content_type="image/png"),
    })
    assert gal_up.status_code == 201 and gal_up.json()["alt_text"] == "Install photo"
    pub_cat = APIClient().get("/api/v1/service-categories/ac/")
    assert pub_cat.status_code == 200 and pub_cat.json()["category"]["banner_title"] == "AC Service Banner"
    pub_sub = APIClient().get("/api/v1/services/ac/installation/")
    assert pub_sub.status_code == 200 and pub_sub.json()["service"]["seo_title"] == "AC Installation Chennai"
    assert admin_client.delete(f"/api/v1/admin/services/{sub_svc['id']}/images/{gal_up.json()['id']}/").status_code == 204
    assert admin_client.delete(f"/api/v1/admin/services/{sub_svc['id']}/").status_code == 204
    assert admin_client.delete(f"/api/v1/admin/categories/{ac_cat['id']}/").status_code == 204
    cache.clear()
