from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient

from domains.bookings.models import AppointmentSlot, Booking, SlotHold
from domains.bookings.states import StateConflict, require_transition
from domains.bookings.tasks import cleanup_expired_holds
from domains.catalog.models import Category, PricingRule, Service, ServicePackage
from domains.locations.models import Address, City, ServiceCoverage, Zone
from domains.notifications.models import Notification, OutboxEvent
from domains.notifications.tasks import process_booking_outbox


@pytest.mark.django_db
def test_prepaid_capture_and_expiry(setup_booking, monkeypatch, settings):
    from domains.bookings.tasks import expire_unpaid_bookings
    from domains.payments import services as payments
    from domains.payments.models import Payment, PaymentIntent, ReconciliationException

    class Provider:
        def create_order(self, amount_paise, receipt):
            return {"id": "order_test_1", "amount": amount_paise, "currency": "INR"}

        def fetch_payment(self, payment_id):
            return {"id": payment_id, "order_id": "order_test_1", "amount": 49000,
                    "currency": "INR", "status": "captured"}

        def verify_checkout(self, order_id, payment_id, signature):
            return signature == "valid"

    settings.RAZORPAY_ENABLED = True
    settings.RAZORPAY_KEY_ID = "rzp_test_public"
    monkeypatch.setattr(payments, "get_provider", lambda: Provider())
    monkeypatch.setattr("domains.payments.views.get_provider", lambda: Provider())
    s = setup_booking
    s["rule"].payment_policy = "PREPAID"
    s["rule"].save()
    held = hold(s["client"], s["package"], s["address"], s["slot"]).json()
    quote = s["client"].post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    response = s["client"].post("/api/v1/bookings/", {"hold_id": held["id"], "quote_id": quote["id"],
        "accepted_total_paise": 49000, "terms_accepted": True}, format="json", HTTP_IDEMPOTENCY_KEY="prepaid")
    assert response.status_code == 201, response.content
    booking_id = response.json()["id"]
    assert response.json()["status"] == "AWAITING_PAYMENT"
    assert hold(s["client"], s["package"], s["address"], s["slot"]).status_code == 409
    url = f"/api/v1/bookings/{booking_id}/payment-order/"
    order = s["client"].post(url, {}, format="json", HTTP_IDEMPOTENCY_KEY="order-key")
    assert order.status_code == 201, order.content
    assert s["client"].get(f"/api/v1/bookings/{booking_id}/").json()["payment_attempt_unresolved"] is True
    assert s["client"].post(url, {}, format="json", HTTP_IDEMPOTENCY_KEY="order-key").status_code == 409
    verify_url = f"/api/v1/bookings/{booking_id}/payment-verify/"
    body = {"razorpay_order_id": "order_test_1", "razorpay_payment_id": "pay_test_1",
            "razorpay_signature": "invalid"}
    assert s["client"].post(verify_url, body, format="json").status_code == 409
    body["razorpay_signature"] = "valid"
    assert s["client"].post(verify_url, body, format="json").json()["status"] == "CONFIRMED"
    assert s["client"].get(f"/api/v1/bookings/{booking_id}/").json()["payment_attempt_unresolved"] is False
    assert s["client"].post(verify_url, body, format="json").json()["status"] == "CONFIRMED"
    assert Payment.objects.count() == 1
    assert PaymentIntent.objects.get(booking_id=booking_id).status == "PAID"
    assert expire_unpaid_bookings() == 0
    assert ReconciliationException.objects.count() == 0


@pytest.mark.django_db
def test_late_capture_is_held_for_reconciliation(setup_booking, monkeypatch, settings):
    from domains.bookings.tasks import expire_unpaid_bookings
    from domains.payments import services as payments
    from domains.payments.models import Payment, PaymentIntent, ReconciliationException

    class Provider:
        def create_order(self, amount_paise, receipt):
            return {"id": "order_late_1", "amount": amount_paise, "currency": "INR"}

        def fetch_payment(self, payment_id):
            return {"id": payment_id, "order_id": "order_late_1", "amount": 49000,
                    "currency": "INR", "status": "captured"}

    settings.RAZORPAY_ENABLED = True
    monkeypatch.setattr(payments, "get_provider", lambda: Provider())
    s = setup_booking
    s["rule"].payment_policy = "PREPAID"
    s["rule"].save()
    held = hold(s["client"], s["package"], s["address"], s["slot"]).json()
    quote = s["client"].post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    response = s["client"].post("/api/v1/bookings/", {"hold_id": held["id"], "quote_id": quote["id"],
        "accepted_total_paise": 49000, "terms_accepted": True}, format="json", HTTP_IDEMPOTENCY_KEY="prepaid-late")
    booking_id = response.json()["id"]
    assert s["client"].post(f"/api/v1/bookings/{booking_id}/payment-order/", {}, format="json",
                            HTTP_IDEMPOTENCY_KEY="order-late").status_code == 201
    Booking.objects.filter(id=booking_id).update(payment_expires_at=timezone.now() - timedelta(seconds=1))
    assert expire_unpaid_bookings() == 1
    booking = payments.record_captured_payment("order_late_1", "pay_late_1")
    assert booking.status == "EXPIRED"
    assert booking.payment_status == "REFUND_PENDING"
    assert Payment.objects.count() == 1
    assert PaymentIntent.objects.get(booking_id=booking_id).status == "PAID"
    assert ReconciliationException.objects.get(payment__provider_payment_id="pay_late_1").exception_type == "CAPTURE_AFTER_PAYMENT_WINDOW"


