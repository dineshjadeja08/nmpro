from datetime import timedelta

from celery import shared_task
from django.db.models import F
from django.utils import timezone

from .finance import reconcile_refund
from .models import PaymentEvent, PaymentIntent, ReconciliationException, Refund
from .services import get_provider, process_payment_event


@shared_task
def retry_payment_events():
    processed = 0
    events = PaymentEvent.objects.filter(processing_status="RECEIVED").order_by("received_at")[:100]
    for event in events:
        try:
            process_payment_event(event)
            processed += 1
        except Exception:
            event.attempt_count += 1
            if event.attempt_count >= 5:
                event.processing_status = "FAILED_REVIEW"
                ReconciliationException.objects.get_or_create(
                    fingerprint=f"event-exhausted:{event.provider_event_id}",
                    defaults={"exception_type": "WEBHOOK_PROCESSING_EXHAUSTED"})
            event.save(update_fields=["attempt_count", "processing_status", "updated_at"])
    return processed


@shared_task
def reconcile_recent_orders(lookback_hours=72):
    hours = max(1, min(int(lookback_hours), 168))
    orders = PaymentIntent.objects.filter(created_at__gte=timezone.now() - timedelta(hours=hours),
                                          provider_order_id__isnull=False).order_by(
                                              F("last_reconciled_at").asc(nulls_first=True), "created_at")[:100]
    count = 0
    for order in PaymentIntent.objects.filter(status="CREATING", provider_order_id__isnull=True,
                                               created_at__lt=timezone.now() - timedelta(minutes=30)).order_by("created_at")[:100]:
        _, created = ReconciliationException.objects.get_or_create(
            fingerprint=f"order:{order.id}:creation-unresolved",
            defaults={"booking_id": order.booking_id, "exception_type": "ORDER_CREATION_UNRESOLVED"})
        count += int(created)
    for order in orders:
        try:
            remote = get_provider().fetch_order(order.provider_order_id)
        except Exception:
            order.last_reconciled_at = timezone.now()
            order.save(update_fields=["last_reconciled_at", "updated_at"])
            continue
        order.last_reconciled_at = timezone.now()
        order.save(update_fields=["last_reconciled_at", "updated_at"])
        if not isinstance(remote, dict) or remote.get("id") != order.provider_order_id:
            continue
        problem = None
        if remote.get("amount") != order.amount_paise or remote.get("currency") != order.currency:
            problem = "ORDER_AMOUNT_OR_CURRENCY_MISMATCH"
        elif remote.get("status") == "paid" and not order.payments.filter(status="CAPTURED").exists():
            problem = "PROVIDER_PAID_INTERNAL_MISSING"
        if problem:
            _, created = ReconciliationException.objects.get_or_create(
                fingerprint=f"order:{order.id}:{problem}",
                defaults={"booking_id": order.booking_id, "exception_type": problem})
            count += int(created)
    return count


@shared_task
def sync_processing_refunds():
    count = 0
    for refund_id in Refund.objects.filter(status="PROCESSING", provider_refund_id__isnull=False).values_list("id", flat=True)[:100]:
        try:
            reconcile_refund(refund_id)
            count += 1
        except Exception:
            continue
    return count
