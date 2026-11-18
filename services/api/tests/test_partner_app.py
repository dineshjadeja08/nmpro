"""Partner app: OTP-verified join requests, joining fee, KYC + admin app login, messages,
collections (earnings), invoices and personal-data rights."""
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from domains.administration.models import StaffRole
from domains.bookings.models import AppointmentSlot, Booking
from domains.catalog.models import Category, Service, ServicePackage
from domains.locations.models import Address, City, Zone
from domains.notifications.models import Notification
from domains.payments.models import Payment
from domains.technicians.models import (JobAssignment, JobOffer, TechnicianDocument, TechnicianJoiningFee,
                                        TechnicianProfile)
from domains.users.models import DataRequest

User = get_user_model()
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64


@pytest.fixture
def setup(db, settings):
    from django.core.cache import cache

    cache.clear()
    settings.ENVIRONMENT = "development"
    settings.TECHNICIAN_JOINING_FEE_PAISE = 1000000
    category = Category.objects.create(slug="ac", name="AC", is_active=True)
    service = Service.objects.create(category=category, slug="ac-service", name="AC Service", is_active=True)
    package = ServicePackage.objects.create(service=service, name="Foam jet", pricing_model="FIXED_PRICE",
                                            duration_minutes=60, skill_code="AC", is_active=True)
    city = City.objects.create(name="Chennai", slug="chennai", is_active=True)
    zone = Zone.objects.create(city=city, name="Adyar", postal_code="600020", is_active=True)
    admin = User.objects.create_user(username="+919800000900", phone_e164="+919800000900")
    StaffRole.objects.create(user=admin, role="SUPER_ADMIN", assigned_by=admin)
    admin_client = APIClient()
    admin_client.force_authenticate(user=admin)
    return {"service": service, "package": package, "zone": zone, "admin": admin_client, "admin_user": admin}


def otp(client, phone, app="partner"):
    from domains.users.models import OTPChallenge

    # Tests send several codes to one number; skip the one-code-per-minute wait.
    OTPChallenge.objects.filter(phone_e164=phone).update(created_at=timezone.now() - timedelta(minutes=2))
    return client.post("/api/v1/auth/otp/request/", {"phone_e164": phone, "app": app}, format="json")


def join(client, setup, phone="9840011223", **extra):
    challenge = client.post("/api/v1/technicians/join-otp/", {"phone": phone}, format="json")
    assert challenge.status_code == 200, challenge.content
    body = {"name": "Ravi Kumar", "phone": phone, "city": "Chennai", "experience_years": "4", "skills": "AC",
            "zone_ids": str(setup["zone"].id), "consent": "true",
            "challenge_id": challenge.json()["challenge_id"], "code": challenge.json()["development_code"],
            "id_document": SimpleUploadedFile("id.jpg", JPEG, content_type="image/jpeg"), **extra}
    return client.post("/api/v1/technicians/join-requests/", body, format="multipart")


def test_join_needs_phone_otp(setup):
    client = APIClient()
    challenge = client.post("/api/v1/technicians/join-otp/", {"phone": "9840011223"}, format="json").json()
    wrong = "0" * len(challenge["development_code"])
    wrong = wrong if wrong != challenge["development_code"] else "1" * len(wrong)
    body = {"name": "Ravi", "phone": "9840011223", "city": "Chennai", "skills": "AC", "consent": "true",
            "challenge_id": challenge["challenge_id"], "code": wrong}
    assert client.post("/api/v1/technicians/join-requests/", body, format="multipart").status_code == 400
    no_code = {k: v for k, v in body.items() if k not in ("challenge_id", "code")}
    assert client.post("/api/v1/technicians/join-requests/", no_code, format="multipart").status_code == 400
    assert not TechnicianProfile.objects.exists()
    assert client.post("/api/v1/technicians/join-otp/", {"phone": "12345"}, format="json").status_code == 400