@pytest.mark.django_db
def test_production_otp_uses_provider_without_disclosing_code(monkeypatch, settings):
    from domains.users import views as otp_views

    class Provider:
        sent = False

        def send(self, phone):
            assert phone == "+919888888888"
            self.sent = True

        def verify(self, phone, code):
            return code == "123456"

    provider = Provider()
    settings.ENVIRONMENT = "production"
    monkeypatch.setattr(otp_views, "get_otp_provider", lambda: provider)
    client = APIClient()
    requested = client.post("/api/v1/auth/otp/request/", {"phone_e164": "+919888888888"}, format="json")
    assert requested.status_code == 200
    assert provider.sent
    assert "development_code" not in requested.json()
    assert client.post("/api/v1/auth/otp/verify/", {"phone_e164": "+919888888888",
                       "challenge_id": requested.json()["challenge_id"], "code": "000000"}, format="json").status_code == 400
    assert client.post("/api/v1/auth/otp/verify/", {"phone_e164": "+919888888888",
                       "challenge_id": requested.json()["challenge_id"], "code": "123456"}, format="json").status_code == 200
    assert client.post("/api/v1/auth/otp/verify/", {"phone_e164": "+919888888888",
                       "challenge_id": requested.json()["challenge_id"], "code": "123456"}, format="json").status_code == 400


@pytest.mark.django_db
def test_finance_refund_permissions_cap_and_provider_reconciliation(setup_booking, monkeypatch, settings):
    from domains.payments import finance
    from domains.payments.models import FinanceGrant, Payment, PaymentIntent, Refund

    s = setup_booking
    held = hold(s["client"], s["package"], s["address"], s["slot"]).json()
    quote = s["client"].post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    result = s["client"].post("/api/v1/bookings/", {"hold_id": held["id"], "quote_id": quote["id"],
        "accepted_total_paise": 49000, "terms_accepted": True}, format="json", HTTP_IDEMPOTENCY_KEY="finance-test")
    booking = Booking.objects.get(id=result.json()["id"])
    order = PaymentIntent.objects.create(booking=booking, customer=s["user"], amount_paise=49000,
                                         status="PAID", provider_order_id="order_finance", idempotency_key="finance")
    payment = Payment.objects.create(booking=booking, payment_order=order, provider_payment_id="pay_finance",
                                     amount_paise=49000, status="CAPTURED", verified_at=timezone.now())
    requester = get_user_model().objects.create_user(username="finance-requester", phone_e164="+919876543212")
    approver = get_user_model().objects.create_user(username="finance-approver", phone_e164="+919876543213")
    FinanceGrant.objects.create(user=requester, role="FINANCE_ADMIN")
    FinanceGrant.objects.create(user=approver, role="REFUND_APPROVER")
    assert s["client"].get("/api/v1/finance/payments/").status_code == 403
    client = APIClient()
    client.force_authenticate(user=requester)
    session = client.session
    session["privileged_verified_at"] = timezone.now().timestamp()
    session.save()
    body = {"payment_id": str(payment.id), "amount_paise": 20000, "reason_code": "MANUAL_REVIEW"}
    first = client.post("/api/v1/finance/refunds/", body, format="json", HTTP_IDEMPOTENCY_KEY="refund-1")
    assert first.status_code == 201, first.content
    assert client.post("/api/v1/finance/refunds/", body, format="json", HTTP_IDEMPOTENCY_KEY="refund-1").json()["id"] == first.json()["id"]
    assert client.post("/api/v1/finance/refunds/", {**body, "amount_paise": 30000}, format="json",
                       HTTP_IDEMPOTENCY_KEY="refund-2").status_code == 409
    assert client.post(f"/api/v1/finance/refunds/{first.json()['id']}/approve/").status_code == 409

    class Provider:
        def create_refund(self, payment_id, amount_paise, receipt):
            return {"id": "rfnd_finance", "payment_id": payment_id, "amount": amount_paise}

        def fetch_refund(self, refund_id):
            return {"id": refund_id, "payment_id": "pay_finance", "amount": 20000, "status": "processed"}

    settings.RAZORPAY_ENABLED = True
    monkeypatch.setattr(finance, "get_provider", lambda: Provider())
    reviewer_client = APIClient()
    reviewer_client.force_authenticate(user=approver)
    rev_session = reviewer_client.session
    rev_session["privileged_verified_at"] = timezone.now().timestamp()
    rev_session.save()
    assert reviewer_client.post(f"/api/v1/finance/refunds/{first.json()['id']}/approve/").json()["status"] == "PROCESSING"
    assert client.post(f"/api/v1/finance/refunds/{first.json()['id']}/reconcile/").json()["status"] == "SUCCEEDED"
    assert Refund.objects.get(id=first.json()["id"]).status == "SUCCEEDED"
    booking.refresh_from_db()
    assert booking.payment_status == "PARTIALLY_REFUNDED"


