import hashlib
import json
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from common.sequences import next_booking_reference
from domains.audit.models import AuditLog
from domains.catalog.models import PricingRule, ServicePackage
from domains.locations.models import Address, Zone
from domains.notifications.models import OutboxEvent

from .models import (
    AppointmentSlot,
    Booking,
    BookingIdempotencyRecord,
    BookingItem,
    BookingPriceSnapshot,
    BookingStatusEvent,
    CheckoutQuote,
    ScheduleClosure,
    SlotHold,
)
from .states import require_transition


class Conflict(APIException):
    status_code = 409
    default_detail = "The selected option is no longer available."
    default_code = "CONFLICT"


class Gone(APIException):
    status_code = 410
    default_detail = "The reservation has expired. Choose another appointment."
    default_code = "EXPIRED"


def occupied_bookings(slot, now):
    return Booking.objects.filter(slot=slot).filter(
        Q(status__in=["CONFIRMED_UNPAID", "CONFIRMED"]) |
        Q(status="AWAITING_PAYMENT", payment_expires_at__gt=now)
    ).count()


def pilot_remaining(slot, now, exclude_hold_id=None, exclude_booking_id=None):
    if not settings.PILOT_ENABLED:
        return None
    day = timezone.localtime(slot.start_at).date()
    bookings = Booking.objects.filter(slot__zone_id=slot.zone_id, slot__start_at__date=day).filter(
        Q(status__in=["CONFIRMED_UNPAID", "CONFIRMED"]) |
        Q(status="AWAITING_PAYMENT", payment_expires_at__gt=now))
    if exclude_booking_id:
        bookings = bookings.exclude(id=exclude_booking_id)
    holds = SlotHold.objects.filter(slot__zone_id=slot.zone_id, slot__start_at__date=day,
        status="ACTIVE", expires_at__gt=now)
    if exclude_hold_id:
        holds = holds.exclude(id=exclude_hold_id)
    return settings.PILOT_DAILY_BOOKING_LIMIT - bookings.count() - holds.count()


def _has_active_closure(slot: AppointmentSlot) -> bool:
    return ScheduleClosure.objects.filter(
        is_active=True, start_at__lt=slot.end_at, end_at__gt=slot.start_at
    ).filter(Q(zone=slot.zone) | Q(zone__isnull=True)).exists()


def serviceable(package: ServicePackage, address: Address) -> Zone | None:
    if not package.is_active or not package.service.is_active or not package.service.category.is_active:
        return None
    if settings.PILOT_ENABLED and package.service.slug not in settings.PILOT_SERVICE_SLUGS:
        return None
    zones = Zone.objects.filter(
        city__is_active=True, is_active=True, city__name__iexact=address.city,
        postal_code=address.postal_code,
        pricingrule__package=package, pricingrule__is_active=True,
    ).filter(
        Q(services_configured=False) | Q(servicecoverage__service=package.service, servicecoverage__is_active=True)
    ).distinct()
    if settings.PILOT_ENABLED:
        zones = zones.filter(id__in=settings.PILOT_ZONE_IDS)
    return zones.first()


def available_slots(package: ServicePackage, address: Address, start, end, include_full: bool = False):
    zone = serviceable(package, address)
    if not zone:
        return []
    now = timezone.now()
    slots = AppointmentSlot.objects.filter(
        package=package, zone=zone, is_active=True, is_blackout=False,
        start_at__gte=max(now, start), start_at__lte=end,
    ).order_by("start_at")[:100]
    closures = list(ScheduleClosure.objects.filter(
        is_active=True, end_at__gt=max(now, start), start_at__lt=end
    ).filter(Q(zone=zone) | Q(zone__isnull=True)))
    result = []
    pilot_remaining_by_day = {}
    for slot in slots:
        if any(c.start_at < slot.end_at and c.end_at > slot.start_at for c in closures):
            continue
        if slot.start_at < now + timedelta(minutes=slot.minimum_lead_minutes):
            continue
        active_holds = SlotHold.objects.filter(slot=slot, status="ACTIVE", expires_at__gt=now).count()
        confirmed = occupied_bookings(slot, now)
        remaining = max(0, slot.capacity - active_holds - confirmed)
        day = timezone.localtime(slot.start_at).date()
        if day not in pilot_remaining_by_day:
            pilot_remaining_by_day[day] = pilot_remaining(slot, now)
        pilot_available = pilot_remaining_by_day[day]
        if pilot_available is not None:
            remaining = max(0, min(remaining, pilot_available))
        if remaining > 0 or include_full:
            result.append({"id": str(slot.id), "start_at": slot.start_at, "end_at": slot.end_at,
                           "remaining": remaining, "version": slot.version})
    return result