def test_join_pay_fee_offline_then_admin_enables_login(setup):
    client = APIClient()
    created = join(client, setup)
    assert created.status_code == 201, created.content
    assert created.json()["joining_fee"] == {**created.json()["joining_fee"], "amount_paise": 1000000, "status": "PENDING"}
    profile = TechnicianProfile.objects.get(user__phone_e164="+919840011223")
    assert profile.verification_status == "UNDER_REVIEW" and profile.app_login_enabled is False

    # Signed in straight after joining: can see the fee, but not jobs.
    assert client.get("/api/v1/technicians/joining-fee/").json()["status"] == "PENDING"
    assert client.get("/api/v1/technicians/jobs/").status_code == 403
    # Online payment not configured: a clear message, no order.
    assert "not available" in str(client.post("/api/v1/technicians/joining-fee/order/", {}, format="json").content)
    # An applicant with an unpaid fee may sign in (only to pay).
    assert otp(APIClient(), "+919840011223").status_code == 200

    url = f"/api/v1/admin/technicians/{profile.id}/"
    profile.verification_status = "VERIFIED"
    profile.is_active = True
    profile.save()
    refused = setup["admin"].patch(url, {"app_login_enabled": True}, format="json")
    assert refused.status_code == 400 and "joining fee" in str(refused.content)

    recorded = setup["admin"].patch(url, {"joining_fee": {"status": "PAID", "method": "BANK_TRANSFER",
                                                          "reference": "UTR123"}}, format="json")
    assert recorded.status_code == 200, recorded.content
    assert recorded.json()["joining_fee"]["status"] == "PAID"
    assert setup["admin"].patch(url, {"joining_fee": {"status": "PAID", "method": "CASH"}}, format="json").status_code == 400

    on = setup["admin"].patch(url, {"app_login_enabled": True}, format="json")
    assert on.status_code == 200 and on.json()["app_login_enabled"] is True
    message = Notification.objects.get(recipient=profile.user, event="TECHNICIAN_APP_ACCESS_ENABLED")
    assert message.status == "BLOCKED_CONFIGURATION" and message.channel in ("SMS", "WHATSAPP")

    fresh = APIClient()
    sent = otp(fresh, "+919840011223")
    assert sent.status_code == 200
    assert fresh.post("/api/v1/auth/otp/verify/", {"phone_e164": "+919840011223", "app": "partner",
                                                   "challenge_id": sent.json()["challenge_id"],
                                                   "code": sent.json()["development_code"]}, format="json").status_code == 200
    assert fresh.get("/api/v1/technicians/jobs/").status_code == 200
    setup["admin"].patch(url, {"app_login_enabled": False}, format="json")
    assert fresh.get("/api/v1/technicians/jobs/").status_code == 403


def test_fee_paid_but_not_approved_cannot_sign_in(setup):
    join(APIClient(), setup)
    TechnicianJoiningFee.objects.update(status="PAID", method="CASH", paid_at=timezone.now())
    blocked = otp(APIClient(), "+919840011223")
    assert blocked.status_code == 403 and "being reviewed" in blocked.json()["error"]["message"]
    assert otp(APIClient(), "+919840099999").status_code == 403