@pytest.mark.django_db
def test_webhook_signature_and_duplicate_event(monkeypatch, settings):
    from domains.payments.models import PaymentEvent, ReconciliationException

    class Provider:
        def verify_webhook(self, raw_body, signature):
            return signature == "valid"

    settings.RAZORPAY_ENABLED = True
    monkeypatch.setattr("domains.payments.views.get_provider", lambda: Provider())
    client = APIClient()
    url = "/api/v1/payments/razorpay/webhook/"
    body = '{"event":"payment.failed","payload":{}}'
    headers = {"HTTP_X_RAZORPAY_EVENT_ID": "evt-test-1"}
    assert client.post(url, data=body, content_type="application/json", **headers,
                       HTTP_X_RAZORPAY_SIGNATURE="invalid").status_code == 409
    assert PaymentEvent.objects.count() == 0
    assert client.post(url, data=body, content_type="application/json", **headers,
                       HTTP_X_RAZORPAY_SIGNATURE="valid").status_code == 200
    assert client.post(url, data=body, content_type="application/json", **headers,
                       HTTP_X_RAZORPAY_SIGNATURE="valid").status_code == 200
    assert PaymentEvent.objects.count() == 1
    assert ReconciliationException.objects.count() == 1
    changed = '{"event":"payment.authorized","payload":{}}'
    assert client.post(url, data=changed, content_type="application/json", **headers,
                       HTTP_X_RAZORPAY_SIGNATURE="valid").status_code == 409
    malformed = '{"event":"payment.captured","payload":{"payment":{"entity":[]}}}'
    assert client.post(url, data=malformed, content_type="application/json",
                       HTTP_X_RAZORPAY_EVENT_ID="evt-test-malformed",
                       HTTP_X_RAZORPAY_SIGNATURE="valid").status_code == 409


@pytest.mark.django_db
def test_invoice_pdf_renderer_and_owner_download_guard(setup_booking):
    from datetime import date
    from types import SimpleNamespace

    from django.core.files.base import ContentFile
    from django.test import override_settings

    from domains.payments.invoice_pdf import render_invoice_pdf
    from domains.payments.models import Invoice

    s = setup_booking
    held = hold(s["client"], s["package"], s["address"], s["slot"]).json()
    quote = s["client"].post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    response = s["client"].post("/api/v1/bookings/", {"hold_id": held["id"], "quote_id": quote["id"],
        "accepted_total_paise": 49000, "terms_accepted": True}, format="json", HTTP_IDEMPOTENCY_KEY="pdf-test")
    booking = Booking.objects.select_related("user", "address", "service", "price_snapshot").get(id=response.json()["id"])
    invoice = SimpleNamespace(booking=booking, seller_name="Test Seller", seller_address="Test Street",
                              tax_registration="", invoice_number="TEST-001", issue_date=date(2026, 11, 2),
                              subtotal_paise=49000, tax_paise=0, total_paise=49000)
    pdf = render_invoice_pdf(invoice)
    assert pdf.startswith(b"%PDF-") and len(pdf) > 1500
    assert s["client"].get(f"/api/v1/bookings/{booking.id}/invoice/").status_code == 404
    other_client = APIClient()
    other_client.force_authenticate(user=s["other"])
    assert other_client.get(f"/api/v1/bookings/{booking.id}/invoice/").status_code == 404
    with override_settings(STORAGES={"default": {"BACKEND": "django.core.files.storage.InMemoryStorage"}}):
        Invoice.objects.create(booking=booking, invoice_number="TEST-001",
                               document=ContentFile(pdf, name="sample.pdf"), issue_date=date(2026, 11, 2),
                               seller_name="Test Seller", seller_address="Test Street",
                               subtotal_paise=49000, tax_paise=0, total_paise=49000)
        owner_response = s["client"].get(f"/api/v1/bookings/{booking.id}/invoice/")
        assert owner_response.status_code == 200
        assert b"".join(owner_response.streaming_content).startswith(b"%PDF-")
        assert other_client.get(f"/api/v1/bookings/{booking.id}/invoice/").status_code == 404


