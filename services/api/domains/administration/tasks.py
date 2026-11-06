from celery import shared_task

from .services import reconcile_payment_ledger


@shared_task
def reconcile_admin_ledger():
    return reconcile_payment_ledger()
