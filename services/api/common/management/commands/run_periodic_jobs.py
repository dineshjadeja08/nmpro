import logging

from django.conf import settings
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from domains.administration.tasks import reconcile_admin_ledger
from domains.bookings.tasks import cleanup_expired_holds, expire_unpaid_bookings
from domains.notifications.tasks import (
    dispatch_email_notifications, dispatch_sms_notifications, dispatch_whatsapp_notifications,
    flag_uncertain_notification_submissions, process_booking_outbox,
)
from domains.operations.tasks import evaluate_sla, process_automatic_dispatch, remind_lead_follow_ups
from domains.payments.models import ReconciliationException
from domains.payments.tasks import reconcile_recent_orders, retry_payment_events, sync_processing_refunds
from domains.technicians.tasks import (
    expire_job_offers, expire_job_quotations, reconcile_technician_earnings,
)
from domains.notifications.models import Notification

log = logging.getLogger("nammapros.periodic")

# Cloud Scheduler starts one short-lived Cloud Run Job every minute. Each task is
# idempotent in its own domain; Redis locks prevent overlapping job executions.
SCHEDULE = [
    (1, cleanup_expired_holds), (1, expire_unpaid_bookings), (1, process_booking_outbox),
    (1, retry_payment_events), (30, reconcile_recent_orders), (5, sync_processing_refunds),
    (1, dispatch_whatsapp_notifications), (1, dispatch_sms_notifications),
    (1, dispatch_email_notifications), (5, flag_uncertain_notification_submissions),
    (1, expire_job_offers), (5, expire_job_quotations), (5, reconcile_technician_earnings),
    (1, process_automatic_dispatch), (1, evaluate_sla), (1, remind_lead_follow_ups),
    (5, reconcile_admin_ledger),
]


class Command(BaseCommand):
    help = "Run due periodic jobs in a bounded Cloud Run Job; no persistent Celery worker required."

    def handle(self, *args, **options):
        minute = timezone.now().replace(second=0, microsecond=0)
        failures = []
        for every_minutes, task in SCHEDULE:
            if minute.minute % every_minutes:
                continue
            if not settings.RAZORPAY_ENABLED and task in (
                    retry_payment_events, reconcile_recent_orders, sync_processing_refunds):
                continue
            name = task.name.split(".")[-1]
            lock_key = f"periodic:{task.name}:{minute.isoformat()}"
            if not cache.add(lock_key, "running", timeout=900):
                continue
            active_key = f"periodic:active:{task.name}"
            if not cache.add(active_key, "running", timeout=900):
                continue
            try:
                result = task()
                log.info("periodic_job_completed", extra={"job_name": name, "job_result": str(result)[:120]})
            except Exception:
                failures.append(name)
                log.exception("periodic_job_failed", extra={"job_name": name})
            finally:
                cache.delete(active_key)
        if minute.minute % 5 == 0:
            exceptions = ReconciliationException.objects.filter(status="OPEN").count()
            failed_notifications = Notification.objects.filter(status="FAILED_REVIEW").count()
            if exceptions:
                log.warning("payment_reconciliation_exceptions_open", extra={"count": exceptions})
            if failed_notifications:
                log.warning("notification_delivery_review_required", extra={"count": failed_notifications})
        if failures:
            raise CommandError("Periodic jobs failed: " + ", ".join(failures))
