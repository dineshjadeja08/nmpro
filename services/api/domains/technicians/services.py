from datetime import timedelta

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from domains.audit.models import AuditLog
from domains.bookings.models import Booking
from domains.notifications.models import Notification, NotificationPreference

from .models import (
    JobAssignment,
    JobCompletion,
    JobInspection,
    JobOffer,
    JobQuotation,
    JobStatusEvent,
    QuotationItem,
    TechnicianAdminGrant,
    TechnicianAvailability,
    TechnicianCompensationRule,
    TechnicianEarning,
    TechnicianProfile,
    TechnicianServiceZone,
    TechnicianSkill,
    TechnicianTimeOff,
    TechnicianVerification,
)


class JobConflict(APIException):
    status_code = 409
    default_detail = "The job state changed. Refresh and try again."
    default_code = "JOB_CONFLICT"


def require_admin(user, *roles):
    from domains.administration.rbac import roles_for

    admin_roles = roles_for(user)
    if "SUPER_ADMIN" in admin_roles or ("TECHNICIAN_VERIFIER" in admin_roles and
                                        set(roles).intersection({"TECH_REVIEWER", "TECH_ADMIN"})):
        return
    if not TechnicianAdminGrant.objects.filter(user=user, role__in=roles).exists():
        raise PermissionDenied("Technician administration access is required.")


def profile_for(user, verified=False):
    profile = TechnicianProfile.objects.filter(user=user).first()
    if not profile:
        raise PermissionDenied("Register as a technician first.")
    if verified and (profile.verification_status != "VERIFIED" or not profile.is_active):
        raise PermissionDenied("Only verified active technicians can use jobs.")
    return profile


def notify(user, event, booking=None):
    preference = NotificationPreference.objects.filter(user=user).first()
    channel = ("WHATSAPP" if preference and preference.whatsapp_opt_in else
               "SMS" if preference and preference.sms_opt_in else
               "EMAIL" if preference and preference.email_opt_in else "NONE")
    Notification.objects.create(recipient=user, booking=booking, channel=channel, event=event,
                                template_key=event, payload={"booking_reference": booking.reference if booking else ""},
                                status="BLOCKED_CONFIGURATION")


def audit(actor, action, resource, resource_id):
    AuditLog.objects.create(actor=actor, action=action, resource_type=resource,
                            resource_id=str(resource_id))


@transaction.atomic
def apply(user, data):
    if TechnicianProfile.objects.filter(user=user).exists():
        raise JobConflict("Technician application already exists.")
    profile = TechnicianProfile.objects.create(user=user, display_name=data["display_name"],
        city=data["city"], experience_years=data["experience_years"],
        bio=data.get("bio", ""), verification_status="PENDING_DOCUMENTS")
    audit(user, "TECHNICIAN_REGISTERED", "TechnicianProfile", profile.id)
    return profile


@transaction.atomic
def submit_application(user):
    profile = profile_for(user)
    profile = TechnicianProfile.objects.select_for_update().get(id=profile.id)
    if profile.verification_status not in ("PENDING_DOCUMENTS", "REJECTED"):
        raise JobConflict("Application cannot be submitted in its current state.")
    if not profile.skills.exists() or not profile.documents.filter(kind="IDENTITY").exists():
        raise ValidationError("Add a skill and identity document before submitting.")
    old = profile.verification_status
    profile.verification_status = "UNDER_REVIEW"
    profile.submitted_at = timezone.now()
    profile.save(update_fields=["verification_status", "submitted_at", "updated_at"])
    TechnicianVerification.objects.create(technician=profile, from_status=old,
        to_status="UNDER_REVIEW", actor=user)
    audit(user, "TECHNICIAN_APPLICATION_SUBMITTED", "TechnicianProfile", profile.id)
    for grant in TechnicianAdminGrant.objects.filter(role__in=["TECH_REVIEWER", "TECH_ADMIN"]).select_related("user"):
        notify(grant.user, "TECHNICIAN_APPLICATION_SUBMITTED")
    return profile


