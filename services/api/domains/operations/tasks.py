from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from domains.bookings.models import Booking
from domains.notifications.models import Notification
from domains.technicians.models import JobAssignment, TechnicianProfile
from domains.technicians.services import JobConflict

from .models import (
    DispatchAttempt,
    DispatchRule,
    OperationsGrant,
    LeadFollowUp,
    SLABreach,
    SLAPolicy,
    SLATracker,
    SupportTicket,
)
from .services import offer_job, ranked_candidates


@shared_task
def remind_lead_follow_ups():
    now = timezone.now()
    sent = 0
    for item_id in LeadFollowUp.objects.filter(completed_at__isnull=True, reminded_at__isnull=True,
            due_at__lte=now + timedelta(minutes=15)).values_list("id", flat=True)[:100]:
        with transaction.atomic():
            item = LeadFollowUp.objects.select_for_update().select_related("lead").get(id=item_id)
            if item.completed_at or item.reminded_at or item.lead.status in {"CONVERTED", "LOST", "CANCELLED"}:
                continue
            Notification.objects.create(recipient=item.assigned_to, channel="NONE", event="LEAD_FOLLOW_UP_DUE",
                status="BLOCKED_CONFIGURATION", payload={"lead_reference": item.lead.lead_reference,
                    "lead_id": str(item.lead_id), "due_at": item.due_at.isoformat()})
            item.reminded_at = now
            item.save(update_fields=["reminded_at", "updated_at"])
            sent += 1
    return sent


@shared_task
def process_automatic_dispatch():
    if not settings.AUTOMATIC_DISPATCH_ENABLED:
        return 0
    rule = DispatchRule.objects.filter(is_active=True, automatic_enabled=True).select_related("updated_by").first()
    if not rule or not rule.updated_by_id:
        return 0
    sent = 0
    bookings = Booking.objects.filter(status__in=["CONFIRMED", "CONFIRMED_UNPAID"],
        slot__start_at__gt=timezone.now(), technician_assignment__isnull=True).select_related(
        "slot", "package").order_by("slot__start_at")[:100]
    for booking in bookings:
        attempts = DispatchAttempt.objects.filter(booking=booking).select_related("offer")
        if attempts.count() >= rule.maximum_attempts or any(
            a.offer and a.offer.status == "OFFERED" for a in attempts):
            continue
        tried = {str(a.technician_id) for a in attempts}
        candidate = next((c for c in ranked_candidates(booking, rule) if c["id"] not in tried), None)
        if not candidate:
            continue
        try:
            offer_job(rule.updated_by, booking.id, candidate["id"], booking.version, mode="AUTOMATIC")
            sent += 1
        except (JobConflict, PermissionDenied, Booking.DoesNotExist, TechnicianProfile.DoesNotExist):
            # A concurrent booking or assignment change is retried on the next sweep.
            continue
    return sent