@pytest.mark.django_db
def test_whatsapp_outbox_dispatch_requires_opt_in_and_approved_template(setup_booking, monkeypatch, settings):
    from domains.notifications import tasks as notification_tasks
    from domains.notifications.models import NotificationPreference

    s = setup_booking
    held = hold(s["client"], s["package"], s["address"], s["slot"]).json()
    quote = s["client"].post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    response = s["client"].post("/api/v1/bookings/", {"hold_id": held["id"], "quote_id": quote["id"],
        "accepted_total_paise": 49000, "terms_accepted": True}, format="json", HTTP_IDEMPOTENCY_KEY="wa-test")
    assert response.status_code == 201
    preferences = {"whatsapp_opt_in": True, "sms_opt_in": False, "email_opt_in": False}
    assert s["client"].put("/api/v1/customers/notification-preferences/", preferences, format="json").status_code == 200
    assert NotificationPreference.objects.get(user=s["user"]).whatsapp_opt_in
    assert process_booking_outbox() == 1
    notification = Notification.objects.get()
    assert notification.status == "BLOCKED_CONFIGURATION"
    settings.WHATSAPP_PROVIDER = "MSG91"
    settings.WHATSAPP_TEMPLATES = {}
    assert notification_tasks.dispatch_whatsapp_notifications() == 0

    class Provider:
        called = 0

        def send_template(self, phone, template, reference):
            assert phone == s["user"].phone_e164
            assert template == "booking_confirmed"
            assert reference == response.json()["reference"]
            self.called += 1
            return "msg-test-1"

    provider = Provider()
    monkeypatch.setattr(notification_tasks, "get_whatsapp_provider", lambda: provider)
    settings.WHATSAPP_ENABLED = True
    settings.WHATSAPP_TEMPLATES = {"BOOKING_CONFIRMED": "booking_confirmed"}
    assert notification_tasks.dispatch_whatsapp_notifications() == 1
    assert notification_tasks.dispatch_whatsapp_notifications() == 0
    notification.refresh_from_db()
    assert notification.status == "SENT_TO_PROVIDER"
    assert notification.provider_message_id == "msg-test-1"
    assert provider.called == 1


@pytest.mark.django_db
def test_failed_payment_does_not_confirm_and_later_capture_can_confirm(setup_booking, monkeypatch, settings):
    from domains.payments import services as payments
    from domains.payments.models import Payment

    class Provider:
        status = "failed"

        def create_order(self, amount_paise, receipt):
            return {"id": "order_retry", "amount": amount_paise, "currency": "INR"}

        def fetch_payment(self, payment_id):
            return {"id": payment_id, "order_id": "order_retry", "amount": 49000,
                    "currency": "INR", "status": self.status}

    provider = Provider()
    settings.RAZORPAY_ENABLED = True
    monkeypatch.setattr(payments, "get_provider", lambda: provider)
    s = setup_booking
    s["rule"].payment_policy = "PREPAID"
    s["rule"].save()
    held = hold(s["client"], s["package"], s["address"], s["slot"]).json()
    quote = s["client"].post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    response = s["client"].post("/api/v1/bookings/", {"hold_id": held["id"], "quote_id": quote["id"],
        "accepted_total_paise": 49000, "terms_accepted": True}, format="json", HTTP_IDEMPOTENCY_KEY="failure-test")
    booking_id = response.json()["id"]
    assert s["client"].post(f"/api/v1/bookings/{booking_id}/payment-order/", {}, format="json",
                            HTTP_IDEMPOTENCY_KEY="failure-order").status_code == 201
    failed = payments.record_failed_payment("order_retry", "pay_retry")
    assert failed.status == "AWAITING_PAYMENT" and failed.payment_status == "FAILED"
    assert Payment.objects.get(provider_payment_id="pay_retry").status == "FAILED"
    assert s["client"].post(f"/api/v1/bookings/{booking_id}/payment-order/", {}, format="json",
                            HTTP_IDEMPOTENCY_KEY="failure-order").status_code == 201
    provider.status = "captured"
    paid = payments.record_captured_payment("order_retry", "pay_retry")
    assert paid.status == "CONFIRMED" and paid.payment_status == "PAID"
    assert Payment.objects.get(provider_payment_id="pay_retry").status == "CAPTURED"