@transaction.atomic
def review_application(actor, profile_id, target, note=""):
    require_admin(actor, "TECH_REVIEWER", "TECH_ADMIN")
    profile = TechnicianProfile.objects.select_for_update().get(id=profile_id)
    if target == "SUSPENDED":
        require_admin(actor, "TECH_ADMIN")
        if profile.verification_status != "VERIFIED":
            raise JobConflict("Only verified technicians can be suspended.")
    elif profile.verification_status != "UNDER_REVIEW" or target not in ("VERIFIED", "REJECTED"):
        raise JobConflict("Application is not awaiting review.")
    if target == "VERIFIED" and (not profile.documents.filter(kind="IDENTITY", status="APPROVED").exists()
                                 or not profile.skills.filter(is_verified=True).exists()
                                 or not profile.zones.exists()):
        raise JobConflict("Identity, skill and service zone must be approved first.")
    old = profile.verification_status
    profile.verification_status = target
    profile.is_active = target == "VERIFIED"
    profile.is_online = False
    profile.verified_at = timezone.now() if target == "VERIFIED" else profile.verified_at
    profile.save(update_fields=["verification_status", "is_active", "is_online", "verified_at", "updated_at"])
    TechnicianVerification.objects.create(technician=profile, from_status=old, to_status=target,
                                          actor=actor, note=note)
    audit(actor, f"TECHNICIAN_{target}", "TechnicianProfile", profile.id)
    notify(profile.user, f"TECHNICIAN_{target}")
    return profile


def _available(profile, booking):
    slot = booking.slot
    local_start = timezone.localtime(slot.start_at)
    local_end = timezone.localtime(slot.end_at)
    start_minute = local_start.hour * 60 + local_start.minute
    end_minute = local_end.hour * 60 + local_end.minute
    if local_start.date() != local_end.date():
        return False
    if not TechnicianAvailability.objects.filter(technician=profile, weekday=local_start.weekday(),
        start_minute__lte=start_minute, end_minute__gte=end_minute).exists():
        return False
    if TechnicianTimeOff.objects.filter(technician=profile, start_at__lt=slot.end_at,
                                        end_at__gt=slot.start_at).exists():
        return False
    if JobAssignment.objects.filter(technician=profile, booking__slot__start_at__lt=slot.end_at,
                                    booking__slot__end_at__gt=slot.start_at).exclude(
                                        status__in=["SERVICE_COMPLETED", "CANCELLED"]).exists():
        return False
    return True


def eligible(profile, booking):
    return (profile.verification_status == "VERIFIED" and profile.is_active and profile.is_online
        and booking.status in ("CONFIRMED", "CONFIRMED_UNPAID")
        and TechnicianSkill.objects.filter(technician=profile, code=booking.package.skill_code,
                                           is_verified=True).exists()
        and TechnicianServiceZone.objects.filter(technician=profile, zone=booking.slot.zone).exists()
        and _available(profile, booking))


@transaction.atomic
def create_offer(actor, booking_id, profile_id, expires_at):
    from domains.operations.models import OperationsGrant
    from domains.administration.rbac import roles_for

    if not (roles_for(actor).intersection({"SUPER_ADMIN", "OPERATIONS_MANAGER", "DISPATCH_OPERATOR"})
            or TechnicianAdminGrant.objects.filter(user=actor, role="TECH_ADMIN").exists()
            or OperationsGrant.objects.filter(user=actor, role__in=["DISPATCH_OPERATOR", "OPERATIONS_MANAGER", "SUPER_ADMIN"]).exists()):
        raise PermissionDenied("Dispatch access is required.")
    booking = Booking.objects.select_for_update().select_related("package", "slot").get(id=booking_id)
    profile = TechnicianProfile.objects.select_for_update().get(id=profile_id)
    if expires_at <= timezone.now() or expires_at >= booking.slot.start_at or not eligible(profile, booking):
        raise JobConflict("Technician is not eligible for this appointment.")
    if JobAssignment.objects.filter(booking=booking).exists():
        raise JobConflict("Booking already has an assignment.")
    offer, created = JobOffer.objects.get_or_create(booking=booking, technician=profile,
        defaults={"expires_at": expires_at, "offered_by": actor})
    if not created:
        raise JobConflict("An offer already exists for this technician.")
    notify(profile.user, "NEW_JOB_OFFER", booking)
    audit(actor, "JOB_OFFER_CREATED", "JobOffer", offer.id)
    return offer