def test_pay_joining_fee_online(setup, settings, monkeypatch):
    settings.RAZORPAY_ENABLED = True
    settings.RAZORPAY_KEY_ID = "rzp_test_key"

    class Provider:
        def create_order(self, amount_paise, receipt):
            return {"id": "order_fee_1", "amount": amount_paise, "currency": "INR"}

        def verify_checkout(self, order_id, payment_id, signature):
            return signature == "good"

        def fetch_payment(self, payment_id):
            return {"id": payment_id, "order_id": "order_fee_1", "amount": 1000000, "status": "captured"}

    monkeypatch.setattr("domains.payments.services.get_provider", lambda: Provider())
    client = APIClient()
    join(client, setup)
    order = client.post("/api/v1/technicians/joining-fee/order/", {}, format="json")
    assert order.status_code == 200, order.content
    assert order.json()["amount_paise"] == 1000000 and order.json()["key_id"] == "rzp_test_key"
    body = {"razorpay_order_id": "order_fee_1", "razorpay_payment_id": "pay_fee_1", "razorpay_signature": "bad"}
    assert client.post("/api/v1/technicians/joining-fee/verify/", body, format="json").status_code == 400
    body["razorpay_signature"] = "good"
    paid = client.post("/api/v1/technicians/joining-fee/verify/", body, format="json")
    assert paid.status_code == 200 and paid.json()["status"] == "PAID" and paid.json()["method"] == "ONLINE"
    assert client.post("/api/v1/technicians/joining-fee/order/", {}, format="json").status_code == 400
    profile = TechnicianProfile.objects.get(user__phone_e164="+919840011223")
    assert Notification.objects.filter(recipient=profile.user, event="TECHNICIAN_JOINING_FEE_PAID").exists()


def test_only_super_or_finance_admin_can_waive(setup):
    join(APIClient(), setup)
    profile = TechnicianProfile.objects.get()
    verifier = User.objects.create_user(username="+919800000901", phone_e164="+919800000901")
    StaffRole.objects.create(user=verifier, role="TECHNICIAN_VERIFIER", assigned_by=verifier)
    c = APIClient()
    c.force_authenticate(user=verifier)
    url = f"/api/v1/admin/technicians/{profile.id}/"
    assert c.patch(url, {"joining_fee": {"status": "WAIVED", "method": "WAIVED"}}, format="json").status_code == 400
    assert setup["admin"].patch(url, {"joining_fee": {"status": "WAIVED", "method": "WAIVED"}},
                                format="json").json()["joining_fee"]["status"] == "WAIVED"


@pytest.fixture
def working_tech(setup):
    user = User.objects.create_user(username="+919840033445", phone_e164="+919840033445", first_name="Arun")
    tech = TechnicianProfile.objects.create(user=user, display_name="Arun", verification_status="VERIFIED",
                                            is_active=True, app_login_enabled=True)
    customer = User.objects.create_user(username="+919840033999", phone_e164="+919840033999", first_name="Meena")
    address = Address.objects.create(user=customer, line_1="1 Main Rd", locality="Adyar", city="Chennai",
                                     postal_code="600020", contact_name="Meena", contact_phone="+919840033999")
    now = timezone.now()
    jobs = []
    for i, (days_ago, amount, method) in enumerate([(0, 30000, "CASH"), (1, 20000, "UPI"), (40, 50000, "CASH")]):
        slot = AppointmentSlot.objects.create(zone=setup["zone"], package=setup["package"], start_at=now + timedelta(hours=i),
                                              end_at=now + timedelta(hours=i + 1), capacity=5, is_active=True)
        booking = Booking.objects.create(user=customer, service=setup["service"], package=setup["package"],
                                         address=address, slot=slot, status="COMPLETED", reference=f"NP-COL-{i}")
        offer = JobOffer.objects.create(booking=booking, technician=tech, status="ACCEPTED", offered_by=user, expires_at=now)
        job = JobAssignment.objects.create(booking=booking, technician=tech, offer=offer, status="SERVICE_COMPLETED",
                                           assigned_at=now)
        Payment.objects.create(booking=booking, provider_payment_id=f"visit_{i}", amount_paise=amount, currency="INR",
                               status="CAPTURED", payment_type="BALANCE", payment_method=method,
                               verified_at=now - timedelta(days=days_ago))
        jobs.append(job)
    client = APIClient()
    client.force_authenticate(user=user)
    return {"client": client, "jobs": jobs, "tech": tech, "customer": customer, "address": address}


