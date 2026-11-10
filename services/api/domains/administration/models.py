from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from common.models import UUIDStampedModel


ROLES = ("SUPER_ADMIN", "FINANCE_ADMIN", "FINANCE_VIEWER", "OPERATIONS_MANAGER",
         "DISPATCH_OPERATOR", "SUPPORT_AGENT", "CATALOG_MANAGER", "TECHNICIAN_VERIFIER")


class StaffRole(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="admin_roles")
    role = models.CharField(max_length=32, choices=[(r, r) for r in ROLES])
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="admin_roles_assigned")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "role"], name="unique_admin_staff_role")]


class RolePermission(UUIDStampedModel):
    role = models.CharField(max_length=32, choices=[(r, r) for r in ROLES])
    permission_code = models.CharField(max_length=60)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["role", "permission_code"], name="unique_admin_role_permission")]


class PlatformSetting(UUIDStampedModel):
    key = models.CharField(max_length=80, unique=True)
    value = models.JSONField(default=dict)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)


class AdminAuditLog(UUIDStampedModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    action = models.CharField(max_length=80)
    resource_type = models.CharField(max_length=80)
    resource_id = models.CharField(max_length=80)
    summary = models.JSONField(default=dict)
    request_id = models.CharField(max_length=80, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["-created_at", "action"])]


class StaffGroup(UUIDStampedModel):
    name = models.CharField(max_length=80, unique=True)
    description = models.CharField(max_length=240, blank=True, default="")
    permissions = models.JSONField(default=list)
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name="staff_groups")
    is_active = models.BooleanField(default=True)


class CommissionRule(UUIDStampedModel):
    name = models.CharField(max_length=100)
    package = models.ForeignKey("catalog.ServicePackage", on_delete=models.PROTECT, null=True, blank=True)
    category = models.ForeignKey("catalog.Category", on_delete=models.PROTECT, null=True, blank=True)
    technician = models.ForeignKey("technicians.TechnicianProfile", on_delete=models.PROTECT, null=True, blank=True)
    kind = models.CharField(max_length=16, choices=[("FIXED", "Fixed"), ("PERCENTAGE", "Percentage")])
    amount_paise = models.PositiveBigIntegerField(default=0)
    basis_points = models.PositiveSmallIntegerField(default=0)
    percentage_base = models.CharField(max_length=24, choices=[("CAPTURED_GROSS", "Captured gross"),
        ("BOOKING_SUBTOTAL", "Booking subtotal")], blank=True)
    effective_from = models.DateTimeField()
    effective_until = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=False)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="commission_rules_created")

    class Meta:
        indexes = [models.Index(fields=["is_active", "effective_from"])]


class FinancialAdjustment(UUIDStampedModel):
    technician = models.ForeignKey("technicians.TechnicianProfile", on_delete=models.PROTECT)
    amount_paise = models.BigIntegerField()
    reason = models.CharField(max_length=240)
    status = models.CharField(max_length=16, choices=[(s, s) for s in ("REQUESTED", "APPROVED", "REJECTED")], default="REQUESTED")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="finance_adjustments_requested")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="finance_adjustments_approved")

    class Meta:
        constraints = [models.CheckConstraint(condition=~models.Q(amount_paise=0), name="adjustment_nonzero")]


class LedgerAccount(UUIDStampedModel):
    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=16, choices=[(s, s) for s in ("ASSET", "LIABILITY", "REVENUE", "EXPENSE", "EQUITY")])
    currency = models.CharField(max_length=3, default="INR")
    is_active = models.BooleanField(default=True)


