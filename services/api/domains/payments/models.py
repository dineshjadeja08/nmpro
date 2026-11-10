from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from common.models import UUIDStampedModel


class PaymentIntent(UUIDStampedModel):
    booking = models.OneToOneField("bookings.Booking", on_delete=models.PROTECT, related_name="payment_order")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    provider = models.CharField(max_length=20, default="RAZORPAY")
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=20, choices=[("CREATING", "Creating"), ("CREATED", "Created"),
                                                      ("PAID", "Paid"), ("FAILED", "Failed"),
                                                      ("EXPIRED", "Expired")], default="CREATING")
    provider_order_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    idempotency_key = models.CharField(max_length=128, default="")
    expires_at = models.DateTimeField(null=True)
    checkout_started_at = models.DateTimeField(null=True, blank=True)
    last_reconciled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["customer", "idempotency_key"],
                                               name="unique_payment_order_customer_key")]
        indexes = [models.Index(fields=["last_reconciled_at", "created_at"])]


class BalancePaymentIntent(UUIDStampedModel):
    booking = models.OneToOneField("bookings.Booking", on_delete=models.PROTECT, related_name="balance_payment_order")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    provider = models.CharField(max_length=20, default="RAZORPAY")
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=20, choices=[("CREATING", "Creating"), ("CREATED", "Created"),
                                                      ("PAID", "Paid"), ("FAILED", "Failed"),
                                                      ("EXPIRED", "Expired")], default="CREATING")
    provider_order_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    idempotency_key = models.CharField(max_length=128, default="")
    expires_at = models.DateTimeField(null=True)
    checkout_started_at = models.DateTimeField(null=True, blank=True)
    last_reconciled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["customer", "idempotency_key"],
                                               name="unique_balance_order_customer_key")]
        indexes = [models.Index(fields=["last_reconciled_at", "created_at"])]


class Payment(UUIDStampedModel):
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, related_name="payments")
    payment_order = models.ForeignKey(PaymentIntent, on_delete=models.PROTECT, related_name="payments", null=True, blank=True)
    balance_payment_order = models.ForeignKey(BalancePaymentIntent, on_delete=models.PROTECT, related_name="payments", null=True, blank=True)
    provider_payment_id = models.CharField(max_length=100, unique=True)
    amount_paise = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=20, choices=[("AUTHORIZED", "Authorized"), ("CAPTURED", "Captured"),
                                                      ("FAILED", "Failed")])
    payment_type = models.CharField(max_length=20, choices=[("INITIAL", "Initial / Advance"), ("BALANCE", "Balance")], default="INITIAL")
    payment_method = models.CharField(max_length=20, choices=[("ONLINE", "Online"), ("CASH", "Cash"), ("UPI", "Direct UPI")], default="ONLINE")
    verified_at = models.DateTimeField(null=True)


class PaymentEvent(UUIDStampedModel):
    provider = models.CharField(max_length=20, default="RAZORPAY")
    provider_event_id = models.CharField(max_length=100, unique=True)
    event_type = models.CharField(max_length=60)
    payload_hash = models.CharField(max_length=64)
    provider_payment_id = models.CharField(max_length=100, blank=True)
    provider_order_id = models.CharField(max_length=100, blank=True)
    processing_status = models.CharField(max_length=20, default="RECEIVED")
    attempt_count = models.PositiveSmallIntegerField(default=0)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True)

    class Meta:
        indexes = [models.Index(fields=["processing_status", "received_at"])]


class Refund(UUIDStampedModel):
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT)
    provider_refund_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    amount_paise = models.PositiveBigIntegerField()
    reason_code = models.CharField(max_length=40)
    status = models.CharField(max_length=20, choices=[("REQUESTED", "Requested"), ("APPROVED", "Approved"),
                                                      ("PROCESSING", "Processing"), ("SUCCEEDED", "Succeeded"),
                                                      ("FAILED", "Failed"), ("REJECTED", "Rejected")], default="REQUESTED")
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="refunds_requested")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True,
                                    related_name="refunds_approved")
    idempotency_key = models.CharField(max_length=128)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["initiated_by", "idempotency_key"],
                                               name="unique_refund_actor_key"),
                       models.CheckConstraint(condition=models.Q(amount_paise__gt=0), name="refund_positive_amount")]


class ReconciliationException(UUIDStampedModel):
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, null=True)
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, null=True)
    exception_type = models.CharField(max_length=60)
    severity = models.CharField(max_length=12, default="HIGH")
    status = models.CharField(max_length=20, default="OPEN")
    fingerprint = models.CharField(max_length=128, unique=True)
    resolution_notes = models.TextField(blank=True)


class Invoice(UUIDStampedModel):
    booking = models.OneToOneField("bookings.Booking", on_delete=models.PROTECT, related_name="invoice")
    invoice_number = models.CharField(max_length=40, unique=True)
    document = models.FileField(upload_to="private/invoices/")
    issue_date = models.DateField()
    seller_name = models.CharField(max_length=180)
    seller_address = models.TextField()
    tax_registration = models.CharField(max_length=40, blank=True)
    subtotal_paise = models.PositiveBigIntegerField()
    tax_paise = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=20, default="ISSUED")

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Issued invoices are immutable; use an approved adjustment workflow.")
        if not self.invoice_number:
            from common.sequences import next_invoice_number
            self.invoice_number = next_invoice_number(self.issue_date)
        return super().save(*args, **kwargs)


class FinanceGrant(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    role = models.CharField(max_length=24, choices=[("PAYMENT_VIEWER", "Payment viewer"),
                                                    ("REFUND_APPROVER", "Refund approver"),
                                                    ("FINANCE_ADMIN", "Finance administrator")])

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "role"], name="unique_finance_user_role")]