@transaction.atomic
def accept_offer(user, offer_id):
    from domains.operations.models import DispatchAttempt

    profile = profile_for(user, verified=True)
    ref = JobOffer.objects.filter(id=offer_id, technician=profile).values("booking_id").first()
    if not ref:
        raise PermissionDenied("Offer not found.")
    booking = Booking.objects.select_for_update().select_related("package", "slot").get(id=ref["booking_id"])
    profile = TechnicianProfile.objects.select_for_update().get(id=profile.id)
    offer = JobOffer.objects.select_for_update().get(id=offer_id, technician=profile)
    if offer.status != "OFFERED" or offer.expires_at <= timezone.now() or not eligible(profile, booking):
        raise JobConflict("Offer expired or technician is no longer eligible.")
    if JobAssignment.objects.filter(booking=booking).exists():
        raise JobConflict("This job has already been assigned.")
    assignment = JobAssignment.objects.create(booking=booking, technician=profile, offer=offer,
                                               assigned_at=timezone.now())
    offer.status = "ACCEPTED"
    offer.save(update_fields=["status", "updated_at"])
    DispatchAttempt.objects.filter(offer=offer).update(status="ACCEPTED")
    JobOffer.objects.filter(booking=booking, status="OFFERED").exclude(id=offer.id).update(status="WITHDRAWN")
    DispatchAttempt.objects.filter(booking=booking, status="OFFERED").exclude(offer=offer).update(status="WITHDRAWN")
    JobStatusEvent.objects.create(assignment=assignment, from_status="OFFERED", to_status="ASSIGNED", actor=user)
    notify(booking.user, "TECHNICIAN_ASSIGNED", booking)
    audit(user, "JOB_ACCEPTED", "JobAssignment", assignment.id)
    return assignment


@transaction.atomic
def decline_offer(user, offer_id):
    from domains.operations.models import DispatchAttempt

    profile = profile_for(user)
    offer = JobOffer.objects.select_for_update().filter(id=offer_id, technician=profile).first()
    if not offer or offer.status != "OFFERED":
        raise JobConflict("Offer is no longer available.")
    offer.status = "DECLINED"
    offer.save(update_fields=["status", "updated_at"])
    DispatchAttempt.objects.filter(offer=offer).update(status="DECLINED")
    audit(user, "JOB_DECLINED", "JobOffer", offer.id)
    return offer


TRANSITIONS = {
    "ASSIGNED": "EN_ROUTE", "EN_ROUTE": "ARRIVED", "ARRIVED": "INSPECTING",
    "INSPECTING": "AWAITING_QUOTATION_APPROVAL", "AWAITING_QUOTATION_APPROVAL": "IN_PROGRESS",
    "IN_PROGRESS": "SERVICE_COMPLETED",
}


@transaction.atomic
def transition(user, assignment_id, target):
    profile = profile_for(user, verified=True)
    assignment = JobAssignment.objects.select_for_update().filter(id=assignment_id, technician=profile).first()
    if not assignment or TRANSITIONS.get(assignment.status) != target:
        raise JobConflict()
    if assignment.booking.status not in ("CONFIRMED", "CONFIRMED_UNPAID"):
        raise JobConflict("Booking is no longer active.")
    if target == "IN_PROGRESS" and not assignment.quotations.filter(status="APPROVED").exists():
        raise JobConflict("Customer approval is required before work starts.")
    old = assignment.status
    assignment.status = target
    assignment.save(update_fields=["status", "updated_at"])
    JobStatusEvent.objects.create(assignment=assignment, from_status=old, to_status=target, actor=user)
    audit(user, f"JOB_{target}", "JobAssignment", assignment.id)
    return assignment


