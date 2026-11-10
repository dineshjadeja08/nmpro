from django.db import models, transaction
from django.db.models import Sum
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.catalog.models import Category, ServicePackage
from domains.operations.views import paged
from domains.payments.models import Invoice, Payment, PaymentIntent, ReconciliationException, Refund
from domains.technicians.models import TechnicianEarning, TechnicianProfile

from .models import (CommissionRule, FinancialAdjustment, LedgerAccount, LedgerEntry, LedgerTransaction,
                     Payout, PayoutAccount, Settlement, SettlementItem)
from .rbac import require, require_recent_auth
from .services import (FinanceConflict, approve_payout, approve_settlement, audit, generate_settlement,
                       request_payout)
from .views_core import period, sum_value


def commission_data(r):
    return {"id": str(r.id), "name": r.name, "package_id": str(r.package_id) if r.package_id else None,
        "category_id": str(r.category_id) if r.category_id else None,
        "technician_id": str(r.technician_id) if r.technician_id else None,
        "kind": r.kind, "amount_paise": r.amount_paise, "basis_points": r.basis_points,
        "percentage_base": r.percentage_base, "effective_from": r.effective_from,
        "effective_until": r.effective_until, "is_active": r.is_active,
        "approved": r.approved_by_id is not None}


def settlement_data(s, detail=False):
    result = {"id": str(s.id), "technician_id": str(s.technician_id),
        "technician": s.technician.display_name, "period_start": s.period_start,
        "period_end": s.period_end, "status": s.status, "gross_paise": s.gross_paise,
        "adjustment_paise": s.adjustment_paise, "net_paise": s.net_paise,
        "approved_at": s.approved_at}
    if detail:
        result["items"] = [{"id": str(i.id), "earning_id": str(i.earning_id) if i.earning_id else None,
            "adjustment_id": str(i.adjustment_id) if i.adjustment_id else None,
            "amount_paise": i.amount_paise} for i in s.items.all()]
        result["payouts"] = [payout_data(p) for p in s.payouts.all()]
    return result


def payout_data(p):
    return {"id": str(p.id), "settlement_id": str(p.settlement_id), "amount_paise": p.amount_paise,
        "status": p.status, "account_label": p.account.masked_label,
        "provider_reference": p.provider_reference, "created_at": p.created_at}


class AdminFinanceOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        start, end = period(request)
        payments = Payment.objects.filter(status="CAPTURED", created_at__date__gte=start, created_at__date__lte=end)
        refunds = Refund.objects.filter(status="SUCCEEDED", created_at__date__gte=start, created_at__date__lte=end)
        collected = sum_value(payments)
        refunded = sum_value(refunds)
        revenue_entries = LedgerEntry.objects.filter(transaction__status="POSTED", account__kind="REVENUE",
            transaction__posted_at__date__gte=start, transaction__posted_at__date__lte=end)
        revenue = sum_value(revenue_entries, "credit_paise") - sum_value(revenue_entries, "debit_paise")
        fees = sum_value(LedgerEntry.objects.filter(transaction__status="POSTED", account__code="GATEWAY_FEE",
            transaction__posted_at__date__gte=start, transaction__posted_at__date__lte=end), "debit_paise")
        return Response({"start": start, "end": end, "collected_payments_paise": collected,
            "refunds_paise": refunded, "net_cash_movement_paise": collected - refunded,
            "recognized_revenue_paise": revenue, "gateway_fees_paise": fees,
            "approved_earnings_paise": sum_value(TechnicianEarning.objects.filter(status="APPROVED")),
            "payouts_completed_paise": sum_value(Payout.objects.filter(status="PAID")),
            "outstanding_technician_paise": max(0, sum_value(Settlement.objects.filter(status__in=[
                "APPROVED", "PROCESSING", "PARTIALLY_PAID"]), "net_paise") - sum_value(Payout.objects.filter(
                status="PAID", settlement__status__in=["APPROVED", "PROCESSING", "PARTIALLY_PAID"]))),
            "reconciliation_exceptions": ReconciliationException.objects.filter(status="OPEN").count(),
            "revenue_trend": list(payments.values("created_at__date").annotate(
                collected_paise=Sum("amount_paise")).order_by("created_at__date"))})


class AdminFinancePaymentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        qs = Payment.objects.select_related("booking", "booking__user", "booking__invoice", "payment_order").order_by("-created_at")
        if request.query_params.get("q"):
            q = request.query_params["q"][:100]
            qs = qs.filter(models.Q(booking__reference__icontains=q) | models.Q(provider_payment_id__icontains=q) | models.Q(booking__user__customer_code__icontains=q))
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        return paged(request, qs, lambda p: {"id": str(p.id), "booking_reference": p.booking.reference,
            "customer_code": getattr(p.booking.user, "customer_code", ""),
            "invoice_number": p.booking.invoice.invoice_number if hasattr(p.booking, "invoice") and p.booking.invoice else "",
            "provider_payment_id": p.provider_payment_id, "status": p.status,
            "amount_paise": p.amount_paise, "currency": p.currency, "verified_at": p.verified_at})


class AdminPaymentOrdersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        return paged(request, PaymentIntent.objects.select_related("booking", "booking__user").order_by("-created_at"),
            lambda o: {"id": str(o.id), "booking_reference": o.booking.reference,
                "customer_code": getattr(o.booking.user, "customer_code", ""),
                "provider_order_id": o.provider_order_id, "status": o.status,
                "amount_paise": o.amount_paise})


class AdminFinanceRefundsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        qs = Refund.objects.select_related("booking", "booking__user", "payment").order_by("-created_at")
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        return paged(request, qs, lambda r: {"id": str(r.id), "booking_reference": r.booking.reference,
            "customer_code": getattr(r.booking.user, "customer_code", ""),
            "payment_id": str(r.payment_id), "amount_paise": r.amount_paise,
            "status": r.status, "reason_code": r.reason_code,
            "provider_refund_id": r.provider_refund_id})


class AdminRefundRejectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, refund_id):
        require(request.user, "APPROVE_REFUNDS")
        require_recent_auth(request)
        reason = serializers.CharField(max_length=240).run_validation(request.data.get("reason"))
        with transaction.atomic():
            refund = get_object_or_404(Refund.objects.select_for_update(), id=refund_id)
            if refund.status != "REQUESTED" or refund.initiated_by_id == request.user.id:
                raise FinanceConflict("Refund cannot be rejected in its current state.")
            refund.status = "REJECTED"
            refund.save(update_fields=["status", "updated_at"])
            audit(request.user, "REFUND_REJECTED", "Refund", refund.id, {"reason": reason})
        return Response({"id": str(refund.id), "status": refund.status})


class AdminInvoiceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invoice_id):
        require(request.user, "VIEW_FINANCE")
        invoice = get_object_or_404(Invoice.objects.select_related("booking", "booking__user"), id=invoice_id)
        return Response({"id": str(invoice.id), "invoice_number": invoice.invoice_number,
            "booking_id": str(invoice.booking_id), "booking_reference": invoice.booking.reference,
            "customer_code": getattr(invoice.booking.user, "customer_code", ""),
            "issue_date": invoice.issue_date, "status": invoice.status,
            "subtotal_paise": invoice.subtotal_paise, "tax_paise": invoice.tax_paise,
            "total_paise": invoice.total_paise, "download_available": bool(invoice.document)})


class AdminInvoiceDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, invoice_id):
        require(request.user, "VIEW_FINANCE")
        invoice = get_object_or_404(Invoice, id=invoice_id, status="ISSUED")
        if not invoice.document:
            raise serializers.ValidationError("Invoice document is unavailable.")
        return FileResponse(invoice.document.open("rb"), content_type="application/pdf",
                            as_attachment=True, filename=f"{invoice.invoice_number}.pdf")


