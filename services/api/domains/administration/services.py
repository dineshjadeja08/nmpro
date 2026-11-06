from datetime import timedelta

from django.db import IntegrityError, models, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from domains.payments.models import Payment, Refund
from domains.technicians.models import TechnicianEarning

from .models import (AdminAuditLog, CommissionRule, FinancialAdjustment, LedgerAccount, LedgerEntry,
                     LedgerTransaction, Payout, Settlement, SettlementItem)
from .rbac import require


class FinanceConflict(APIException):
    status_code = 409
    default_detail = "Financial state changed. Refresh and try again."
    default_code = "FINANCE_CONFLICT"


def audit(actor, action, resource, instance_id, summary=None, request_id=""):
    AdminAuditLog.objects.create(actor=actor, action=action, resource_type=resource,
        resource_id=str(instance_id), summary=summary or {}, request_id=request_id[:80])


@transaction.atomic
def post_ledger(category, source_type, source_id, reference, lines, idempotency_key, reversal_of=None):
    existing = LedgerTransaction.objects.select_for_update().filter(idempotency_key=idempotency_key).first()
    if existing:
        if existing.source_type != source_type or existing.source_id != source_id or existing.category != category:
            raise FinanceConflict("Ledger idempotency key was reused for a different source.")
        return existing
    if not lines or len({line["currency"] for line in lines}) != 1:
        raise ValidationError("Ledger lines need one currency.")
    currency = lines[0]["currency"]
    if currency != "INR" or any(line["debit_paise"] < 0 or line["credit_paise"] < 0 for line in lines):
        raise ValidationError("Ledger amounts must use nonnegative INR minor units.")
    if sum(line["debit_paise"] for line in lines) != sum(line["credit_paise"] for line in lines):
        raise ValidationError("Ledger debits and credits must balance.")
    if sum(line["debit_paise"] for line in lines) <= 0:
        raise ValidationError("Ledger transaction amount must be positive.")
    accounts = {a.id: a for a in LedgerAccount.objects.filter(id__in=[line["account_id"] for line in lines],
        currency=currency, is_active=True)}
    if len(accounts) != len(set(line["account_id"] for line in lines)):
        raise ValidationError("Use active ledger accounts in the transaction currency.")
    for line in lines:
        if (line["debit_paise"] > 0) == (line["credit_paise"] > 0):
            raise ValidationError("Each ledger line must have exactly one side.")
    posted = LedgerTransaction.objects.create(reference=reference, category=category,
        source_type=source_type, source_id=source_id, currency=currency,
        idempotency_key=idempotency_key, reversal_of=reversal_of)
    LedgerEntry.objects.bulk_create([LedgerEntry(transaction=posted, account_id=line["account_id"],
        debit_paise=line["debit_paise"], credit_paise=line["credit_paise"], currency=currency) for line in lines])
    posted.status = "POSTED"
    posted.posted_at = timezone.now()
    posted.save(update_fields=["status", "posted_at", "updated_at"])
    return posted


def reconcile_payment_ledger(limit=100):
    cash = LedgerAccount.objects.filter(code="CASH", kind="ASSET", currency="INR", is_active=True).first()
    advances = LedgerAccount.objects.filter(code="CUSTOMER_ADVANCES", kind="LIABILITY", currency="INR", is_active=True).first()
    if not cash or not advances:
        return 0
    count = 0
    posted_payments = LedgerTransaction.objects.filter(category="CUSTOMER_PAYMENT", source_type="Payment").values("source_id")
    for payment in Payment.objects.filter(status="CAPTURED", currency="INR").exclude(
            id__in=posted_payments).order_by("created_at")[:limit]:
        lines = [{"account_id": cash.id, "debit_paise": payment.amount_paise, "credit_paise": 0, "currency": "INR"},
                 {"account_id": advances.id, "debit_paise": 0, "credit_paise": payment.amount_paise, "currency": "INR"}]
        try:
            post_ledger("CUSTOMER_PAYMENT", "Payment", payment.id, f"PAY-{payment.id}", lines, f"payment:{payment.id}")
            count += 1
        except IntegrityError:
            continue
    posted_refunds = LedgerTransaction.objects.filter(category="CUSTOMER_REFUND", source_type="Refund").values("source_id")
    for refund in Refund.objects.filter(status="SUCCEEDED", payment__currency="INR").exclude(
            id__in=posted_refunds).order_by("created_at")[:limit]:
        lines = [{"account_id": advances.id, "debit_paise": refund.amount_paise, "credit_paise": 0, "currency": "INR"},
                 {"account_id": cash.id, "debit_paise": 0, "credit_paise": refund.amount_paise, "currency": "INR"}]
        try:
            post_ledger("CUSTOMER_REFUND", "Refund", refund.id, f"REF-{refund.id}", lines, f"refund:{refund.id}")
            count += 1
        except IntegrityError:
            continue
    return count


def choose_commission_rule(assignment):
    now = assignment.completed_at or timezone.now()
    rules = CommissionRule.objects.filter(is_active=True, approved_by__isnull=False,
        effective_from__lte=now).filter(
        models.Q(effective_until__isnull=True) | models.Q(effective_until__gt=now))
    package = assignment.booking.package
    for scope in (
        {"technician": assignment.technician, "package": package},
        {"technician": assignment.technician, "category": package.service.category, "package__isnull": True},
        {"technician__isnull": True, "package": package},
        {"technician__isnull": True, "package__isnull": True, "category": package.service.category},
    ):
        rule = rules.filter(**scope).order_by("-effective_from", "-created_at").first()
        if rule:
            return rule
    return None