def test_job_assigned_message_sent_on_commit(working_tech, setup, django_capture_on_commit_callbacks):
    now = timezone.now()
    slot = AppointmentSlot.objects.create(zone=setup["zone"], package=setup["package"], start_at=now + timedelta(days=3),
                                          end_at=now + timedelta(days=3, hours=1), capacity=5, is_active=True)
    booking = Booking.objects.create(user=working_tech["customer"], service=setup["service"], package=setup["package"],
                                     address=working_tech["address"], slot=slot, status="CONFIRMED", reference="NP-ASG-1")
    offer = JobOffer.objects.create(booking=booking, technician=working_tech["tech"], status="ACCEPTED",
                                    offered_by=working_tech["tech"].user, expires_at=now)
    with django_capture_on_commit_callbacks(execute=True):
        JobAssignment.objects.create(booking=booking, technician=working_tech["tech"], offer=offer, assigned_at=now)
    msg = Notification.objects.get(event="TECHNICIAN_JOB_ASSIGNED", booking=booking)
    assert msg.recipient == working_tech["tech"].user and msg.payload["booking_reference"] == "NP-ASG-1"


def test_collections_by_day_month_and_custom_range(working_tech):
    client = working_tech["client"]
    today = timezone.localdate()
    day = client.get("/api/v1/technicians/earnings/report/", {"period": "day"}).json()
    assert day["totals"] == {"CASH": 30000, "UPI": 0, "ALL": 30000} and day["jobs"] == 1
    custom = client.get("/api/v1/technicians/earnings/report/", {
        "period": "custom", "from": (today - timedelta(days=60)).isoformat(), "to": today.isoformat()}).json()
    assert custom["totals"] == {"CASH": 80000, "UPI": 20000, "ALL": 100000} and custom["jobs"] == 3
    assert {r["method"] for r in custom["rows"]} == {"CASH", "UPI"}
    month = client.get("/api/v1/technicians/earnings/report/", {"period": "month", "month": today.strftime("%Y-%m")}).json()
    assert month["from"].endswith("-01")
    assert client.get("/api/v1/technicians/earnings/report/", {"period": "custom", "from": "2030-02-01",
                                                               "to": "2030-01-01"}).status_code == 400
    pdf = client.get("/api/v1/technicians/earnings/statement/", {"period": "custom",
                                                                 "from": (today - timedelta(days=60)).isoformat(),
                                                                 "to": today.isoformat()})
    assert pdf.status_code == 200 and b"".join(pdf.streaming_content).startswith(b"%PDF")


def test_job_invoice_only_for_own_issued_invoice(working_tech):
    from domains.payments.models import Invoice

    job = working_tech["jobs"][0]
    url = f"/api/v1/technicians/jobs/{job.id}/invoice/"
    assert working_tech["client"].get(url).status_code == 404
    invoice = Invoice(booking=job.booking, invoice_number="NP-INV-0001", issue_date=timezone.localdate(),
                      seller_name="Seller", seller_address="Addr", subtotal_paise=30000, tax_paise=0, total_paise=30000)
    invoice.document.save("inv.pdf", ContentFile(b"%PDF-1.4 test"), save=False)
    invoice.save()
    assert working_tech["client"].get(url).status_code == 200
    other = User.objects.create_user(username="+919840044556", phone_e164="+919840044556")
    TechnicianProfile.objects.create(user=other, display_name="Other", verification_status="VERIFIED", is_active=True,
                                     app_login_enabled=True)
    stranger = APIClient()
    stranger.force_authenticate(user=other)
    assert stranger.get(url).status_code == 404


