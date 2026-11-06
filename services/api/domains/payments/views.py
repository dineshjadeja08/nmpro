import json

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.bookings.models import Booking
from domains.bookings.services import Conflict

from .finance import approve_refund, reconcile_refund, request_refund, require_finance_role
from .models import Invoice, Payment, PaymentEvent, ReconciliationException, Refund
from .providers.razorpay import PaymentUnavailable
from .services import (
    create_payment_order,
    get_provider,
    process_payment_event,
    record_captured_payment,
    record_webhook_event,
)


def finance_page(request, queryset):
    page = serializers.IntegerField(min_value=1, max_value=10000).run_validation(
        request.query_params.get("page", 1))
    size = 50
    return page, queryset.count(), queryset[(page - 1) * size:page * size]


class PaymentOrderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        order = create_payment_order(request.user, booking_id, request.headers.get("Idempotency-Key", ""))
        return Response({"order_id": order.provider_order_id, "key_id": settings.RAZORPAY_KEY_ID,
                         "amount_paise": order.amount_paise, "currency": order.currency,
                         "expires_at": order.expires_at, "status": order.status}, status=201)


class VerifyInput(serializers.Serializer):
    razorpay_order_id = serializers.CharField(max_length=100)
    razorpay_payment_id = serializers.CharField(max_length=100)
    razorpay_signature = serializers.CharField(max_length=256)


class PaymentVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        data = VerifyInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        if not Booking.objects.filter(id=booking_id, user=request.user, payment_order__provider_order_id=values["razorpay_order_id"]).exists():
            raise Conflict("Payment order does not belong to this booking.")
        if not get_provider().verify_checkout(values["razorpay_order_id"], values["razorpay_payment_id"],
                                               values["razorpay_signature"]):
            raise Conflict("Payment signature is invalid.")
        booking = record_captured_payment(values["razorpay_order_id"], values["razorpay_payment_id"])
        return Response({"booking_id": str(booking.id), "status": booking.status,
                         "payment_status": booking.payment_status})


class RazorpayWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not settings.RAZORPAY_ENABLED:
            raise PaymentUnavailable()
        raw = request._request.body
        if len(raw) > 256_000:
            raise Conflict("Webhook payload is too large.")
        signature = request.headers.get("X-Razorpay-Signature", "")
        if not signature or not get_provider().verify_webhook(raw, signature):
            raise Conflict("Webhook signature is invalid.")
        try:
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError("Expected webhook object")
            event_type = payload["event"]
            entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
            if not isinstance(entity, dict):
                raise ValueError("Expected payment entity object")
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise Conflict("Malformed webhook payload.") from exc
        event = record_webhook_event(request.headers.get("X-Razorpay-Event-Id", ""), event_type,
                                     raw, entity.get("id", ""), entity.get("order_id", ""))
        try:
            process_payment_event(event)
        except (Conflict, PaymentUnavailable):
            return Response({"accepted": True, "processing_status": "RECEIVED"}, status=202)
        return Response({"accepted": True, "processing_status": "PROCESSED"})


class FinancePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_finance_role(request.user, "PAYMENT_VIEWER", "REFUND_APPROVER", "FINANCE_ADMIN")
        reference = request.query_params.get("booking_reference", "")[:32]
        payments = Payment.objects.select_related("booking").order_by("-created_at")
        if reference:
            payments = payments.filter(booking__reference=reference)
        page, count, payments = finance_page(request, payments)
        return Response({"count": count, "page": page,
                         "payments": [{"id": str(p.id), "booking_reference": p.booking.reference,
                                        "amount_paise": p.amount_paise, "currency": p.currency,
                                        "status": p.status, "provider_payment_id": p.provider_payment_id}
                                       for p in payments]})


class RefundInput(serializers.Serializer):
    payment_id = serializers.UUIDField()
    amount_paise = serializers.IntegerField(min_value=1)
    reason_code = serializers.CharField(max_length=40)


