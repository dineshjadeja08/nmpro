from django.conf import settings
from django.db import transaction
from django.db.models import Sum

from domains.audit.models import AuditLog
from domains.bookings.services import Conflict
from domains.notifications.models import OutboxEvent

from .models import FinanceGrant, Payment, Refund
from .providers.razorpay import PaymentUnavailable
from .services import get_provider


def require_finance_role(user, *roles):
    from domains.administration.rbac import roles_for

    admin_roles = roles_for(user)
    if "SUPER_ADMIN" in admin_roles or ("FINANCE_ADMIN" in admin_roles and any(
            role in roles for role in ("FINANCE_ADMIN", "REFUND_APPROVER", "PAYMENT_VIEWER"))) or (
            "FINANCE_VIEWER" in admin_roles and "PAYMENT_VIEWER" in roles):
        return
    if not user.is_authenticated or not FinanceGrant.objects.filter(user=user, role__in=roles).exists():
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Finance access is required.")


def request_refund(actor, payment_id, amount_paise, reason_code, key):
    require_finance_role(actor, "FINANCE_ADMIN")
    if not key or len(key) > 128 or amount_paise <= 0 or not reason_code:
        raise Conflict("A valid refund amount, reason and idempotency key are required.")
    with transaction.atomic():
        payment = Payment.objects.select_for_update().filter(id=payment_id, status="CAPTURED").first()
        if not payment:
            raise Conflict("Only a captured payment is refundable.")
        existing = Refund.objects.filter(initiated_by=actor, idempotency_key=key).first()
        if existing:
            if existing.payment_id != payment.id or existing.amount_paise != amount_paise or existing.reason_code != reason_code:
                raise Conflict("This idempotency key belongs to another refund request.")
            return existing
        allocated = Refund.objects.filter(payment=payment, status__in=["REQUESTED", "APPROVED", "PROCESSING", "SUCCEEDED"]).aggregate(
            total=Sum("amount_paise"))["total"] or 0
        if allocated + amount_paise > payment.amount_paise:
            raise Conflict("Refund requests exceed the captured payment.")
        refund = Refund.objects.create(payment=payment, booking_id=payment.booking_id,
                                       amount_paise=amount_paise, reason_code=reason_code,
                                       initiated_by=actor, idempotency_key=key)
        AuditLog.objects.create(actor=actor, action="REFUND_REQUESTED", resource_type="Refund",
                                resource_id=str(refund.id), metadata={"booking_id": str(payment.booking_id)})
        return refund


def approve_refund(actor, refund_id):
    require_finance_role(actor, "REFUND_APPROVER", "FINANCE_ADMIN")
    with transaction.atomic():
        refund = Refund.objects.select_for_update().select_related("payment").filter(id=refund_id).first()
        if not refund or refund.status != "REQUESTED":
            raise Conflict("Refund is no longer awaiting approval.")
        if refund.initiated_by_id == actor.id:
            raise Conflict("A different finance user must approve this refund.")
        if not settings.RAZORPAY_ENABLED:
            raise PaymentUnavailable("Refund approval needs an enabled, verified payment provider.")
        refund.status = "APPROVED"
        refund.approved_by = actor
        refund.save(update_fields=["status", "approved_by", "updated_at"])
        AuditLog.objects.create(actor=actor, action="REFUND_APPROVED", resource_type="Refund",
                                resource_id=str(refund.id))
    try:
        remote = get_provider().create_refund(refund.payment.provider_payment_id,
                                              refund.amount_paise, str(refund.id))
    except Exception as exc:
        # Approval is durable. A network timeout has an unknown provider outcome;
        # do not issue a second refund without manual reconciliation.
        raise PaymentUnavailable("Refund outcome requires finance review.") from exc
    if not isinstance(remote, dict) or not remote.get("id") or remote.get("payment_id") != refund.payment.provider_payment_id:
        raise PaymentUnavailable("Refund response requires finance review.")
    with transaction.atomic():
        refund = Refund.objects.select_for_update().get(id=refund.id)
        refund.provider_refund_id = remote["id"]
        refund.status = "PROCESSING"
        refund.save(update_fields=["provider_refund_id", "status", "updated_at"])
        OutboxEvent.objects.create(event_type="REFUND_INITIATED", aggregate_id=refund.booking_id,
                                   payload={"booking_id": str(refund.booking_id)})
    return refund


def reconcile_refund(refund_id):
    refund = Refund.objects.select_related("payment", "booking").get(id=refund_id)
    if not refund.provider_refund_id or refund.status not in ("PROCESSING", "SUCCEEDED", "FAILED"):
        raise Conflict("Refund requires manual review before reconciliation.")
    try:
        remote = get_provider().fetch_refund(refund.provider_refund_id)
    except Exception as exc:
        raise PaymentUnavailable() from exc
    if not isinstance(remote, dict) or remote.get("id") != refund.provider_refund_id or remote.get("payment_id") != refund.payment.provider_payment_id or remote.get("amount") != refund.amount_paise:
        raise Conflict("Provider refund details do not match.")
    provider_status = remote.get("status")
    with transaction.atomic():
        refund = Refund.objects.select_for_update().get(id=refund_id)
        if provider_status == "processed" and refund.status != "SUCCEEDED":
            refund.status = "SUCCEEDED"
            refund.save(update_fields=["status", "updated_at"])
            payment = Payment.objects.select_for_update().get(id=refund.payment_id)
            successful = Refund.objects.filter(payment=payment, status="SUCCEEDED").aggregate(total=Sum("amount_paise"))["total"] or 0
            booking = payment.booking
            booking.payment_status = "REFUNDED" if successful == payment.amount_paise else "PARTIALLY_REFUNDED"
            booking.version += 1
            booking.save(update_fields=["payment_status", "version", "updated_at"])
            OutboxEvent.objects.create(event_type="REFUND_COMPLETED", aggregate_id=booking.id,
                                       payload={"booking_id": str(booking.id)})
        elif provider_status == "failed" and refund.status == "PROCESSING":
            refund.status = "FAILED"
            refund.save(update_fields=["status", "updated_at"])
    return refund