def test_customer_data_export_and_deletion(working_tech, setup):
    customer = APIClient()
    customer.force_authenticate(user=working_tech["customer"])
    export = customer.get("/api/v1/account/my-data/")
    assert export.status_code == 200 and export["Content-Disposition"].startswith("attachment")
    assert export.json()["account"]["phone"] == "+919840033999" and len(export.json()["bookings"]) == 3

    req = customer.post("/api/v1/account/data-requests/", {"reason": "Moving away"}, format="json")
    assert req.status_code == 201
    assert customer.post("/api/v1/account/data-requests/", {}, format="json").status_code == 200  # no duplicates

    rows = setup["admin"].get("/api/v1/admin/data-requests/").json()["results"]
    assert rows[0]["status"] == "RECEIVED" and rows[0]["due_by"]
    done = setup["admin"].post(f"/api/v1/admin/data-requests/{req.json()['id']}/complete/", {}, format="json")
    assert done.status_code == 200 and done.json()["status"] == "COMPLETED"
    user = User.objects.get(pk=working_tech["customer"].pk)
    assert user.phone_e164 is None and user.first_name == "" and user.is_active is False
    address = Address.objects.get(pk=working_tech["address"].pk)
    assert address.contact_phone == "" and address.line_1 == "[deleted]"
    assert Booking.objects.filter(user=user).count() == 3  # bookings kept for tax records, without personal details
    assert DataRequest.objects.get(id=req.json()["id"]).phone_e164 == ""

    plain = APIClient()
    plain.force_authenticate(user=User.objects.create_user(username="+919840055667", phone_e164="+919840055667"))
    assert plain.get("/api/v1/admin/data-requests/").status_code == 403


def test_deletion_refused_with_open_booking(working_tech, setup):
    Booking.objects.filter(reference="NP-COL-0").update(status="CONFIRMED")
    customer = APIClient()
    customer.force_authenticate(user=working_tech["customer"])
    req = customer.post("/api/v1/account/data-requests/", {}, format="json").json()
    blocked = setup["admin"].post(f"/api/v1/admin/data-requests/{req['id']}/complete/", {}, format="json")
    assert blocked.status_code == 400 and "open booking" in str(blocked.content)
    rejected = setup["admin"].post(f"/api/v1/admin/data-requests/{req['id']}/reject/", {"note": "Open booking"},
                                   format="json")
    assert rejected.json()["status"] == "REJECTED"


def test_kyc_files_purged_after_retention(setup, settings):
    from domains.users.data_rights import purge_expired_kyc_documents

    settings.KYC_RETENTION_REJECTED_DAYS = 90
    user = User.objects.create_user(username="+919840066778", phone_e164="+919840066778")
    tech = TechnicianProfile.objects.create(user=user, display_name="Old", verification_status="REJECTED")
    doc = TechnicianDocument.objects.create(technician=tech, kind="IDENTITY", content_type="image/jpeg",
                                            file=SimpleUploadedFile("id.jpg", JPEG))
    assert purge_expired_kyc_documents() == 0  # still within 90 days
    TechnicianProfile.objects.filter(id=tech.id).update(updated_at=timezone.now() - timedelta(days=91))
    assert purge_expired_kyc_documents() == 1
    doc.refresh_from_db()
    assert doc.status == "PURGED" and not doc.file


def test_join_with_aadhaar_pan_and_photo_goes_to_review(setup):
    client = APIClient()
    files = {name: SimpleUploadedFile(f"{name}.jpg", JPEG, content_type="image/jpeg")
             for name in ("aadhaar_front", "aadhaar_back", "pan", "photo")}
    response = join(client, setup, phone="9840011299", id_document="", **files)
    assert response.status_code == 201, response.content
    assert response.json()["status"] == "UNDER_REVIEW"
    profile = TechnicianProfile.objects.get(user__phone_e164="+919840011299")
    assert sorted(profile.documents.values_list("kind", flat=True)) == ["AADHAAR_BACK", "AADHAAR_FRONT", "PAN",
                                                                       "PROFILE_PHOTO"]


def test_join_without_all_documents_waits_for_documents(setup):
    client = APIClient()
    response = join(client, setup, phone="9840011298", id_document="",
                    aadhaar_front=SimpleUploadedFile("f.jpg", JPEG, content_type="image/jpeg"))
    assert response.status_code == 201, response.content
    assert response.json()["status"] == "PENDING_DOCUMENTS"