@transaction.atomic
def submit_inspection(user, assignment_id, data):
    assignment = JobAssignment.objects.select_for_update().filter(id=assignment_id,
        technician__user=user, technician__verification_status="VERIFIED", technician__is_active=True).first()
    if not assignment or assignment.status != "INSPECTING" or hasattr(assignment, "inspection"):
        raise JobConflict("Inspection cannot be submitted now.")
    inspection = JobInspection.objects.create(assignment=assignment, submitted_at=timezone.now(), **data)
    audit(user, "JOB_INSPECTION_SUBMITTED", "JobInspection", inspection.id)
    return inspection


@transaction.atomic
def submit_quotation(user, assignment_id, labour_paise, items, valid_until):
    assignment = JobAssignment.objects.select_for_update().filter(id=assignment_id,
        technician__user=user, technician__verification_status="VERIFIED", technician__is_active=True).first()
    if not assignment or assignment.status != "INSPECTING" or not hasattr(assignment, "inspection"):
        raise JobConflict("Complete inspection before quoting.")
    if assignment.quotations.filter(status__in=["SUBMITTED", "APPROVED"]).exists():
        raise JobConflict("A quotation is already pending or approved.")
    if valid_until <= timezone.now() or valid_until > timezone.now() + timedelta(days=14):
        raise ValidationError("Quotation validity must be within 14 days.")
    parts_total = sum(item["quantity"] * item["unit_paise"] for item in items)
    total = labour_paise + parts_total
    if total <= 0:
        raise ValidationError("Quotation total must be positive.")
    quotation = JobQuotation.objects.create(assignment=assignment, labour_paise=labour_paise,
        parts_paise=parts_total, tax_paise=0, total_paise=total, valid_until=valid_until)
    QuotationItem.objects.bulk_create([QuotationItem(quotation=quotation,
        description=item["description"], quantity=item["quantity"], unit_paise=item["unit_paise"],
        total_paise=item["quantity"] * item["unit_paise"]) for item in items])
    old = assignment.status
    assignment.status = "AWAITING_QUOTATION_APPROVAL"
    assignment.save(update_fields=["status", "updated_at"])
    JobStatusEvent.objects.create(assignment=assignment, from_status=old,
        to_status=assignment.status, actor=user)
    notify(assignment.booking.user, "QUOTATION_APPROVAL_REQUIRED", assignment.booking)
    audit(user, "JOB_QUOTATION_SUBMITTED", "JobQuotation", quotation.id)
    return quotation


def _reopen_inspection(assignment, actor):
    old = assignment.status
    assignment.status = "INSPECTING"
    assignment.save(update_fields=["status", "updated_at"])
    JobStatusEvent.objects.create(assignment=assignment, from_status=old,
        to_status="INSPECTING", actor=actor)


@transaction.atomic
def decide_quotation(user, booking_id, quote_id, approved):
    booking = Booking.objects.select_for_update().filter(id=booking_id, user=user).first()
    if not booking:
        raise PermissionDenied("Booking not found.")
    quotation = JobQuotation.objects.select_for_update().filter(id=quote_id,
        assignment__booking=booking).first()
    if not quotation or quotation.status != "SUBMITTED":
        raise JobConflict("Quotation is no longer awaiting approval.")
    quotation.status = ("EXPIRED" if quotation.valid_until <= timezone.now() else
                        "APPROVED" if approved else "REJECTED")
    quotation.decided_at = timezone.now()
    quotation.save(update_fields=["status", "decided_at", "updated_at"])
    if quotation.status != "APPROVED":
        assignment = JobAssignment.objects.select_for_update().get(id=quotation.assignment_id)
        if assignment.status == "AWAITING_QUOTATION_APPROVAL":
            _reopen_inspection(assignment, user)
    notify(quotation.assignment.technician.user, f"QUOTATION_{quotation.status}", booking)
    audit(user, f"QUOTATION_{quotation.status}", "JobQuotation", quotation.id)
    return quotation