@pytest.mark.django_db
def test_configured_sms_and_email_dispatch_keep_provider_acceptance_separate(monkeypatch, settings):
    from domains.notifications import tasks as notification_tasks
    from domains.notifications.models import NotificationPreference

    user = get_user_model().objects.create_user(username="messages-user", phone_e164="+919876543218",
                                                email="customer@example.com")
    NotificationPreference.objects.create(user=user, sms_opt_in=True, email_opt_in=True)
    sms = Notification.objects.create(recipient=user, channel="SMS", event="BOOKING_CONFIRMED",
                                      template_key="BOOKING_CONFIRMED", payload={"booking_reference": "NP-TEST"},
                                      status="BLOCKED_CONFIGURATION")
    email = Notification.objects.create(recipient=user, channel="EMAIL", event="BOOKING_CONFIRMED",
                                        template_key="BOOKING_CONFIRMED", payload={"booking_reference": "NP-TEST"},
                                        status="BLOCKED_CONFIGURATION")
    settings.SMS_PROVIDER = "MSG91"
    settings.SMS_TEMPLATES = {"BOOKING_CONFIRMED": "template_test"}
    settings.EMAIL_PROVIDER = "SMTP"

    class SMSProvider:
        def send_template(self, phone, template, reference):
            assert (phone, template, reference) == ("+919876543218", "template_test", "NP-TEST")
            return "sms-request-test"

    class EmailProvider:
        def send_template(self, address, event, reference):
            assert (address, event, reference) == ("customer@example.com", "BOOKING_CONFIRMED", "NP-TEST")
            return "SMTP_ACCEPTED"

    monkeypatch.setattr(notification_tasks, "get_sms_provider", SMSProvider)
    monkeypatch.setattr(notification_tasks, "get_email_provider", EmailProvider)
    assert notification_tasks.dispatch_sms_notifications() == 1
    assert notification_tasks.dispatch_email_notifications() == 1
    assert notification_tasks.dispatch_sms_notifications() == 0
    sms.refresh_from_db()
    email.refresh_from_db()
    assert sms.status == email.status == "SENT_TO_PROVIDER"
    assert sms.provider_message_id == "sms-request-test"


def test_message_adapters_use_server_credentials_and_approved_templates(monkeypatch, settings):
    from django.core import mail

    from domains.notifications.providers.msg91_sms import MSG91SMSProvider
    from domains.notifications.providers.msg91_whatsapp import MSG91WhatsAppProvider
    from domains.notifications.providers.smtp_email import SMTPEmailProvider

    class Response:
        def __init__(self, body):
            self.body = body

        def raise_for_status(self):
            return None

        def json(self):
            return self.body

    calls = []

    def post(url, json, headers, timeout):
        calls.append((url, json, headers, timeout))
        if "whatsapp" in url:
            return Response({"status": "success", "request_id": "wa-test"})
        return Response({"type": "success", "message": "sms-test"})

    settings.MSG91_AUTH_KEY = "test-secret-not-logged"
    settings.WHATSAPP_INTEGRATED_NUMBER = "919000000000"
    settings.WHATSAPP_LANGUAGE_CODE = "en"
    settings.SMS_VARIABLE_NAME = "VAR1"
    settings.EMAIL_FROM_ADDRESS = "bookings@example.com"
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    monkeypatch.setattr("domains.notifications.providers.msg91_sms.requests.post", post)
    monkeypatch.setattr("domains.notifications.providers.msg91_whatsapp.requests.post", post)
    assert MSG91SMSProvider().send_template("+919876543218", "sms-approved", "NP-TEST") == "sms-test"
    assert MSG91WhatsAppProvider().send_template("+919876543218", "booking_confirmed", "NP-TEST") == "wa-test"
    assert calls[0][1]["recipients"][0]["VAR1"] == "NP-TEST"
    assert calls[1][1]["payload"]["template"]["to_and_components"][0]["components"]["body_1"]["value"] == "NP-TEST"
    assert all(call[2]["authkey"] == settings.MSG91_AUTH_KEY for call in calls)
    assert SMTPEmailProvider().send_template("customer@example.com", "BOOKING_CONFIRMED", "NP-TEST") == "SMTP_ACCEPTED"
    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_order_reconciliation_flags_mismatch_without_changing_booking(setup_booking, monkeypatch):
    from domains.payments import tasks as payment_tasks
    from domains.payments.models import PaymentIntent, ReconciliationException

    s = setup_booking
    held = hold(s["client"], s["package"], s["address"], s["slot"]).json()
    quote = s["client"].post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    response = s["client"].post("/api/v1/bookings/", {"hold_id": held["id"], "quote_id": quote["id"],
        "accepted_total_paise": 49000, "terms_accepted": True}, format="json", HTTP_IDEMPOTENCY_KEY="reconcile-test")
    booking = Booking.objects.get(id=response.json()["id"])
    order = PaymentIntent.objects.create(booking=booking, customer=s["user"], amount_paise=49000,
                                         status="CREATED", provider_order_id="order_reconcile",
                                         idempotency_key="reconcile")

    class Provider:
        def fetch_order(self, order_id):
            return {"id": order_id, "amount": 50000, "currency": "INR", "status": "paid"}

    monkeypatch.setattr(payment_tasks, "get_provider", lambda: Provider())
    assert payment_tasks.reconcile_recent_orders() == 1
    assert payment_tasks.reconcile_recent_orders() == 0
    assert ReconciliationException.objects.get(booking=booking).exception_type == "ORDER_AMOUNT_OR_CURRENCY_MISMATCH"
    order.refresh_from_db()
    assert order.last_reconciled_at is not None
    booking.refresh_from_db()
    assert booking.status == "CONFIRMED_UNPAID"