def _live_hold(hold: SlotHold, user):
    if hold.user_id != user.id:
        raise ValidationError("Reservation not found.")
    if hold.status != "ACTIVE":
        raise Conflict("This reservation is no longer active.")
    if hold.expires_at <= timezone.now():
        hold.status = "EXPIRED"
        hold.save(update_fields=["status", "updated_at"])
        raise Gone()


@transaction.atomic
def create_hold(user, package: ServicePackage, address: Address, slot_id):
    # PostgreSQL row lock serializes competing holds for the same slot.
    slot = AppointmentSlot.objects.select_for_update().filter(id=slot_id).first()
    if not slot or not slot.is_active or slot.is_blackout or slot.package_id != package.id or _has_active_closure(slot):
        raise Conflict("This appointment is not available.")
    zone = serviceable(package, address)
    now = timezone.now()
    if not zone or slot.zone_id != zone.id:
        raise ValidationError("The selected service is unavailable at this address.")
    if settings.PILOT_ENABLED:
        Zone.objects.select_for_update().get(id=zone.id)
    if slot.start_at <= now + timedelta(minutes=slot.minimum_lead_minutes):
        raise Conflict("This appointment is too soon to book.")
    occupied = occupied_bookings(slot, now)
    active = SlotHold.objects.filter(slot=slot, status="ACTIVE", expires_at__gt=now).count()
    if occupied + active >= slot.capacity:
        raise Conflict("This appointment was just taken. Choose another time.")
    if settings.PILOT_ENABLED and pilot_remaining(slot, now) <= 0:
        raise Conflict("The pilot has reached its daily booking limit.")
    expires = now + timedelta(minutes=settings.BOOKING_HOLD_MINUTES)
    return SlotHold.objects.create(slot=slot, user=user, address=address, expires_at=expires)


@transaction.atomic
def release_hold(user, hold_id):
    hold_ref = SlotHold.objects.filter(id=hold_id, user=user).values("slot_id").first()
    if not hold_ref:
        raise ValidationError("Reservation not found.")
    AppointmentSlot.objects.select_for_update().get(id=hold_ref["slot_id"])
    hold = SlotHold.objects.select_for_update().get(id=hold_id, user=user)
    if hold.status == "ACTIVE":
        hold.status = "RELEASED"
        hold.save(update_fields=["status", "updated_at"])


def calculate_price(rule: PricingRule):
    if not rule.is_active or rule.currency != "INR":
        raise ValidationError("Pricing is not configured for this service and area.")
    if rule.package.pricing_model == "FIXED_PRICE":
        if rule.base_paise <= 0 or rule.inspection_paise:
            raise ValidationError("Fixed pricing is incomplete.")
    elif rule.inspection_paise <= 0 or rule.base_paise:
        raise ValidationError("Inspection pricing is incomplete.")
    lines = [
        {"code": "BASE", "amount_paise": rule.base_paise},
        {"code": "INSPECTION", "amount_paise": rule.inspection_paise},
        {"code": "FEE", "amount_paise": rule.fee_paise},
        {"code": "TAX", "amount_paise": rule.tax_paise},
    ]
    return lines, sum(line["amount_paise"] for line in lines)


@transaction.atomic
def create_quote(user, hold_id):
    hold_ref = SlotHold.objects.filter(id=hold_id, user=user).values("slot_id").first()
    if not hold_ref:
        raise ValidationError("Reservation not found.")
    AppointmentSlot.objects.select_for_update().get(id=hold_ref["slot_id"])
    hold = SlotHold.objects.select_for_update().select_related("slot__package", "address").get(id=hold_id, user=user)
    _live_hold(hold, user)
    zone = serviceable(hold.slot.package, hold.address)
    if not zone or zone.id != hold.slot.zone_id:
        raise Conflict("Service coverage has changed. Choose another appointment.")
    rule = PricingRule.objects.select_related("package").filter(
        package=hold.slot.package, zone=hold.slot.zone, is_active=True,
    ).first()
    if not rule:
        raise Conflict("Pricing is no longer available.")
    lines, total = calculate_price(rule)
    advance_paise = total
    if rule.payment_policy == "ADVANCE":
        if rule.advance_type == "PERCENTAGE":
            advance_paise = (total * rule.advance_percentage) // 100
        elif rule.advance_type == "FIXED":
            advance_paise = min(rule.advance_amount_paise, total)
    elif rule.payment_policy == "PAY_AT_VISIT":
        advance_paise = 0
    remaining_balance_paise = total - advance_paise
    return CheckoutQuote.objects.create(hold=hold, user=user, pricing_rule=rule,
                                        pricing_version=rule.version, lines=lines, total_paise=total,
                                        advance_paise=advance_paise,
                                        remaining_balance_paise=remaining_balance_paise,
                                        expires_at=min(hold.expires_at, timezone.now() + timedelta(minutes=5)))


