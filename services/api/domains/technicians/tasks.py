from celery import shared_task
from django.db import transaction
from django.utils import timezone

from domains.operations.models import DispatchAttempt, OperationsGrant
from domains.operations.services import alert

from .models import JobAssignment, JobOffer, JobQuotation, JobStatusEvent
from .services import accrue_earning


@shared_task
def expire_job_offers():
    count = 0
    ids = JobOffer.objects.filter(status="OFFERED", expires_at__lte=timezone.now()).values_list("id", flat=True)[:100]
    for offer_id in ids:
        with transaction.atomic():
            offer = JobOffer.objects.select_for_update().select_related("booking").get(id=offer_id)
            if offer.status != "OFFERED" or offer.expires_at > timezone.now():
                continue
            offer.status = "EXPIRED"
            offer.save(update_fields=["status", "updated_at"])
            DispatchAttempt.objects.filter(offer=offer).update(status="EXPIRED")
            for user_id in OperationsGrant.objects.filter(role__in=["DISPATCH_OPERATOR", "OPERATIONS_MANAGER", "SUPER_ADMIN"]).values_list("user_id", flat=True).distinct():
                from django.contrib.auth import get_user_model

                alert(get_user_model().objects.get(id=user_id), "JOB_OFFER_EXPIRED", offer.booking)
            count += 1
    return count


@shared_task
def expire_job_quotations():
    count = 0
    ids = JobQuotation.objects.filter(status="SUBMITTED", valid_until__lte=timezone.now()).values_list("id", flat=True)[:100]
    for quote_id in ids:
        with transaction.atomic():
            quote = JobQuotation.objects.select_for_update().get(id=quote_id)
            if quote.status != "SUBMITTED" or quote.valid_until > timezone.now():
                continue
            assignment = JobAssignment.objects.select_for_update().get(id=quote.assignment_id)
            quote.status = "EXPIRED"
            quote.save(update_fields=["status", "updated_at"])
            if assignment.status == "AWAITING_QUOTATION_APPROVAL":
                assignment.status = "INSPECTING"
                assignment.save(update_fields=["status", "updated_at"])
                JobStatusEvent.objects.create(assignment=assignment,
                    from_status="AWAITING_QUOTATION_APPROVAL", to_status="INSPECTING", actor=None)
            count += 1
    return count


@shared_task
def reconcile_technician_earnings():
    created = 0
    ids = JobAssignment.objects.filter(status="SERVICE_COMPLETED", earning__isnull=True).values_list("id", flat=True)[:100]
    for assignment_id in ids:
        with transaction.atomic():
            assignment = JobAssignment.objects.select_for_update().select_related("booking").get(id=assignment_id)
            if accrue_earning(assignment):
                created += 1
    return created