@pytest.mark.django_db
def test_customer_payment_history_is_owner_scoped(setup_booking):
    from domains.payments.models import Payment, PaymentIntent

    s = setup_booking
    held = hold(s["client"], s["package"], s["address"], s["slot"]).json()
    quote = s["client"].post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    response = s["client"].post("/api/v1/bookings/", {"hold_id": held["id"], "quote_id": quote["id"],
        "accepted_total_paise": 49000, "terms_accepted": True}, format="json", HTTP_IDEMPOTENCY_KEY="history-test")
    booking = Booking.objects.get(id=response.json()["id"])
    order = PaymentIntent.objects.create(booking=booking, customer=s["user"], amount_paise=49000,
                                         status="PAID", provider_order_id="order_history",
                                         idempotency_key="history")
    Payment.objects.create(booking=booking, payment_order=order, provider_payment_id="pay_history",
                           amount_paise=49000, status="CAPTURED", verified_at=timezone.now())
    own = s["client"].get("/api/v1/customers/payments/")
    assert own.status_code == 200 and own.json()["count"] == 1
    other_client = APIClient()
    other_client.force_authenticate(user=s["other"])
    assert other_client.get("/api/v1/customers/payments/").json()["count"] == 0


@pytest.mark.django_db
def test_prepaid_deadline_closes_before_slot_lead_time(setup_booking, settings):
    s = setup_booking
    settings.RAZORPAY_ENABLED = True
    settings.PAYMENT_CHECKOUT_MINUTES = 30
    s["rule"].payment_policy = "PREPAID"
    s["rule"].save()
    s["slot"].start_at = timezone.now() + timedelta(minutes=12)
    s["slot"].end_at = s["slot"].start_at + timedelta(hours=1)
    s["slot"].minimum_lead_minutes = 5
    s["slot"].save()
    held = hold(s["client"], s["package"], s["address"], s["slot"]).json()
    quote = s["client"].post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    response = s["client"].post("/api/v1/bookings/", {"hold_id": held["id"], "quote_id": quote["id"],
        "accepted_total_paise": 49000, "terms_accepted": True}, format="json", HTTP_IDEMPOTENCY_KEY="deadline-test")
    assert response.status_code == 201
    booking = Booking.objects.get(id=response.json()["id"])
    assert booking.payment_expires_at == s["slot"].start_at - timedelta(minutes=5)


@pytest.fixture
def setup_booking(db):
    user = get_user_model().objects.create_user(username="customer-a", phone_e164="+919876543210")
    other = get_user_model().objects.create_user(username="customer-b", phone_e164="+919876543211")
    category = Category.objects.create(slug="appliances", name="Appliances")
    service = Service.objects.create(category=category, slug="ac-repair", name="AC Repair", summary="AC diagnosis")
    package = ServicePackage.objects.create(service=service, name="Inspection", pricing_model="INSPECTION_BASED",
                                            duration_minutes=60, skill_code="AC", inclusions=["Diagnosis"],
                                            exclusions=["Parts"], is_active=True)
    city = City.objects.create(name="Chennai", slug="chennai", is_active=True)
    zone = Zone.objects.create(city=city, name="Pilot zone", postal_code="600004", is_active=True)
    ServiceCoverage.objects.create(zone=zone, service=service, is_active=True)
    address = Address.objects.create(user=user, line_1="12 North Street", house_flat="12", street="North Street",
                                     locality="Mylapore", city="Chennai", state="Tamil Nadu", postal_code="600004")
    other_address = Address.objects.create(user=other, line_1="13 North Street", house_flat="13", street="North Street",
                                           locality="Mylapore", city="Chennai", state="Tamil Nadu", postal_code="600004")
    rule = PricingRule.objects.create(package=package, zone=zone, inspection_paise=49000,
                                      payment_policy="PAY_AT_VISIT", is_active=True,
                                      cancellation_cutoff_minutes=60, reschedule_cutoff_minutes=60)
    start = timezone.now() + timedelta(days=2)
    slot = AppointmentSlot.objects.create(zone=zone, package=package, start_at=start,
                                          end_at=start + timedelta(hours=1), capacity=1, is_active=True)
    second = AppointmentSlot.objects.create(zone=zone, package=package, start_at=start + timedelta(hours=2),
                                            end_at=start + timedelta(hours=3), capacity=1, is_active=True)
    client = APIClient()
    client.force_authenticate(user=user)
    return locals()


def hold(client, package, address, slot):
    return client.post("/api/v1/checkout/holds/", {"package_id": str(package.id), "address_id": str(address.id),
                                                   "slot_id": str(slot.id)}, format="json")