def serialize_quote(quote):
    return {"id": str(quote.id), "hold_id": str(quote.hold_id), "expires_at": quote.expires_at,
            "lines": quote.lines, "total_paise": quote.total_paise,
            "advance_paise": getattr(quote, "advance_paise", 0),
            "remaining_balance_paise": getattr(quote, "remaining_balance_paise", 0),
            "currency": "INR",
            "pricing_policy_id": str(quote.pricing_rule_id), "pricing_version": quote.pricing_version,
            "payment_policy": quote.pricing_rule.payment_policy,
            "advance_type": quote.pricing_rule.advance_type,
            "advance_percentage": quote.pricing_rule.advance_percentage}


def serialize_booking(booking):
    snapshot = booking.price_snapshot
    invoice = getattr(booking, "invoice", None)
    payment_order = getattr(booking, "payment_order", None)
    assignment = getattr(booking, "technician_assignment", None)
    review = getattr(booking, "review", None)
    now = timezone.now()
    can_cancel = bool(snapshot.cancellation_cutoff_minutes is not None and booking.status in ("REQUESTED", "CONFIRMED_UNPAID")
                      and booking.payment_status == "UNPAID" and
                      booking.slot.start_at > now + timedelta(minutes=snapshot.cancellation_cutoff_minutes))
    can_reschedule = bool(snapshot.reschedule_cutoff_minutes is not None and booking.status in ("REQUESTED", "CONFIRMED_UNPAID")
                          and booking.payment_status == "UNPAID" and
                          booking.slot.start_at > now + timedelta(minutes=snapshot.reschedule_cutoff_minutes))
    work_started = (
        booking.status in ("IN_PROGRESS", "COMPLETED", "CLOSED", "CANCELLED", "EXPIRED")
        or bool(assignment and assignment.status in ("IN_PROGRESS", "SERVICE_COMPLETED"))
    )
    can_review = bool(
        (booking.status in ("COMPLETED", "CLOSED") or (assignment and assignment.status == "SERVICE_COMPLETED"))
        and review is None
    )
    tech_payload = None
    if assignment and booking.status not in ("CANCELLED", "EXPIRED"):
        from django.db.models import Avg
        from domains.catalog.models import Review
        from domains.technicians.models import JobAssignment

        tech_profile = assignment.technician
        tech_rating = Review.objects.filter(technician=tech_profile, is_visible=True).aggregate(avg=Avg("rating"))["avg"]
        completed_jobs = JobAssignment.objects.filter(technician=tech_profile, status="SERVICE_COMPLETED").count()
        tech_payload = {
            "name": tech_profile.display_name,
            "phone": tech_profile.user.phone_e164,
            "status": assignment.status,
            "rating": round(float(tech_rating), 1) if tech_rating else None,
            "completed_jobs": completed_jobs,
            "photo_url": None,
        }
    return {"id": str(booking.id), "reference": booking.reference, "status": booking.status,
            "payment_status": booking.payment_status, "payment_expires_at": booking.payment_expires_at,
            "invoice_available": bool(invoice and invoice.status == "ISSUED" and invoice.document),
            "payment_attempt_unresolved": bool(payment_order and payment_order.checkout_started_at
                                               and booking.status == "AWAITING_PAYMENT"
                                               and booking.payment_status != "FAILED"),
            "version": booking.version,
            "problem_description": booking.problem_description,
            "offline_collected_paise": booking.offline_collected_paise,
            "start_otp_code": booking.start_otp_code if not work_started else "",
            "technician": tech_payload,
            "can_review": can_review,
            "review": {"rating": review.rating, "comment": review.comment, "tags": review.tags or [], "photo_url": review.photo_display} if review else None,
            "service": booking.service.name, "package": booking.package.name,
            "package_id": str(booking.package_id), "address_id": str(booking.address_id),
            "can_cancel": can_cancel, "can_reschedule": can_reschedule,
            "address": {"label": booking.address.label, "line_1": booking.address.line_1,
                        "locality": booking.address.locality, "city": booking.address.city,
                        "postal_code": booking.address.postal_code},
            "slot": {"start_at": booking.slot.start_at, "end_at": booking.slot.end_at},
            "price": {"lines": snapshot.lines, "total_paise": snapshot.total_paise,
                      "advance_paise": getattr(snapshot, "advance_paise", 0),
                      "remaining_balance_paise": getattr(snapshot, "remaining_balance_paise", 0),
                      "currency": snapshot.currency},
            "events": [{"from_status": e.from_status, "to_status": e.to_status, "created_at": e.created_at}
                       for e in booking.events.all()]}


