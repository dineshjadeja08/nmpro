"""Job broadcast: a confirmed booking is offered to every eligible technician in its area at once.

First come, first served: the first technician to accept gets the job, and the offers to everyone else are
withdrawn (see ``accept_offer``). To share work fairly, technicians who already have a job on the same day
are held back: the job goes to them only when nobody else is eligible, or when no one has accepted within
``JOB_BROADCAST_BUSY_DELAY_SECONDS`` (4 minutes by default).

Nothing here needs a background worker. The first wave goes out when the booking is confirmed; later waves
are checked whenever a technician's app asks for its offers (``sweep``), and by the Celery beat where one runs.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import Min
from django.utils import timezone

from .models import JobAssignment, JobOffer, TechnicianJoiningFee, TechnicianProfile

log = logging.getLogger(__name__)

OPEN_BOOKING_STATUSES = ("CONFIRMED", "CONFIRMED_UNPAID")
TRAVEL_BUFFER = timedelta(minutes=30)
# Offers stay open until shortly before the visit; after that the booking needs a person to dispatch it.
OFFER_CLOSES_BEFORE_START = timedelta(minutes=10)
SYSTEM_USERNAME = "system-dispatch"


def enabled() -> bool:
    return bool(getattr(settings, "JOB_BROADCAST_ENABLED", True))


def busy_delay() -> timedelta:
    return timedelta(seconds=int(getattr(settings, "JOB_BROADCAST_BUSY_DELAY_SECONDS", 240)))


def system_actor():
    """The user recorded as 'offered by' for automatic offers."""
    User = get_user_model()
    user, _ = User.objects.get_or_create(username=SYSTEM_USERNAME, defaults={"is_active": False, "first_name": "Auto dispatch"})
    return user


def candidates(booking):
    """Technicians who could take this booking now, split into (free_today, busy_today)."""
    from domains.technicians.partner import leads_this_term
    from domains.technicians.services import eligible

    slot = booking.slot
    profiles = (TechnicianProfile.objects.filter(
        verification_status="VERIFIED", is_active=True, is_online=True,
        skills__code=booking.package.skill_code, skills__is_verified=True, zones__zone=slot.zone)
        .distinct().select_related("user"))
    fees = {f.technician_id: f for f in TechnicianJoiningFee.objects.filter(technician__in=profiles)}
    cap = settings.TECHNICIAN_LEADS_PER_YEAR
    day = timezone.localtime(slot.start_at).date()
    free, busy = [], []
    for profile in profiles:
        fee = fees.get(profile.id)
        if not fee or not fee.membership_active:
            continue  # jobs only go to technicians with a paid membership year
        if cap and leads_this_term(profile, fee) >= cap:
            continue
        if not eligible(profile, booking):
            continue
        clash = JobAssignment.objects.filter(
            technician=profile, booking__slot__start_at__lt=slot.end_at + TRAVEL_BUFFER,
            booking__slot__end_at__gt=slot.start_at - TRAVEL_BUFFER,
        ).exclude(status__in=["SERVICE_COMPLETED", "CANCELLED"]).exists()
        if clash:
            continue
        has_job_today = JobAssignment.objects.filter(
            technician=profile, booking__slot__start_at__date=day).exclude(status="CANCELLED").exists()
        (busy if has_job_today else free).append(profile)
    return free, busy


def _offer_to(booking, profiles, actor, expires_at):
    """Create offers for these technicians (skipping anyone already offered). Returns how many were sent."""
    from domains.operations.models import DispatchAttempt

    sent = 0
    for profile in profiles:
        try:
            with transaction.atomic():
                offer, created = JobOffer.objects.get_or_create(
                    booking=booking, technician=profile, defaults={"expires_at": expires_at, "offered_by": actor})
                if not created:
                    continue
                DispatchAttempt.objects.create(booking=booking, technician=profile, offer=offer,
                                               status="OFFERED", mode="AUTOMATIC", reason="Broadcast")
                from domains.technicians.services import notify

                notify(profile.user, "NEW_JOB_OFFER", booking)
                sent += 1
        except IntegrityError:
            continue  # another request offered it at the same moment
    return sent


def broadcast(booking_id) -> int:
    """Offer one booking to whoever should see it now. Safe to call repeatedly. Returns offers sent."""
    from domains.bookings.models import Booking

    if not enabled():
        return 0
    now = timezone.now()
    with transaction.atomic():
        booking = (Booking.objects.select_for_update().select_related("slot__zone", "package")
                   .filter(id=booking_id).first())
        if (not booking or booking.status not in OPEN_BOOKING_STATUSES
                or JobAssignment.objects.filter(booking=booking).exists()):
            return 0
        expires_at = booking.slot.start_at - OFFER_CLOSES_BEFORE_START
        if expires_at <= now + timedelta(minutes=1):
            return 0  # too close to the visit for an open offer; operations dispatches it by hand
        free, busy = candidates(booking)
        first_offer = JobOffer.objects.filter(booking=booking).aggregate(first=Min("created_at"))["first"]
        # Busy technicians join once the wait is over, or straight away when nobody free can take it.
        include_busy = not free or (first_offer is not None and now - first_offer >= busy_delay())
        targets = free + (busy if include_busy else [])
        return _offer_to(booking, targets, system_actor(), expires_at)


def sweep(limit=50) -> int:
    """Re-check open bookings: first waves that were missed, and busy technicians once the wait is over.
    Runs at most every 15 seconds however often it is called."""
    from domains.bookings.models import Booking

    if not enabled() or not cache.add("job-broadcast-sweep", 1, timeout=15):
        return 0
    now = timezone.now()
    ids = (Booking.objects.filter(status__in=OPEN_BOOKING_STATUSES, slot__start_at__gt=now + OFFER_CLOSES_BEFORE_START,
                                  technician_assignment__isnull=True)
           .order_by("slot__start_at").values_list("id", flat=True)[:limit])
    sent = 0
    for booking_id in ids:
        try:
            sent += broadcast(booking_id)
        except Exception:  # one bad booking must not stop the others
            log.exception("Job broadcast failed for booking %s", booking_id)
    return sent


def on_booking_saved(booking):
    """Called after a booking is saved: broadcast once it is confirmed and still unassigned."""
    if not enabled() or booking.status not in OPEN_BOOKING_STATUSES:
        return
    booking_id = booking.id
    transaction.on_commit(lambda: _safe_broadcast(booking_id))


def _safe_broadcast(booking_id):
    try:
        broadcast(booking_id)
    except Exception:
        log.exception("Job broadcast failed for booking %s", booking_id)