@pytest.mark.django_db
def test_serviceability_availability_and_capacity(setup_booking):
    s = setup_booking
    client = s["client"]
    body = {"package_id": str(s["package"].id), "address_id": str(s["address"].id)}
    assert client.post("/api/v1/serviceability/check/", body, format="json").json()["supported"] is True
    start = timezone.now().isoformat()
    end = (timezone.now() + timedelta(days=5)).isoformat()
    slots = client.get("/api/v1/availability/slots/", {**body, "start": start, "end": end}).json()["slots"]
    assert len(slots) == 2
    first = hold(client, s["package"], s["address"], s["slot"])
    assert first.status_code == 201
    assert hold(client, s["package"], s["address"], s["slot"]).status_code == 409
    assert len(client.get("/api/v1/availability/slots/", {**body, "start": start, "end": end}).json()["slots"]) == 1
    s["slot"].is_blackout = True
    s["slot"].save()
    assert hold(client, s["package"], s["address"], s["slot"]).status_code == 409


@pytest.mark.django_db
def test_unserviceable_and_owner_boundaries(setup_booking):
    s = setup_booking
    s["address"].postal_code = "999999"
    s["address"].save()
    assert s["client"].post("/api/v1/serviceability/check/", {"package_id": str(s["package"].id),
                                                                "address_id": str(s["address"].id)}, format="json").json()["supported"] is False
    assert hold(s["client"], s["package"], s["address"], s["slot"]).status_code == 400
    assert s["client"].get(f"/api/v1/customers/addresses/{s['other_address'].id}/").status_code == 405
    assert s["client"].patch(f"/api/v1/customers/addresses/{s['other_address'].id}/", {}, format="json").status_code == 404


@pytest.mark.django_db
def test_quote_confirmation_idempotency_cancel_and_reschedule(setup_booking):
    s = setup_booking
    client = s["client"]
    held = hold(client, s["package"], s["address"], s["slot"]).json()
    quote = client.post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    assert quote["total_paise"] == 49000
    body = {"hold_id": held["id"], "quote_id": quote["id"], "accepted_total_paise": 49000, "terms_accepted": True}
    first = client.post("/api/v1/bookings/", body, format="json", HTTP_IDEMPOTENCY_KEY="same-request")
    assert first.status_code == 201, first.content
    assert first.json()["status"] == "CONFIRMED_UNPAID"
    assert client.post("/api/v1/bookings/", body, format="json", HTTP_IDEMPOTENCY_KEY="same-request").status_code == 200
    assert client.post("/api/v1/bookings/", {**body, "accepted_total_paise": 1}, format="json",
                       HTTP_IDEMPOTENCY_KEY="same-request").status_code == 409
    assert Booking.objects.count() == 1
    assert SlotHold.objects.get(id=held["id"]).status == "CONSUMED"
    second_hold = hold(client, s["package"], s["address"], s["second"]).json()
    booking_id = first.json()["id"]
    changed = client.post(f"/api/v1/bookings/{booking_id}/reschedule/",
                          {"new_hold_id": second_hold["id"], "expected_version": 1}, format="json")
    assert changed.status_code == 200, changed.content
    assert changed.json()["version"] == 2
    cancelled = client.post(f"/api/v1/bookings/{booking_id}/cancel/", {"expected_version": 2}, format="json")
    assert cancelled.status_code == 200, cancelled.content
    assert cancelled.json()["status"] == "CANCELLED"
    assert client.get("/api/v1/bookings/").json()["count"] == 1


@pytest.mark.django_db
def test_expired_hold_price_change_prepaid_block_and_cross_customer(setup_booking):
    s = setup_booking
    client = s["client"]
    held = hold(client, s["package"], s["address"], s["slot"]).json()
    quote = client.post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    body = {"hold_id": held["id"], "quote_id": quote["id"], "accepted_total_paise": 49000, "terms_accepted": True}
    s["rule"].inspection_paise = 50000
    s["rule"].version = 2
    s["rule"].save()
    assert client.post("/api/v1/bookings/", body, format="json", HTTP_IDEMPOTENCY_KEY="price-change").status_code == 409
    s["rule"].inspection_paise = 49000
    s["rule"].version = 1
    s["rule"].payment_policy = "PREPAID"
    s["rule"].save()
    assert client.post("/api/v1/bookings/", body, format="json", HTTP_IDEMPOTENCY_KEY="prepaid").status_code == 409
    other_client = APIClient()
    other_client.force_authenticate(user=s["other"])
    assert other_client.delete(f"/api/v1/checkout/holds/{held['id']}/").status_code == 400
    hold_record = SlotHold.objects.get(id=held["id"])
    hold_record.expires_at = timezone.now() - timedelta(seconds=1)
    hold_record.save()
    assert client.post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").status_code == 410
    assert Booking.objects.count() == 0