@transaction.atomic
def complete_job(user, assignment_id, checklist, parts_used, work_notes):
    assignment = JobAssignment.objects.select_for_update().select_related("booking").filter(id=assignment_id,
        technician__user=user, technician__verification_status="VERIFIED", technician__is_active=True).first()
    if not assignment or assignment.status != "IN_PROGRESS" or hasattr(assignment, "completion"):
        raise JobConflict("Job cannot be completed in its current state.")
    if not checklist or not all(isinstance(value, str) and value.strip() for value in checklist):
        raise ValidationError("A completed work checklist is required.")
    completion = JobCompletion.objects.create(assignment=assignment, checklist=checklist,
        parts_used=parts_used, work_notes=work_notes, completed_at=timezone.now())
    assignment.status = "SERVICE_COMPLETED"
    assignment.completed_at = completion.completed_at
    assignment.save(update_fields=["status", "completed_at", "updated_at"])
    JobStatusEvent.objects.create(assignment=assignment, from_status="IN_PROGRESS",
        to_status="SERVICE_COMPLETED", actor=user)
    accrue_earning(assignment)
    notify(assignment.booking.user, "JOB_COMPLETED", assignment.booking)
    audit(user, "JOB_COMPLETED", "JobAssignment", assignment.id)
    return assignment


def accrue_earning(assignment):
    """Accrue configured compensation only against settled, unrefunded booking receipts."""
    from domains.administration.services import choose_commission_rule

    if assignment.status != "SERVICE_COMPLETED" or TechnicianEarning.objects.filter(assignment=assignment).exists():
        return None
    payments = assignment.booking.payments.filter(status="CAPTURED")
    captured_paise = payments.aggregate(total=Sum("amount_paise"))["total"] or 0
    if captured_paise < assignment.booking.price_snapshot.total_paise or payments.filter(refunds__status__in=[
        "REQUESTED", "APPROVED", "PROCESSING", "SUCCEEDED"]).exists():
        return None
    commission = choose_commission_rule(assignment)
    legacy = None
    if commission:
        if commission.kind == "FIXED":
            amount = commission.amount_paise
            base = None
        else:
            snapshot = assignment.booking.price_snapshot
            base = (captured_paise if commission.percentage_base == "CAPTURED_GROSS" else
                    sum(line["amount_paise"] for line in snapshot.lines if line["code"] != "TAX"))
            amount = base * commission.basis_points // 10_000
        calculation = {"rule_id": str(commission.id), "kind": commission.kind,
                       "base_paise": base, "basis_points": commission.basis_points,
                       "percentage_base": commission.percentage_base}
    else:
        legacy = TechnicianCompensationRule.objects.filter(package=assignment.booking.package, is_active=True).first()
        amount = legacy.amount_paise if legacy else 0
        calculation = {"legacy_rule_id": str(legacy.id)} if legacy else {}
    if amount <= 0 or amount > captured_paise:
        return None
    earning = TechnicianEarning.objects.create(assignment=assignment, technician=assignment.technician,
        amount_paise=amount, compensation_rule=legacy, commission_rule=commission,
        calculation_snapshot=calculation)
    audit(None, "TECHNICIAN_EARNING_ACCRUED", "TechnicianEarning", earning.id)
    return earning


def earnings_summary(profile):
    rows = TechnicianEarning.objects.filter(technician=profile).select_related("assignment__booking")
    totals = {status: rows.filter(status=status).aggregate(total=Sum("amount_paise"))["total"] or 0
              for status in ("PENDING", "APPROVED", "PAID")}
    return {"totals": totals, "completed_jobs": JobAssignment.objects.filter(technician=profile,
        status="SERVICE_COMPLETED").count(), "history": [{"id": str(row.id),
        "booking_reference": row.assignment.booking.reference, "amount_paise": row.amount_paise,
        "status": row.status} for row in rows.order_by("-created_at")[:50]]}