@transaction.atomic
def generate_settlement(actor, technician, start, end):
    require(actor, "VIEW_FINANCE")
    if end < start or (end - start).days > 366:
        raise ValidationError("Choose a valid settlement period within one year.")
    existing = Settlement.objects.select_for_update().filter(technician=technician,
        period_start=start, period_end=end).first()
    if existing:
        return existing
    earnings = list(TechnicianEarning.objects.select_for_update().filter(technician=technician,
        status="APPROVED", assignment__completed_at__date__gte=start,
        assignment__completed_at__date__lte=end, settlementitem__isnull=True).exclude(
        assignment__booking__payments__refunds__status__in=["REQUESTED", "APPROVED", "PROCESSING", "SUCCEEDED"]).distinct())
    adjustments = list(FinancialAdjustment.objects.select_for_update().filter(technician=technician,
        status="APPROVED", settlementitem__isnull=True, created_at__date__gte=start,
        created_at__date__lte=end))
    gross = sum(row.amount_paise for row in earnings)
    delta = sum(row.amount_paise for row in adjustments)
    if gross + delta < 0:
        raise FinanceConflict("Adjustments exceed eligible earnings.")
    settlement = Settlement.objects.create(technician=technician, period_start=start, period_end=end,
        gross_paise=gross, adjustment_paise=delta, net_paise=gross + delta, created_by=actor)
    SettlementItem.objects.bulk_create([
        *[SettlementItem(settlement=settlement, earning=row, amount_paise=row.amount_paise) for row in earnings],
        *[SettlementItem(settlement=settlement, adjustment=row, amount_paise=row.amount_paise) for row in adjustments],
    ])
    audit(actor, "SETTLEMENT_GENERATED", "Settlement", settlement.id,
          {"items": len(earnings) + len(adjustments), "net_paise": settlement.net_paise})
    return settlement


@transaction.atomic
def approve_settlement(actor, settlement_id):
    require(actor, "APPROVE_SETTLEMENTS")
    settlement = Settlement.objects.select_for_update().filter(id=settlement_id).first()
    if not settlement:
        raise FinanceConflict("Settlement was not found.")
    if settlement.status != "UNDER_REVIEW" or settlement.created_by_id == actor.id:
        raise FinanceConflict("Settlement needs independent review before approval.")
    if settlement.net_paise <= 0 or settlement.net_paise != sum(i.amount_paise for i in settlement.items.all()):
        raise FinanceConflict("Settlement line items do not match the payable amount.")
    if settlement.items.filter(earning__status__in=["PENDING", "PAID"]).exists():
        raise FinanceConflict("Settlement contains ineligible earnings.")
    if settlement.items.filter(earning__assignment__booking__payments__refunds__status__in=[
            "REQUESTED", "APPROVED", "PROCESSING", "SUCCEEDED"]).exists():
        raise FinanceConflict("A booking refund now holds this settlement.")
    settlement.status = "APPROVED"
    settlement.approved_by = actor
    settlement.approved_at = timezone.now()
    settlement.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    audit(actor, "SETTLEMENT_APPROVED", "Settlement", settlement.id)
    return settlement


@transaction.atomic
def request_payout(actor, settlement_id, account_id, amount_paise, key):
    require(actor, "INITIATE_PAYOUTS")
    if not key or len(key) > 100 or amount_paise <= 0:
        raise ValidationError("Payout needs an amount and idempotency key.")
    existing = Payout.objects.select_for_update().filter(idempotency_key=key).first()
    if existing:
        if existing.settlement_id != settlement_id or existing.account_id != account_id or existing.amount_paise != amount_paise:
            raise FinanceConflict("Payout key was reused with different details.")
        return existing
    settlement = Settlement.objects.select_for_update().filter(id=settlement_id).first()
    if not settlement:
        raise FinanceConflict("Settlement was not found.")
    if settlement.status not in ("APPROVED", "PARTIALLY_PAID"):
        raise FinanceConflict("Settlement is not approved for payouts.")
    account = settlement.technician.payoutaccount_set.filter(id=account_id, is_active=True, is_verified=True).first()
    if not account:
        raise FinanceConflict("A provider-verified payout account is required.")
    reserved = settlement.payouts.exclude(status="FAILED").aggregate(total=Sum("amount_paise"))["total"] or 0
    if amount_paise > settlement.net_paise - reserved:
        raise FinanceConflict("Payout exceeds the remaining settlement amount.")
    payout = Payout.objects.create(settlement=settlement, account=account, amount_paise=amount_paise,
        idempotency_key=key, requested_by=actor)
    audit(actor, "PAYOUT_REQUESTED", "Payout", payout.id, {"amount_paise": amount_paise})
    return payout


@transaction.atomic
def approve_payout(actor, payout_id):
    require(actor, "INITIATE_PAYOUTS")
    payout = Payout.objects.select_for_update().filter(id=payout_id).first()
    if not payout:
        raise FinanceConflict("Payout was not found.")
    if payout.status != "REQUESTED" or payout.requested_by_id == actor.id:
        raise FinanceConflict("Payout needs independent approval.")
    payout.status = "BLOCKED_PROVIDER"
    payout.approved_by = actor
    payout.save(update_fields=["status", "approved_by", "updated_at"])
    audit(actor, "PAYOUT_APPROVED_PROVIDER_BLOCKED", "Payout", payout.id)
    return payout
