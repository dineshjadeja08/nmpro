"""Customer complaints (disputes) about a visit: price, quality, behaviour, no-show or damage.

Complaints become operations support tickets (category COMPLAINT_*), so they appear on the ops Support page.
Because the customer pays the professional directly, each complaint records the site price and what the
professional recorded as collected, so ops can see an overcharge at a glance.
"""
import secrets
from datetime import timedelta

from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.bookings.models import Booking
from domains.notifications.models import Notification, NotificationPreference

from .models import SupportTicket, SupportTicketEvent

COMPLAINT_TYPES = {
    "OVERCHARGED": ("Charged more than the price on the site", "HIGH"),
    "QUALITY": ("Work quality / problem not fixed", "NORMAL"),
    "BEHAVIOUR": ("Professional's behaviour", "HIGH"),
    "NO_SHOW": ("Professional did not come or came very late", "HIGH"),
    "DAMAGE": ("Damage to my property", "URGENT"),
    "OTHER": ("Something else", "NORMAL"),
}
COMPLAINT_WINDOW_DAYS = 30
CLOSED = ("RESOLVED", "CLOSED")


class ComplaintInput(serializers.Serializer):
    type = serializers.ChoiceField(choices=list(COMPLAINT_TYPES))
    description = serializers.CharField(min_length=10, max_length=2000)
    amount_paid_paise = serializers.IntegerField(min_value=0, max_value=100_000_000, required=False, allow_null=True)


def complaint_data(ticket):
    return {"id": str(ticket.id), "reference": ticket.reference, "type": ticket.category.replace("COMPLAINT_", ""),
            "status": ticket.status, "subject": ticket.subject, "created_at": ticket.created_at,
            "resolved_at": ticket.resolved_at,
            "updates": [{"text": e.text, "status": e.to_status, "at": e.created_at}
                        for e in ticket.events.exclude(kind="NOTE").order_by("created_at")
                        if e.actor_id != ticket.customer_id]}


class BookingComplaintsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        booking = get_object_or_404(Booking, id=booking_id, user=request.user)
        tickets = SupportTicket.objects.filter(booking=booking, category__startswith="COMPLAINT_").order_by("-created_at")
        return Response({"results": [complaint_data(t) for t in tickets],
                         "types": [{"code": k, "label": v[0]} for k, v in COMPLAINT_TYPES.items()]})

    def post(self, request, booking_id):
        data = ComplaintInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        with transaction.atomic():
            booking = get_object_or_404(Booking.objects.select_for_update().select_related("service", "slot"),
                                        id=booking_id, user=request.user)
            assignment = getattr(booking, "technician_assignment", None)
            if assignment is None and values["type"] != "NO_SHOW":
                raise serializers.ValidationError("You can report a problem once a professional is assigned.")
            if booking.slot_id and booking.slot.start_at < timezone.now() - timedelta(days=COMPLAINT_WINDOW_DAYS):
                raise serializers.ValidationError(f"Problems can be reported within {COMPLAINT_WINDOW_DAYS} days of the visit.")
            if SupportTicket.objects.filter(booking=booking, category__startswith="COMPLAINT_").exclude(status__in=CLOSED).exists():
                raise serializers.ValidationError("You already have an open complaint for this booking. We will update you there.")
            label, priority = COMPLAINT_TYPES[values["type"]]
            snapshot = getattr(booking, "price_snapshot", None)
            collected = booking.payments.filter(status="CAPTURED", payment_method__in=["CASH", "UPI"]).aggregate(
                t=Sum("amount_paise"))["t"] or 0
            advance = booking.payments.filter(status="CAPTURED", payment_method="ONLINE").aggregate(t=Sum("amount_paise"))["t"] or 0
            rupees = lambda p: f"Rs {p / 100:,.0f}"  # noqa: E731
            facts = [f"Booked price: {rupees(snapshot.total_paise)}" if snapshot else "Booked price: unknown",
                     f"Advance paid online: {rupees(advance)}",
                     f"Professional recorded as collected: {rupees(collected)}",
                     f"Professional: {assignment.technician.display_name} ({assignment.technician.user.phone_e164})"
                     if assignment else "Professional: not assigned"]
            if values.get("amount_paid_paise") is not None:
                facts.append(f"Customer says they paid the professional: {rupees(values['amount_paid_paise'])}")
                if snapshot and advance + values["amount_paid_paise"] > snapshot.total_paise:
                    facts.append("POSSIBLE OVERCHARGE: customer-reported total is above the booked price.")
                    priority = "URGENT" if priority != "URGENT" else priority
            ticket = SupportTicket.objects.create(
                reference=f"CMP-{timezone.now():%y%m%d}-{secrets.token_hex(3).upper()}", customer=request.user,
                booking=booking, category=f"COMPLAINT_{values['type']}", priority=priority,
                subject=f"{label} - {booking.reference}"[:180],
                description=(values["description"] + "\n\n--- System facts ---\n" + "\n".join(facts))[:4000])
            SupportTicketEvent.objects.create(ticket=ticket, actor=request.user, kind="NOTE", text="Complaint raised by customer")
            pref = NotificationPreference.objects.filter(user=request.user).first()
            from domains.notifications.tasks import resolve_default_channel

            Notification.objects.create(recipient=request.user, booking=booking, channel=resolve_default_channel(pref),
                                        event="COMPLAINT_RECEIVED", template_key="COMPLAINT_RECEIVED",
                                        payload={"booking_reference": booking.reference,
                                                 "complaint_reference": ticket.reference},
                                        status="BLOCKED_CONFIGURATION")
        return Response(complaint_data(ticket), status=201)