class FinanceRefundView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_finance_role(request.user, "PAYMENT_VIEWER", "REFUND_APPROVER", "FINANCE_ADMIN")
        page, count, refunds = finance_page(request, Refund.objects.select_related("booking").order_by("-created_at"))
        return Response({"count": count, "page": page,
                         "refunds": [{"id": str(r.id), "booking_reference": r.booking.reference,
                                       "amount_paise": r.amount_paise, "status": r.status,
                                       "provider_refund_id": r.provider_refund_id} for r in refunds]})

    def post(self, request):
        data = RefundInput(data=request.data)
        data.is_valid(raise_exception=True)
        refund = request_refund(request.user, **data.validated_data,
                                key=request.headers.get("Idempotency-Key", ""))
        return Response({"id": str(refund.id), "status": refund.status}, status=201)


class FinanceRefundApproveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, refund_id):
        from domains.administration.rbac import require_recent_auth
        require_recent_auth(request)
        refund = approve_refund(request.user, refund_id)
        return Response({"id": str(refund.id), "status": refund.status})


class FinanceRefundReconcileView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, refund_id):
        from domains.administration.rbac import require_recent_auth
        require_recent_auth(request)
        require_finance_role(request.user, "FINANCE_ADMIN")
        refund = reconcile_refund(refund_id)
        return Response({"id": str(refund.id), "status": refund.status})


class FinanceExceptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_finance_role(request.user, "PAYMENT_VIEWER", "REFUND_APPROVER", "FINANCE_ADMIN")
        page, count, exceptions = finance_page(request, ReconciliationException.objects.order_by("-created_at"))
        return Response({"count": count, "page": page,
                         "exceptions": [{"id": str(e.id), "type": e.exception_type,
                                          "severity": e.severity, "status": e.status,
                                          "booking_id": str(e.booking_id) if e.booking_id else None}
                                         for e in exceptions]})


class FinanceEventView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_finance_role(request.user, "PAYMENT_VIEWER", "REFUND_APPROVER", "FINANCE_ADMIN")
        page, count, events = finance_page(request, PaymentEvent.objects.order_by("-received_at"))
        return Response({"count": count, "page": page,
                         "events": [{"id": str(e.id), "type": e.event_type,
                                      "processing_status": e.processing_status,
                                      "received_at": e.received_at} for e in events]})


class FinanceInvoiceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_finance_role(request.user, "PAYMENT_VIEWER", "REFUND_APPROVER", "FINANCE_ADMIN")
        page, count, invoices = finance_page(request, Invoice.objects.select_related("booking").order_by("-created_at"))
        return Response({"count": count, "page": page,
                         "invoices": [{"id": str(i.id), "booking_reference": i.booking.reference,
                                        "invoice_number": i.invoice_number, "status": i.status,
                                        "total_paise": i.total_paise} for i in invoices]})


class InvoiceDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        invoice = Invoice.objects.filter(booking_id=booking_id, booking__user=request.user,
                                         status="ISSUED").first()
        if not invoice or not invoice.document:
            raise Http404()
        return FileResponse(invoice.document.open("rb"), content_type="application/pdf",
                            as_attachment=True, filename=f"{invoice.invoice_number}.pdf")


class CustomerPaymentHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        page = serializers.IntegerField(min_value=1, max_value=10000).run_validation(
            request.query_params.get("page", 1))
        size = 20
        payments = Payment.objects.filter(booking__user=request.user).select_related("booking").prefetch_related(
            "refunds").order_by("-created_at")
        count = payments.count()
        return Response({"count": count, "page": page,
                         "payments": [{"id": str(p.id), "booking_id": str(p.booking_id),
                                       "booking_reference": p.booking.reference, "amount_paise": p.amount_paise,
                                       "currency": p.currency, "status": p.status,
                                       "refunds": [{"id": str(r.id), "amount_paise": r.amount_paise,
                                                    "status": r.status} for r in p.refunds.all()]}
                                      for p in payments[(page - 1) * size:page * size]]})