@shared_task
def evaluate_sla():
    now = timezone.now()
    policies = {p.code: p for p in SLAPolicy.objects.filter(is_active=True)}
    if "ASSIGNMENT" in policies:
        policy = policies["ASSIGNMENT"]
        for booking in Booking.objects.filter(status__in=["CONFIRMED", "CONFIRMED_UNPAID"],
            confirmed_at__gte=policy.updated_at).order_by("-confirmed_at")[:200]:
            SLATracker.objects.get_or_create(policy=policy, booking=booking,
                defaults={"start_at": booking.confirmed_at,
                          "deadline_at": booking.confirmed_at + timedelta(minutes=policy.duration_minutes)})
    assignments = JobAssignment.objects.filter(booking__status__in=["CONFIRMED", "CONFIRMED_UNPAID"]).select_related("booking__slot").order_by("-assigned_at")[:200]
    for assignment in assignments:
        for code, start in (("ACKNOWLEDGEMENT", assignment.assigned_at),
                            ("ARRIVAL", assignment.booking.slot.start_at)):
            if code in policies and assignment.assigned_at >= policies[code].updated_at:
                policy = policies[code]
                SLATracker.objects.get_or_create(policy=policy, booking=assignment.booking,
                    defaults={"start_at": start, "deadline_at": start + timedelta(minutes=policy.duration_minutes)})
    if "SUPPORT_RESPONSE" in policies:
        policy = policies["SUPPORT_RESPONSE"]
        for ticket in SupportTicket.objects.filter(created_at__gte=policy.updated_at).order_by("-created_at")[:200]:
            SLATracker.objects.get_or_create(policy=policy, ticket=ticket,
                defaults={"start_at": ticket.created_at,
                          "deadline_at": ticket.created_at + timedelta(minutes=policy.duration_minutes)})
    count = 0
    for tracker_id in SLATracker.objects.filter(state__in=["OPEN", "BREACHED"]).values_list("id", flat=True)[:200]:
        with transaction.atomic():
            tracker = SLATracker.objects.select_for_update().select_related("policy", "booking", "ticket").get(id=tracker_id)
            assignment = JobAssignment.objects.filter(booking=tracker.booking).first() if tracker.booking_id else None
            if tracker.policy.code == "ASSIGNMENT":
                fulfilled_at = assignment.assigned_at if assignment else (
                    tracker.booking.updated_at if tracker.booking.status not in ("CONFIRMED", "CONFIRMED_UNPAID") else None)
            elif tracker.policy.code == "ACKNOWLEDGEMENT":
                event = assignment.events.filter(to_status__in=["EN_ROUTE", "ARRIVED", "INSPECTING", "IN_PROGRESS", "SERVICE_COMPLETED"]).order_by("created_at").first() if assignment else None
                fulfilled_at = event.created_at if event else (assignment.updated_at if assignment and assignment.status == "CANCELLED" else None)
            elif tracker.policy.code == "ARRIVAL":
                event = assignment.events.filter(to_status__in=["ARRIVED", "INSPECTING", "IN_PROGRESS", "SERVICE_COMPLETED"]).order_by("created_at").first() if assignment else None
                fulfilled_at = event.created_at if event else (assignment.updated_at if assignment and assignment.status == "CANCELLED" else None)
            else:
                event = tracker.ticket.events.filter(kind__in=["COMMUNICATION", "STATUS"]).order_by("created_at").first() if tracker.ticket else None
                fulfilled_at = event.created_at if event else (tracker.ticket.updated_at if tracker.ticket and tracker.ticket.status != "OPEN" else None)
            if tracker.state == "OPEN" and tracker.deadline_at <= now and (
                    not fulfilled_at or fulfilled_at > tracker.deadline_at):
                tracker.state = "BREACHED"
                tracker.save(update_fields=["state", "updated_at"])
                _, created = SLABreach.objects.get_or_create(tracker=tracker,
                    defaults={"breached_at": tracker.deadline_at})
                if created:
                    for grant in OperationsGrant.objects.filter(role__in=["OPERATIONS_MANAGER", "SUPER_ADMIN"]).select_related("user"):
                        event_name = "TECHNICIAN_RUNNING_LATE" if tracker.policy.code == "ARRIVAL" else "SLA_BREACHED"
                        Notification.objects.create(recipient=grant.user, booking=tracker.booking, channel="NONE",
                            event=event_name, template_key=event_name, status="BLOCKED_CONFIGURATION",
                            payload={"tracker_id": str(tracker.id), "booking_reference": tracker.booking.reference if tracker.booking else ""})
                    count += 1
            if fulfilled_at:
                tracker.state = "RESOLVED"
                tracker.resolved_at = fulfilled_at
                tracker.save(update_fields=["state", "resolved_at", "updated_at"])
                SLABreach.objects.filter(tracker=tracker, resolved_at__isnull=True).update(resolved_at=fulfilled_at)
    return count