class CommissionInput(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    package_id = serializers.UUIDField(required=False)
    category_id = serializers.UUIDField(required=False)
    technician_id = serializers.UUIDField(required=False)
    kind = serializers.ChoiceField(choices=["FIXED", "PERCENTAGE"])
    amount_paise = serializers.IntegerField(min_value=0, required=False, default=0)
    basis_points = serializers.IntegerField(min_value=0, max_value=10000, required=False, default=0)
    percentage_base = serializers.ChoiceField(choices=["CAPTURED_GROSS", "BOOKING_SUBTOTAL"], required=False, allow_blank=True, default="")
    effective_from = serializers.DateTimeField()
    effective_until = serializers.DateTimeField(required=False, allow_null=True)

    def validate(self, v):
        if not v.get("package_id") and not v.get("category_id"):
            raise serializers.ValidationError("Choose a package or category.")
        if v.get("package_id") and v.get("category_id"):
            raise serializers.ValidationError("Choose only one package or category.")
        if v["kind"] == "FIXED" and (v["amount_paise"] <= 0 or v["basis_points"]):
            raise serializers.ValidationError("Fixed rules need a positive amount and no percentage.")
        if v["kind"] == "PERCENTAGE" and (not 1 <= v["basis_points"] <= 10000 or v["amount_paise"] or not v["percentage_base"]):
            raise serializers.ValidationError("Percentage rules need basis points and an explicit base.")
        if v.get("effective_until") and v["effective_until"] <= v["effective_from"]:
            raise serializers.ValidationError("Rule end must follow its start.")
        return v


class AdminCommissionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        return paged(request, CommissionRule.objects.order_by("-created_at"), commission_data)

    def post(self, request):
        require(request.user, "APPROVE_SETTLEMENTS")
        data = CommissionInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        rule = CommissionRule.objects.create(name=v["name"],
            package=get_object_or_404(ServicePackage, id=v["package_id"]) if v.get("package_id") else None,
            category=get_object_or_404(Category, id=v["category_id"]) if v.get("category_id") else None,
            technician=get_object_or_404(TechnicianProfile, id=v["technician_id"]) if v.get("technician_id") else None,
            kind=v["kind"], amount_paise=v["amount_paise"], basis_points=v["basis_points"],
            percentage_base=v["percentage_base"], effective_from=v["effective_from"],
            effective_until=v.get("effective_until"), is_active=False, created_by=request.user)
        audit(request.user, "COMMISSION_RULE_DRAFTED", "CommissionRule", rule.id)
        return Response(commission_data(rule), status=201)


class AdminCommissionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, rule_id):
        require(request.user, "APPROVE_SETTLEMENTS")
        require_recent_auth(request)
        action = serializers.ChoiceField(choices=["approve", "deactivate"]).run_validation(request.data.get("action"))
        with transaction.atomic():
            rule = get_object_or_404(CommissionRule.objects.select_for_update(), id=rule_id)
            if action == "approve":
                if rule.is_active or rule.approved_by_id:
                    raise FinanceConflict("Rule is already approved.")
                if rule.created_by_id == request.user.id:
                    raise FinanceConflict("An independent finance reviewer must approve this rule.")
                scope = CommissionRule.objects.select_for_update().filter(is_active=True,
                    package_id=rule.package_id, category_id=rule.category_id, technician_id=rule.technician_id)
                scope.update(is_active=False)
                rule.is_active = True
                rule.approved_by = request.user
            else:
                rule.is_active = False
            rule.save(update_fields=["is_active", "approved_by", "updated_at"])
            audit(request.user, "COMMISSION_RULE_APPROVED" if action == "approve" else "COMMISSION_RULE_DEACTIVATED",
                  "CommissionRule", rule.id)
        return Response(commission_data(rule))


class AdminEarningsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        qs = TechnicianEarning.objects.select_related("technician", "assignment__booking").order_by("-created_at")
        return paged(request, qs, lambda e: {"id": str(e.id), "technician": e.technician.display_name,
            "booking_reference": e.assignment.booking.reference, "amount_paise": e.amount_paise,
            "status": e.status, "calculation_snapshot": e.calculation_snapshot})


class AdminEarningApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, earning_id):
        require(request.user, "APPROVE_SETTLEMENTS")
        require_recent_auth(request)
        with transaction.atomic():
            earning = get_object_or_404(TechnicianEarning.objects.select_for_update().select_related("assignment__booking"), id=earning_id)
            if earning.status != "PENDING" or earning.assignment.booking.payments.filter(
                refunds__status__in=["REQUESTED", "APPROVED", "PROCESSING", "SUCCEEDED"]).exists():
                raise FinanceConflict("Earning is not eligible for approval.")
            earning.status = "APPROVED"
            earning.save(update_fields=["status", "updated_at"])
            audit(request.user, "TECHNICIAN_EARNING_APPROVED", "TechnicianEarning", earning.id)
        return Response({"id": str(earning.id), "status": earning.status})


class AdjustmentInput(serializers.Serializer):
    technician_id = serializers.UUIDField()
    amount_paise = serializers.IntegerField()
    reason = serializers.CharField(max_length=240)


class AdminAdjustmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        return paged(request, FinancialAdjustment.objects.select_related("technician").order_by("-created_at"),
            lambda a: {"id": str(a.id), "technician": a.technician.display_name,
                "amount_paise": a.amount_paise, "reason": a.reason, "status": a.status})

    def post(self, request):
        require(request.user, "APPROVE_SETTLEMENTS")
        data = AdjustmentInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if v["amount_paise"] == 0:
            raise serializers.ValidationError("Adjustment cannot be zero.")
        adjustment = FinancialAdjustment.objects.create(technician=get_object_or_404(TechnicianProfile,
            id=v["technician_id"]), amount_paise=v["amount_paise"], reason=v["reason"], requested_by=request.user)
        audit(request.user, "ADJUSTMENT_REQUESTED", "FinancialAdjustment", adjustment.id)
        return Response({"id": str(adjustment.id), "status": adjustment.status}, status=201)


class AdminAdjustmentApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, adjustment_id):
        require(request.user, "APPROVE_SETTLEMENTS")
        require_recent_auth(request)
        with transaction.atomic():
            adjustment = get_object_or_404(FinancialAdjustment.objects.select_for_update(), id=adjustment_id)
            if adjustment.status != "REQUESTED" or adjustment.requested_by_id == request.user.id:
                raise FinanceConflict("Adjustment requires independent approval.")
            adjustment.status = "APPROVED"
            adjustment.approved_by = request.user
            adjustment.save(update_fields=["status", "approved_by", "updated_at"])
            audit(request.user, "ADJUSTMENT_APPROVED", "FinancialAdjustment", adjustment.id)
        return Response({"id": str(adjustment.id), "status": adjustment.status})


class AdminSettlementsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        return paged(request, Settlement.objects.select_related("technician").order_by("-created_at"), settlement_data)


class AdminSettlementGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        require(request.user, "APPROVE_SETTLEMENTS")
        technician_id = serializers.UUIDField().run_validation(request.data.get("technician_id"))
        start = serializers.DateField().run_validation(request.data.get("period_start"))
        end = serializers.DateField().run_validation(request.data.get("period_end"))
        settlement = generate_settlement(request.user, get_object_or_404(TechnicianProfile, id=technician_id), start, end)
        return Response(settlement_data(settlement))


class AdminSettlementView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, settlement_id):
        require(request.user, "VIEW_FINANCE")
        settlement = get_object_or_404(Settlement.objects.select_related("technician").prefetch_related(
            "items", "payouts__account"), id=settlement_id)
        return Response(settlement_data(settlement, detail=True))


class AdminSettlementActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, settlement_id, action):
        require(request.user, "APPROVE_SETTLEMENTS")
        if action == "approve":
            require_recent_auth(request)
            return Response(settlement_data(approve_settlement(request.user, settlement_id)))
        if action == "submit":
            with transaction.atomic():
                settlement = get_object_or_404(Settlement.objects.select_for_update().select_related("technician"), id=settlement_id)
                if settlement.status != "DRAFT":
                    raise FinanceConflict("Settlement is not a draft.")
                settlement.status = "UNDER_REVIEW"
                settlement.save(update_fields=["status", "updated_at"])
                audit(request.user, "SETTLEMENT_SUBMITTED", "Settlement", settlement.id)
            return Response(settlement_data(settlement))
        raise serializers.ValidationError("Unknown settlement action.")


