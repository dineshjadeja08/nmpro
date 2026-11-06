import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
app = Celery("nammapros")
app.conf.broker_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
app.conf.result_backend = None
app.conf.beat_schedule = {
    "cleanup-expired-holds": {"task": "domains.bookings.tasks.cleanup_expired_holds", "schedule": 60.0},
    "expire-unpaid-bookings": {"task": "domains.bookings.tasks.expire_unpaid_bookings", "schedule": 30.0},
    "process-booking-outbox": {"task": "domains.notifications.tasks.process_booking_outbox", "schedule": 30.0},
    "retry-payment-events": {"task": "domains.payments.tasks.retry_payment_events", "schedule": 60.0},
    "reconcile-recent-orders": {"task": "domains.payments.tasks.reconcile_recent_orders", "schedule": 1800.0},
    "sync-processing-refunds": {"task": "domains.payments.tasks.sync_processing_refunds", "schedule": 300.0},
    "dispatch-whatsapp": {"task": "domains.notifications.tasks.dispatch_whatsapp_notifications", "schedule": 60.0},
    "dispatch-sms": {"task": "domains.notifications.tasks.dispatch_sms_notifications", "schedule": 60.0},
    "dispatch-email": {"task": "domains.notifications.tasks.dispatch_email_notifications", "schedule": 60.0},
    "review-uncertain-notifications": {"task": "domains.notifications.tasks.flag_uncertain_notification_submissions", "schedule": 300.0},
    "expire-job-offers": {"task": "domains.technicians.tasks.expire_job_offers", "schedule": 60.0},
    "expire-job-quotations": {"task": "domains.technicians.tasks.expire_job_quotations", "schedule": 300.0},
    "reconcile-technician-earnings": {"task": "domains.technicians.tasks.reconcile_technician_earnings", "schedule": 300.0},
    "automatic-dispatch": {"task": "domains.operations.tasks.process_automatic_dispatch", "schedule": 60.0},
    "evaluate-operations-sla": {"task": "domains.operations.tasks.evaluate_sla", "schedule": 60.0},
    "remind-lead-follow-ups": {"task": "domains.operations.tasks.remind_lead_follow_ups", "schedule": 60.0},
    "reconcile-admin-ledger": {"task": "domains.administration.tasks.reconcile_admin_ledger", "schedule": 300.0},
}
app.autodiscover_tasks()