@transaction.atomic
def confirm_booking(user, hold_id, quote_id, key, accepted_total, problem_description=""):
    if not key or len(key) > 128:
        raise ValidationError("A valid Idempotency-Key header is required.")
    body_hash = hashlib.sha256(json.dumps({"hold_id": str(hold_id), "quote_id": str(quote_id),
                                           "accepted_total_paise": accepted_total}, sort_keys=True).encode()).hexdigest()
    # User lock serializes same-key submissions before the idempotency lookup.
    type(user).objects.select_for_update().get(id=user.id)
    previous = BookingIdempotencyRecord.objects.filter(user=user, key=key).select_related("booking").first()
    if previous:
        if previous.request_hash != body_hash:
            raise Conflict("This idempotency key was used for a different booking request.")
        return previous.booking, False
    hold_ref = SlotHold.objects.filter(id=hold_id, user=user).values("slot_id").first()
    if not hold_ref:
        raise ValidationError("Reservation not found.")
    slot = AppointmentSlot.objects.select_for_update().get(id=hold_ref["slot_id"])
    hold = SlotHold.objects.select_for_update().select_related("address", "slot__package__service").get(id=hold_id, user=user)
    _live_hold(hold, user)
    quote = CheckoutQuote.objects.select_for_update().select_related("pricing_rule").filter(
        id=quote_id, user=user, hold=hold, status="ACTIVE",
    ).first()
    if not quote or quote.expires_at <= timezone.now():
        raise Gone("The quote expired. Review a fresh price before confirming.")
    zone = serviceable(slot.package, hold.address)
    if not zone or zone.id != slot.zone_id or not slot.is_active or slot.is_blackout:
        raise Conflict("Service or appointment availability has changed.")
    if settings.PILOT_ENABLED:
        Zone.objects.select_for_update().get(id=zone.id)
    now = timezone.now()
    if slot.start_at <= now + timedelta(minutes=slot.minimum_lead_minutes):
        raise Conflict("This appointment is too soon to book.")
    rule = PricingRule.objects.select_related("package").filter(id=quote.pricing_rule_id, is_active=True).first()
    if not rule or rule.version != quote.pricing_version:
        raise Conflict("The price changed. Request and accept a new quote.")
    _, current_total = calculate_price(rule)
    if current_total != quote.total_paise or accepted_total != quote.total_paise:
        raise Conflict("The price changed. Request and accept a new quote.")
    if rule.payment_policy in ("PREPAID", "ADVANCE") and not settings.RAZORPAY_ENABLED:
        raise Conflict("Online payment is not yet available for this service.")
    if rule.payment_policy not in ("PREPAID", "PAY_AT_VISIT", "ADVANCE"):
        raise Conflict("Payment policy is not supported.")
    occupied = occupied_bookings(slot, timezone.now())
    active_other = SlotHold.objects.filter(slot=slot, status="ACTIVE", expires_at__gt=timezone.now()).exclude(id=hold.id).count()
    if occupied + active_other >= slot.capacity:
        raise Conflict("This appointment was just taken. Choose another time.")
    if settings.PILOT_ENABLED and pilot_remaining(slot, now, exclude_hold_id=hold.id) <= 0:
        raise Conflict("The pilot has reached its daily booking limit.")
    reference = next_booking_reference(now)
    requires_online_payment = rule.payment_policy in ("PREPAID", "ADVANCE")
    payment_expires_at = (min(now + timedelta(minutes=settings.PAYMENT_CHECKOUT_MINUTES),
                              slot.start_at - timedelta(minutes=slot.minimum_lead_minutes)) if requires_online_payment else None)
    target_status = "AWAITING_PAYMENT" if requires_online_payment else "CONFIRMED_UNPAID"
    require_transition("DRAFT", target_status)
    booking = Booking.objects.create(user=user, service=slot.package.service, package=slot.package,
                                     address=hold.address, slot=slot, hold=hold, reference=reference,
                                     status=target_status,
                                     payment_status="PENDING" if requires_online_payment else "UNPAID",
                                     payment_expires_at=payment_expires_at,
                                     confirmed_at=None if requires_online_payment else timezone.now(),
                                     problem_description=str(problem_description or "")[:2000],
                                     start_otp_code=f"{secrets.randbelow(10000):04d}")
    BookingItem.objects.create(booking=booking, package=slot.package)
    BookingPriceSnapshot.objects.create(booking=booking, pricing_rule_id=rule.id,
                                         pricing_version=rule.version, lines=quote.lines,
                                         total_paise=quote.total_paise,
                                         advance_type=rule.advance_type,
                                         advance_percentage=rule.advance_percentage,
                                         advance_paise=quote.advance_paise,
                                         remaining_balance_paise=quote.remaining_balance_paise,
                                         payment_policy=rule.payment_policy,
                                         cancellation_cutoff_minutes=rule.cancellation_cutoff_minutes,
                                         reschedule_cutoff_minutes=rule.reschedule_cutoff_minutes)
    BookingStatusEvent.objects.create(booking=booking, from_status="DRAFT", to_status=booking.status, actor=user)
    BookingIdempotencyRecord.objects.create(user=user, key=key, request_hash=body_hash, booking=booking)
    OutboxEvent.objects.create(event_type="BOOKING_PAYMENT_PENDING" if requires_online_payment else "BOOKING_CONFIRMED", aggregate_id=booking.id,
                               payload={"booking_id": str(booking.id)})
    AuditLog.objects.create(actor=user, action="BOOKING_PAYMENT_PENDING" if requires_online_payment else "BOOKING_CONFIRMED", resource_type="Booking",
                            resource_id=str(booking.id), metadata={"reference": reference})
    hold.status = "CONSUMED"
    hold.save(update_fields=["status", "updated_at"])
    quote.status = "ACCEPTED"
    quote.save(update_fields=["status", "updated_at"])
    if getattr(user, "phone_e164", None):
        try:
            from domains.operations.models import Lead, LeadActivity
            lead = Lead.objects.filter(
                mobile_number=user.phone_e164, service=slot.package.service,
                converted_booking__isnull=True,
            ).exclude(status__in=["CONVERTED", "LOST", "CANCELLED"]).order_by("-created_at").first()
            if lead:
                lead.converted_booking = booking
                lead.status = "CONVERTED"
                lead.save(update_fields=["converted_booking", "status", "updated_at"])
                LeadActivity.objects.create(lead=lead, actor=user, kind="LINKED_TO_BOOKING",
                    detail={"booking_id": str(booking.id), "booking_reference": booking.reference})
        except Exception:
            pass
    return booking, True