class LedgerTransaction(UUIDStampedModel):
    reference = models.CharField(max_length=80, unique=True)
    category = models.CharField(max_length=40)
    source_type = models.CharField(max_length=50)
    source_id = models.UUIDField()
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=12, choices=[("DRAFT", "Draft"), ("POSTED", "Posted")], default="DRAFT")
    posted_at = models.DateTimeField(null=True)
    idempotency_key = models.CharField(max_length=100, unique=True)
    reversal_of = models.OneToOneField("self", on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["category", "source_type", "source_id"],
                                               condition=models.Q(reversal_of__isnull=True), name="unique_ledger_source_category")]

    def save(self, *args, **kwargs):
        if self.pk and type(self).objects.filter(pk=self.pk, status="POSTED").exists():
            raise ValidationError("Posted ledger transactions are immutable; post a reversal.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.status == "POSTED":
            raise ValidationError("Posted ledger transactions cannot be deleted.")
        return super().delete(*args, **kwargs)


class LedgerEntry(UUIDStampedModel):
    transaction = models.ForeignKey(LedgerTransaction, on_delete=models.PROTECT, related_name="entries")
    account = models.ForeignKey(LedgerAccount, on_delete=models.PROTECT)
    debit_paise = models.PositiveBigIntegerField(default=0)
    credit_paise = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="INR")

    class Meta:
        constraints = [models.CheckConstraint(condition=(models.Q(debit_paise__gt=0, credit_paise=0) |
                       models.Q(credit_paise__gt=0, debit_paise=0)), name="ledger_entry_one_side")]

    def save(self, *args, **kwargs):
        if self.transaction.status == "POSTED":
            raise ValidationError("Posted ledger entries are immutable.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.transaction.status == "POSTED":
            raise ValidationError("Posted ledger entries cannot be deleted.")
        return super().delete(*args, **kwargs)


class Settlement(UUIDStampedModel):
    technician = models.ForeignKey("technicians.TechnicianProfile", on_delete=models.PROTECT)
    period_start = models.DateField()
    period_end = models.DateField()
    status = models.CharField(max_length=20, choices=[(s, s) for s in ("DRAFT", "UNDER_REVIEW", "APPROVED", "PROCESSING", "PARTIALLY_PAID", "PAID", "FAILED", "CANCELLED")], default="DRAFT")
    gross_paise = models.PositiveBigIntegerField(default=0)
    adjustment_paise = models.BigIntegerField(default=0)
    net_paise = models.PositiveBigIntegerField(default=0)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    approved_at = models.DateTimeField(null=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="settlements_created", null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["technician", "period_start", "period_end"], name="unique_tech_settlement_period"),
                       models.CheckConstraint(condition=models.Q(period_end__gte=models.F("period_start")), name="settlement_valid_period")]


class SettlementItem(UUIDStampedModel):
    settlement = models.ForeignKey(Settlement, on_delete=models.PROTECT, related_name="items")
    earning = models.OneToOneField("technicians.TechnicianEarning", on_delete=models.PROTECT, null=True, blank=True)
    adjustment = models.OneToOneField(FinancialAdjustment, on_delete=models.PROTECT, null=True, blank=True)
    amount_paise = models.BigIntegerField()

    class Meta:
        constraints = [models.CheckConstraint(condition=(models.Q(earning__isnull=False, adjustment__isnull=True) |
                       models.Q(earning__isnull=True, adjustment__isnull=False)), name="settlement_item_one_source")]


class PayoutAccount(UUIDStampedModel):
    technician = models.ForeignKey("technicians.TechnicianProfile", on_delete=models.PROTECT)
    provider = models.CharField(max_length=40)
    provider_account_ref = models.CharField(max_length=160)
    masked_label = models.CharField(max_length=80)
    is_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["technician", "provider_account_ref"], name="unique_tech_payout_account")]


class Payout(UUIDStampedModel):
    settlement = models.ForeignKey(Settlement, on_delete=models.PROTECT, related_name="payouts")
    account = models.ForeignKey(PayoutAccount, on_delete=models.PROTECT)
    amount_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=24, choices=[(s, s) for s in ("REQUESTED", "APPROVED", "BLOCKED_PROVIDER", "PROCESSING", "PAID", "FAILED")], default="REQUESTED")
    idempotency_key = models.CharField(max_length=100, unique=True)
    provider_reference = models.CharField(max_length=120, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payouts_requested", null=True)

    class Meta:
        indexes = [models.Index(fields=["settlement", "status"])]