@pytest.mark.django_db
def test_otp_expiry_invalid_attempts_and_session(setup_booking):
    client = APIClient()
    request = client.post("/api/v1/auth/otp/request/", {"phone_e164": "+919999999999"}, format="json")
    assert request.status_code == 200
    payload = request.json()
    for _ in range(5):
        assert client.post("/api/v1/auth/otp/verify/", {"phone_e164": "+919999999999",
                    "challenge_id": payload["challenge_id"], "code": "000000"}, format="json").status_code == 400
    assert client.post("/api/v1/auth/otp/verify/", {"phone_e164": "+919999999999",
                    "challenge_id": payload["challenge_id"], "code": payload["development_code"]}, format="json").status_code == 429
    assert client.post("/api/v1/auth/otp/request/", {"phone_e164": "+919999999999"}, format="json").status_code == 429
    request2 = client.post("/api/v1/auth/otp/request/", {"phone_e164": "+918888888888"}, format="json").json()
    assert client.post("/api/v1/auth/otp/verify/", {"phone_e164": "+918888888888",
                    "challenge_id": request2["challenge_id"], "code": request2["development_code"]}, format="json").status_code == 200
    assert client.get("/api/v1/auth/me/").status_code == 200
    assert client.post("/api/v1/auth/logout/").status_code == 200
    assert client.get("/api/v1/auth/me/").status_code in (401, 403)


@pytest.mark.django_db
def test_address_management_and_expiry_cleanup(setup_booking):
    s = setup_booking
    client = s["client"]
    created = client.post("/api/v1/customers/addresses/", {
        "label": "Work", "contact_name": "Customer", "house_flat": "14", "street": "North Street",
        "locality": "Mylapore", "city": "Chennai", "state": "Tamil Nadu", "postal_code": "600004",
        "is_default": True,
    }, format="json")
    assert created.status_code == 201, created.content
    assert created.json()["line_1"] == "14, North Street"
    assert client.patch(f"/api/v1/customers/addresses/{created.json()['id']}/", {
        "label": "Office", "is_default": True,
    }, format="json").json()["label"] == "Office"
    assert client.delete(f"/api/v1/customers/addresses/{created.json()['id']}/").status_code == 204
    assert all(item["id"] != created.json()["id"] for item in client.get("/api/v1/customers/addresses/").json()["addresses"])
    held = hold(client, s["package"], s["address"], s["slot"]).json()
    SlotHold.objects.filter(id=held["id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert cleanup_expired_holds() == 1
    assert SlotHold.objects.get(id=held["id"]).status == "EXPIRED"


@pytest.mark.django_db
def test_snapshot_outbox_and_cross_customer_booking_access(setup_booking):
    s = setup_booking
    client = s["client"]
    held = hold(client, s["package"], s["address"], s["slot"]).json()
    quote = client.post("/api/v1/checkout/quote/", {"hold_id": held["id"]}, format="json").json()
    result = client.post("/api/v1/bookings/", {
        "hold_id": held["id"], "quote_id": quote["id"], "accepted_total_paise": 49000,
        "terms_accepted": True,
    }, format="json", HTTP_IDEMPOTENCY_KEY="snapshot-test")
    assert result.status_code == 201
    booking = Booking.objects.get(id=result.json()["id"])
    snapshot = booking.price_snapshot
    snapshot.total_paise = 1
    with pytest.raises(ValidationError):
        snapshot.save()
    assert process_booking_outbox() == 1
    assert process_booking_outbox() == 0
    assert OutboxEvent.objects.count() == Notification.objects.count() == 1
    other_client = APIClient()
    other_client.force_authenticate(user=s["other"])
    assert other_client.get(f"/api/v1/bookings/{booking.id}/").status_code == 404
    assert other_client.get("/api/v1/bookings/").json()["count"] == 0


@pytest.mark.django_db
def test_invalid_ids_and_otp_csrf_are_rejected_safely(setup_booking):
    s = setup_booking
    response = s["client"].post("/api/v1/serviceability/check/", {
        "package_id": "not-a-uuid", "address_id": str(s["address"].id),
    }, format="json")
    assert response.status_code == 400
    response = APIClient().post("/api/v1/auth/otp/verify/", {
        "phone_e164": "+919999999999", "challenge_id": "not-a-uuid", "code": "123456",
    }, format="json")
    assert response.status_code == 400
    strict = APIClient(enforce_csrf_checks=True)
    assert strict.post("/api/v1/auth/otp/request/", {"phone_e164": "+919999999999"}, format="json").status_code == 403
    token_response = strict.get("/api/v1/auth/csrf/")
    token = token_response.json()["csrf_token"]
    assert strict.post("/api/v1/auth/otp/request/", {"phone_e164": "+919999999999"},
                       format="json", HTTP_X_CSRFTOKEN=token).status_code == 200


def test_booking_state_matrix_rejects_unsupported_transition():
    require_transition("DRAFT", "CONFIRMED_UNPAID")
    require_transition("CONFIRMED_UNPAID", "CANCELLED")
    with pytest.raises(StateConflict):
        require_transition("CANCELLED", "CONFIRMED_UNPAID")