@transaction.atomic
def cancel_booking(user, booking_id, expected_version, reason, actor=None):
    from domains.operations.models import DispatchAttempt
    from domains.technicians.models import JobAssignment, JobOffer, JobStatusEvent
    from domains.technicians.services import notify
    booking_ref = Booking.objects.filter(id=booking_id, user=user).values("slot_id").first()
    if not booking_ref:
        raise ValidationError("Booking not found.")
    AppointmentSlot.objects.select_for_update().get(id=booking_ref["slot_id"])
    booking = Booking.objects.select_for_update().select_related("price_snapshot").get(id=booking_id, user=user)
    if booking.version != expected_version or booking.status != "CONFIRMED_UNPAID":
        raise Conflict("Booking state changed. Refresh its details.")
    require_transition(booking.status, "CANCELLED")
    cutoff = booking.price_snapshot.cancellation_cutoff_minutes
    if cutoff is None or booking.payment_status != "UNPAID":
        raise Conflict("Online cancellation is not configured for this booking.")
    if booking.slot.start_at <= timezone.now() + timedelta(minutes=cutoff):
        raise Conflict("The cancellation window has closed.")
    booking.status = "CANCELLED"
    booking.version += 1
    booking.save(update_fields=["status", "version", "updated_at"])
    JobOffer.objects.filter(booking=booking, status="OFFERED").update(status="WITHDRAWN")
    DispatchAttempt.objects.filter(booking=booking, status="OFFERED").update(status="WITHDRAWN")
    assignment = JobAssignment.objects.select_for_update().filter(booking=booking).first()
    if assignment and assignment.status != "SERVICE_COMPLETED":
        old_job_status = assignment.status
        assignment.status = "CANCELLED"
        assignment.save(update_fields=["status", "updated_at"])
        JobStatusEvent.objects.create(assignment=assignment, from_status=old_job_status,
                                      to_status="CANCELLED", actor=actor or user)
        notify(assignment.technician.user, "BOOKING_CANCELLED", booking)
    BookingStatusEvent.objects.create(booking=booking, from_status="CONFIRMED_UNPAID",
                                       to_status="CANCELLED", actor=actor or user, reason=reason)
    OutboxEvent.objects.create(event_type="BOOKING_CANCELLED", aggregate_id=booking.id,
                               payload={"booking_id": str(booking.id)})
    AuditLog.objects.create(actor=actor or user, action="BOOKING_CANCELLED", resource_type="Booking",
                            resource_id=str(booking.id))
    return booking


