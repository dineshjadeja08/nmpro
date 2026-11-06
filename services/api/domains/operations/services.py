from datetime import timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from domains.audit.models import AuditLog
from domains.bookings.models import Booking
from domains.notifications.models import Notification
from domains.technicians.models import JobAssignment, JobOffer, JobStatusEvent, TechnicianProfile
from domains.technicians.services import JobConflict, create_offer, eligible, notify

from .models import DispatchAttempt, DispatchRule, OperationsGrant


def require_role(user, *roles):
    from domains.administration.rbac import roles_for

    admin_roles = roles_for(user)
    if "SUPER_ADMIN" in admin_roles or admin_roles.intersection(roles):
        return
    if not user.is_authenticated or not OperationsGrant.objects.filter(user=user, role__in=[*roles, "SUPER_ADMIN"]).exists():
        raise PermissionDenied("Operations access is required.")


def log(actor, action, resource, instance_id, metadata=None):
    AuditLog.objects.create(actor=actor, action=action, resource_type=resource,
                            resource_id=str(instance_id), metadata=metadata or {})


def alert(user, event, booking=None, reference=""):
    Notification.objects.create(recipient=user, booking=booking, channel="NONE", event=event,
        template_key=event, status="BLOCKED_CONFIGURATION",
        payload={"booking_reference": booking.reference if booking else reference})


def active_rule():
    return DispatchRule.objects.filter(is_active=True).order_by("created_at").first()


def ranked_candidates(booking, rule=None):
    rule = rule or active_rule()
    if not rule:
        return []
    start = booking.slot.start_at - timedelta(minutes=rule.travel_buffer_minutes)
    end = booking.slot.end_at + timedelta(minutes=rule.travel_buffer_minutes)
    profiles = TechnicianProfile.objects.filter(verification_status="VERIFIED", is_active=True,
        is_online=True, skills__code=booking.package.skill_code, skills__is_verified=True,
        zones__zone=booking.slot.zone).distinct().select_related("user").annotate(
        active_jobs=Count("assignments", filter=~Q(assignments__status__in=["SERVICE_COMPLETED", "CANCELLED"]), distinct=True))
    candidates = []
    for profile in profiles:
        if not eligible(profile, booking):
            continue
        if JobAssignment.objects.filter(technician=profile, booking__slot__start_at__lt=end,
            booking__slot__end_at__gt=start).exclude(status__in=["SERVICE_COMPLETED", "CANCELLED"]).exists():
            continue
        score = rule.weight_availability - rule.weight_workload * profile.active_jobs
        candidates.append({"id": str(profile.id), "name": profile.display_name,
            "score": score, "workload": profile.active_jobs,
            "reasons": ["Verified skill", "Assigned service zone", "Working hours and travel buffer available",
                        f"{profile.active_jobs} active jobs"]})
    return sorted(candidates, key=lambda c: (-c["score"], c["workload"], c["id"]))


@transaction.atomic
def offer_job(actor, booking_id, technician_id, expected_version, mode="MANUAL"):
    require_role(actor, "DISPATCH_OPERATOR", "OPERATIONS_MANAGER")
    booking = get_object_or_404(Booking.objects.select_for_update().select_related("slot", "package"), id=booking_id)
    if booking.version != expected_version:
        raise JobConflict("Booking changed. Refresh before dispatching.")
    rule = active_rule()
    if not rule:
        raise JobConflict("An active dispatch rule is required.")
    if not any(c["id"] == str(technician_id) for c in ranked_candidates(booking, rule)):
        raise JobConflict("Technician is no longer eligible.")
    attempts = DispatchAttempt.objects.filter(booking=booking).count()
    if attempts >= rule.maximum_attempts:
        raise JobConflict("Maximum offer attempts reached. Manual intervention is required.")
    expires = min(timezone.now() + timedelta(minutes=rule.offer_timeout_minutes),
                  booking.slot.start_at - timedelta(seconds=1))
    offer = create_offer(actor, booking.id, technician_id, expires)
    attempt = DispatchAttempt.objects.create(booking=booking, technician_id=technician_id,
        offer=offer, status="OFFERED", mode=mode)
    log(actor, "DISPATCH_OFFER_CREATED", "DispatchAttempt", attempt.id)
    return offer


@transaction.atomic
def assign_job(actor, booking_id, technician_id, expected_version, reason="", reassign=False):
    require_role(actor, "DISPATCH_OPERATOR", "OPERATIONS_MANAGER")
    booking = get_object_or_404(Booking.objects.select_for_update().select_related("slot", "package"), id=booking_id)
    if booking.version != expected_version:
        raise JobConflict("Booking changed. Refresh before assignment.")
    profile = get_object_or_404(TechnicianProfile.objects.select_for_update(), id=technician_id)
    current = JobAssignment.objects.select_for_update().filter(booking=booking).first()
    if reassign and not current:
        raise JobConflict("This booking is not assigned. Use assign.")
    if not reassign and current and current.technician_id != profile.id:
        raise JobConflict("This booking is already assigned. Use reassign.")
    if current and current.technician_id == profile.id:
        return current
    if current and current.status not in ("ASSIGNED", "EN_ROUTE"):
        raise JobConflict("This job cannot be reassigned after arrival.")
    if not eligible(profile, booking):
        raise JobConflict("Technician is no longer eligible.")
    rule = active_rule()
    if not rule or not any(c["id"] == str(profile.id) for c in ranked_candidates(booking, rule)):
        raise JobConflict("Dispatch rule or travel buffer eligibility failed.")
    offer = JobOffer.objects.filter(booking=booking, technician=profile).first()
    if offer and offer.status not in ("OFFERED", "ACCEPTED"):
        raise JobConflict("This technician has already declined or expired for this booking.")
    if not offer:
        offer = JobOffer.objects.create(booking=booking, technician=profile, status="ACCEPTED",
            expires_at=booking.slot.start_at, offered_by=actor)
    else:
        offer.status = "ACCEPTED"
        offer.save(update_fields=["status", "updated_at"])
        DispatchAttempt.objects.filter(offer=offer).update(status="ACCEPTED")
    if current:
        previous_user = current.technician.user
        current.offer.status = "WITHDRAWN"
        current.offer.save(update_fields=["status", "updated_at"])
        DispatchAttempt.objects.filter(offer=current.offer).update(status="WITHDRAWN")
        current.technician = profile
        current.offer = offer
        current.status = "ASSIGNED"
        current.assigned_at = timezone.now()
        current.save(update_fields=["technician", "offer", "status", "assigned_at", "updated_at"])
        notify(previous_user, "TECHNICIAN_REASSIGNED", booking)
        action = "JOB_REASSIGNED"
    else:
        current = JobAssignment.objects.create(booking=booking, technician=profile, offer=offer,
            assigned_at=timezone.now())
        action = "JOB_ASSIGNED_BY_OPERATIONS"
    JobOffer.objects.filter(booking=booking, status="OFFERED").exclude(id=offer.id).update(status="WITHDRAWN")
    DispatchAttempt.objects.filter(booking=booking, status="OFFERED").exclude(offer=offer).update(status="WITHDRAWN")
    JobStatusEvent.objects.create(assignment=current, from_status="DISPATCH", to_status="ASSIGNED", actor=actor)
    notify(profile.user, "TECHNICIAN_ASSIGNED", booking)
    notify(booking.user, "TECHNICIAN_REASSIGNED" if action == "JOB_REASSIGNED" else "TECHNICIAN_ASSIGNED", booking)
    log(actor, action, "JobAssignment", current.id, {"reason": reason})
    return current