class PayoutInput(serializers.Serializer):
    settlement_id = serializers.UUIDField()
    account_id = serializers.UUIDField()
    amount_paise = serializers.IntegerField(min_value=1)


class AdminPayoutsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        return paged(request, Payout.objects.select_related("account").order_by("-created_at"), payout_data)

    def post(self, request):
        require_recent_auth(request)
        data = PayoutInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        payout = request_payout(request.user, v["settlement_id"], v["account_id"],
            v["amount_paise"], request.headers.get("Idempotency-Key", ""))
        return Response(payout_data(payout), status=201)


class AdminPayoutView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, payout_id):
        require(request.user, "VIEW_FINANCE")
        return Response(payout_data(get_object_or_404(Payout.objects.select_related("account"), id=payout_id)))

    def post(self, request, payout_id):
        require_recent_auth(request)
        return Response(payout_data(approve_payout(request.user, payout_id)))


class PayoutAccountInput(serializers.Serializer):
    technician_id = serializers.UUIDField()
    provider = serializers.CharField(max_length=40)
    provider_account_ref = serializers.CharField(max_length=160)
    masked_label = serializers.CharField(max_length=80)


class AdminPayoutAccountsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        return paged(request, PayoutAccount.objects.select_related("technician").order_by("-created_at"),
            lambda a: {"id": str(a.id), "technician": a.technician.display_name,
                "masked_label": a.masked_label, "provider": a.provider,
                "is_verified": a.is_verified, "is_active": a.is_active})

    def post(self, request):
        require(request.user, "INITIATE_PAYOUTS")
        data = PayoutAccountInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        account = PayoutAccount.objects.create(technician=get_object_or_404(TechnicianProfile,
            id=v["technician_id"]), provider=v["provider"], provider_account_ref=v["provider_account_ref"],
            masked_label=v["masked_label"], is_active=True, is_verified=False)
        audit(request.user, "PAYOUT_ACCOUNT_REFERENCE_ADDED", "PayoutAccount", account.id)
        return Response({"id": str(account.id), "masked_label": account.masked_label,
                         "is_verified": False}, status=201)


class AdminLedgerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        return paged(request, LedgerTransaction.objects.prefetch_related("entries__account").order_by("-posted_at"),
            lambda t: {"id": str(t.id), "reference": t.reference, "category": t.category,
                "source_type": t.source_type, "source_id": str(t.source_id), "status": t.status,
                "posted_at": t.posted_at, "currency": t.currency,
                "entries": [{"account": e.account.code, "debit_paise": e.debit_paise,
                             "credit_paise": e.credit_paise} for e in t.entries.all()]})


class AdminLedgerAccountsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_FINANCE")
        return Response({"accounts": [{"id": str(a.id), "code": a.code, "name": a.name,
            "kind": a.kind, "currency": a.currency, "is_active": a.is_active}
            for a in LedgerAccount.objects.order_by("code")]})

    def post(self, request):
        require(request.user, "MANAGE_STAFF")
        code = serializers.RegexField(r"^[A-Z][A-Z0-9_]{2,39}$").run_validation(request.data.get("code"))
        name = serializers.CharField(max_length=120).run_validation(request.data.get("name"))
        kind = serializers.ChoiceField(choices=["ASSET", "LIABILITY", "REVENUE", "EXPENSE", "EQUITY"]).run_validation(request.data.get("kind"))
        account = LedgerAccount.objects.create(code=code, name=name, kind=kind, currency="INR")
        audit(request.user, "LEDGER_ACCOUNT_CREATED", "LedgerAccount", account.id)
        return Response({"id": str(account.id), "code": account.code}, status=201)