@transaction.atomic
def reschedule_booking(user, booking_id, new_hold_id, expected_version, actor=None):
    booking_ref = Booking.objects.filter(id=booking_id, user=user).values("slot_id").first()
    hold_ref = SlotHold.objects.filter(id=new_hold_id, user=user).values("slot_id").first()
    if not booking_ref or not hold_ref:
        raise ValidationError("Booking or reservation not found.")
    if booking_ref["slot_id"] == hold_ref["slot_id"]:
        raise ValidationError("Choose a different appointment.")
    for slot_id in sorted([booking_ref["slot_id"], hold_ref["slot_id"]]):
        AppointmentSlot.objects.select_for_update().get(id=slot_id)
    booking = Booking.objects.select_for_update().select_related("price_snapshot", "slot").get(id=booking_id, user=user)
    if booking.technician_offers.filter(status="OFFERED").exists() or hasattr(booking, "technician_assignment"):
        raise Conflict("Contact support to reschedule a job already offered to a technician.")
    hold = SlotHold.objects.select_for_update().select_related("slot__package", "address").get(id=new_hold_id, user=user)
    _live_hold(hold, user)
    if booking.version != expected_version or booking.status != "CONFIRMED_UNPAID":
        raise Conflict("Booking state changed. Refresh its details.")
    require_transition(booking.status, "CONFIRMED_UNPAID")
    cutoff = booking.price_snapshot.reschedule_cutoff_minutes
    if cutoff is None or booking.payment_status != "UNPAID":
        raise Conflict("Online rescheduling is not configured for this booking.")
    if booking.slot.start_at <= timezone.now() + timedelta(minutes=cutoff):
        raise Conflict("The rescheduling window has closed.")
    zone = serviceable(hold.slot.package, hold.address)
    if (not zone or zone.id != hold.slot.zone_id or hold.slot.package_id != booking.package_id
            or hold.address_id != booking.address_id or zone.id != booking.slot.zone_id
            or not hold.slot.is_active or hold.slot.is_blackout):
        raise Conflict("The new appointment is no longer available for this service and address.")
    if settings.PILOT_ENABLED:
        Zone.objects.select_for_update().get(id=zone.id)
    occupied = occupied_bookings(hold.slot, timezone.now())
    other_holds = SlotHold.objects.filter(slot=hold.slot, status="ACTIVE", expires_at__gt=timezone.now()).exclude(
        id=hold.id).count()
    if occupied + other_holds >= hold.slot.capacity:
        raise Conflict("The new appointment was just taken. Choose another time.")
    if settings.PILOT_ENABLED and pilot_remaining(hold.slot, timezone.now(),
            exclude_hold_id=hold.id, exclude_booking_id=booking.id) <= 0:
        raise Conflict("The pilot has reached its daily booking limit.")
    old_slot = booking.slot
    booking.slot = hold.slot
    booking.address = hold.address
    booking.version += 1
    booking.save(update_fields=["slot", "address", "version", "updated_at"])
    hold.status = "CONSUMED"
    hold.save(update_fields=["status", "updated_at"])
    BookingStatusEvent.objects.create(booking=booking, from_status="CONFIRMED_UNPAID",
                                       to_status="CONFIRMED_UNPAID", actor=actor or user,
                                       reason=f"Rescheduled from {old_slot.start_at.isoformat()}")
    OutboxEvent.objects.create(event_type="BOOKING_RESCHEDULED", aggregate_id=booking.id,
                               payload={"booking_id": str(booking.id)})
    AuditLog.objects.create(actor=actor or user, action="BOOKING_RESCHEDULED", resource_type="Booking",
                            resource_id=str(booking.id))
    return booking
