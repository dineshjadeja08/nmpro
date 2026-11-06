from datetime import timedelta
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.bookings.models import AppointmentSlot, Booking, SlotHold
from domains.bookings.services import (
    available_slots,
    cancel_booking,
    create_hold,
    occupied_bookings,
    reschedule_booking,
)
from domains.notifications.models import Notification
from domains.technicians.models import JobAssignment, TechnicianProfile
from domains.technicians.services import JobConflict

from .models import (
    DispatchAttempt,
    DispatchRule,
    OperationalEscalation,
    OperationsGrant,
    Lead,
    LeadFollowUp,
    OperationsZoneGrant,
    OperatorNote,
    SLABreach,
    SLAPolicy,
    SLATracker,
    SupportTicket,
    SupportTicketEvent,
)
from .services import active_rule, alert, assign_job, log, offer_job, ranked_candidates, require_role


def paging(request):
    page = serializers.IntegerField(min_value=1, max_value=100000).run_validation(request.query_params.get("page", 1))
    return page, 20


def paged(request, queryset, serializer):
    page, size = paging(request)
    return Response({"count": queryset.count(), "page": page,
                     "results": [serializer(row) for row in queryset[(page - 1) * size:page * size]]})


def dates(request):
    start = parse_date(request.query_params.get("start", ""))
    end = parse_date(request.query_params.get("end", ""))
    if (request.query_params.get("start") and not start) or (request.query_params.get("end") and not end):
        raise serializers.ValidationError("Use YYYY-MM-DD dates.")
    if start and end and end < start:
        raise serializers.ValidationError("End date must follow start date.")
    return start, end


def booking_query(request):
    start, end = dates(request)
    qs = Booking.objects.filter(slot__isnull=False, package__isnull=False, address__isnull=False,
        status__in=["AWAITING_PAYMENT", "CONFIRMED", "CONFIRMED_UNPAID", "CANCELLED", "EXPIRED"])
    if start:
        qs = qs.filter(slot__start_at__date__gte=start)
    if end:
        qs = qs.filter(slot__start_at__date__lte=end)
    for param, lookup in (("status", "status"), ("payment_status", "payment_status"),
                          ("service", "service_id"), ("zone", "slot__zone_id"),
                          ("technician", "technician_assignment__technician_id")):
        if request.query_params.get(param):
            value = request.query_params[param]
            if param in ("service", "zone", "technician"):
                value = serializers.UUIDField().run_validation(value)
            qs = qs.filter(**{lookup: value})
    if request.query_params.get("q"):
        qs = qs.filter(reference__icontains=request.query_params["q"][:40])
    for param, lookup in (("service_name", "service__name__icontains"),
                          ("zone_name", "slot__zone__name__icontains"),
                          ("technician_name", "technician_assignment__technician__display_name__icontains")):
        if request.query_params.get(param):
            qs = qs.filter(**{lookup: request.query_params[param][:80]})
    sort = request.query_params.get("sort", "-created_at")
    if sort not in ("-created_at", "created_at", "slot__start_at", "-slot__start_at"):
        raise serializers.ValidationError("Invalid sort order.")
    return qs.select_related("user", "service", "package", "address", "slot__zone", "price_snapshot",
                             "technician_assignment__technician").annotate(urgent_escalation=Exists(
                             OperationalEscalation.objects.filter(booking_id=OuterRef("pk"), priority="URGENT",
                                 status__in=["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"]))).order_by(sort, "id")


def booking_data(b):
    assignment = getattr(b, "technician_assignment", None)
    return {"id": str(b.id), "reference": b.reference, "version": b.version, "status": b.status,
        "payment_status": b.payment_status, "customer_id": b.user_id, "customer_phone": b.user.phone_e164,
        "customer_name": b.address.contact_name, "service": b.service.name, "package": b.package.name,
        "service_id": str(b.service_id), "zone_id": str(b.slot.zone_id), "zone": b.slot.zone.name,
        "start_at": b.slot.start_at, "end_at": b.slot.end_at,
        "address": {"line_1": b.address.line_1, "locality": b.address.locality,
                    "city": b.address.city, "postal_code": b.address.postal_code},
        "price_paise": b.price_snapshot.total_paise if hasattr(b, "price_snapshot") else None,
        "price_lines": b.price_snapshot.lines if hasattr(b, "price_snapshot") else [],
        "priority": "URGENT" if getattr(b, "urgent_escalation", False) else "NORMAL",
        "technician": {"id": str(assignment.technician_id), "name": assignment.technician.display_name,
                       "status": assignment.status} if assignment else None}


def ticket_data(t):
    return {"id": str(t.id), "reference": t.reference, "customer_id": t.customer_id,
        "booking_id": str(t.booking_id) if t.booking_id else None, "category": t.category,
        "priority": t.priority, "subject": t.subject, "description": t.description,
        "status": t.status, "assigned_to": t.assigned_to_id, "created_at": t.created_at,
        "updated_at": t.updated_at}


def escalation_data(e):
    return {"id": str(e.id), "booking_id": str(e.booking_id) if e.booking_id else None,
        "ticket_id": str(e.ticket_id) if e.ticket_id else None, "category": e.category,
        "priority": e.priority, "status": e.status, "assigned_to": e.assigned_to_id,
        "notes": e.notes, "resolution": e.resolution, "created_at": e.created_at}


class OperationsDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        start, end = dates(request)
        today = timezone.localdate()
        start = start or today
        end = end or start
        bookings = Booking.objects.filter(slot__start_at__date__gte=start, slot__start_at__date__lte=end,
            status__in=["CONFIRMED", "CONFIRMED_UNPAID", "CANCELLED"])
        summary = bookings.aggregate(total=Count("id"), cancelled=Count("id", filter=Q(status="CANCELLED")),
            unassigned=Count("id", filter=Q(technician_assignment__isnull=True,
                status__in=["CONFIRMED", "CONFIRMED_UNPAID"])),
            completed=Count("id", filter=Q(technician_assignment__status="SERVICE_COMPLETED")),
            active=Count("id", filter=Q(technician_assignment__status__in=["ASSIGNED", "EN_ROUTE", "ARRIVED", "INSPECTING", "AWAITING_QUOTATION_APPROVAL", "IN_PROGRESS"])))
        summary.update({"pending_assignments": summary["unassigned"],
            "overdue_jobs": bookings.filter(slot__end_at__lt=timezone.now(),
                technician_assignment__isnull=False).exclude(technician_assignment__status__in=["SERVICE_COMPLETED", "CANCELLED"]).count(),
            "available_technicians": TechnicianProfile.objects.filter(verification_status="VERIFIED", is_active=True, is_online=True).count(),
            "open_tickets": SupportTicket.objects.exclude(status__in=["RESOLVED", "CLOSED"]).count(),
            "sla_breaches": SLATracker.objects.filter(state="BREACHED").count()})
        lead_scope = Lead.objects.all()
        zone_ids = list(OperationsZoneGrant.objects.filter(user=request.user).values_list("zone_id", flat=True))
        if zone_ids and not request.user.admin_roles.filter(role="SUPER_ADMIN").exists() and not OperationsGrant.objects.filter(user=request.user, role="SUPER_ADMIN").exists():
            lead_scope = lead_scope.filter(zone_id__in=zone_ids)
        summary["new_leads"] = lead_scope.filter(status="NEW").count()
        summary["follow_ups_due"] = LeadFollowUp.objects.filter(lead__in=lead_scope,
            completed_at__isnull=True, due_at__lte=timezone.now()).count()
        recent = booking_query(request).filter(slot__start_at__date__gte=start,
            slot__start_at__date__lte=end)[:10]
        upcoming = booking_query(request).filter(slot__start_at__gte=timezone.now(),
            status__in=["CONFIRMED", "CONFIRMED_UNPAID"]).order_by("slot__start_at")[:10]
        now = timezone.now()
        sla_warnings = [{"code": t.policy.code, "deadline_at": t.deadline_at,
                         "booking_id": str(t.booking_id) if t.booking_id else None}
                        for t in SLATracker.objects.filter(state="OPEN", deadline_at__gte=now).select_related("policy").order_by("deadline_at")[:100]
                        if t.deadline_at <= now + timedelta(minutes=t.policy.warning_minutes)][:10]
        return Response({"start": start, "end": end, "metrics": summary,
            "recent_bookings": [booking_data(b) for b in recent],
            "upcoming_appointments": [booking_data(b) for b in upcoming],
            "alerts": [{"event": n.event, "reference": n.payload.get("booking_reference", ""),
                         "created_at": n.created_at} for n in Notification.objects.filter(
                         recipient=request.user, channel="NONE").order_by("-created_at")[:10]],
            "sla_warnings": sla_warnings,
            "urgent_escalations": [escalation_data(e) for e in OperationalEscalation.objects.filter(
                status__in=["OPEN", "ACKNOWLEDGED"], priority="URGENT").order_by("-created_at")[:5]],
            "distribution": list(bookings.values("status").annotate(count=Count("id")).order_by("status"))})


class OperationsBookingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        return paged(request, booking_query(request), booking_data)


class OperationsBookingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        b = get_object_or_404(booking_query(request).prefetch_related("events", "operator_notes__author"), id=booking_id)
        data = booking_data(b)
        data["timeline"] = [{"status": e.to_status, "at": e.created_at, "reason": e.reason} for e in b.events.all()]
        data["notes"] = [{"id": str(n.id), "text": n.text, "at": n.created_at} for n in b.operator_notes.all()]
        data["support"] = [ticket_data(t) for t in SupportTicket.objects.filter(booking=b).order_by("-created_at")[:20]]
        return Response(data)


class OperationsBookingSlotsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        booking = get_object_or_404(Booking.objects.select_related("package__service__category", "address"), id=booking_id)
        now = timezone.now()
        return Response({"slots": available_slots(booking.package, booking.address, now, now + timedelta(days=14))})


class DispatchInput(serializers.Serializer):
    technician_id = serializers.UUIDField()
    expected_version = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(max_length=240, allow_blank=True, required=False)


class OperationsBookingActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id, action):
        if action in ("assign", "reassign", "offer"):
            data = DispatchInput(data=request.data)
            data.is_valid(raise_exception=True)
            values = data.validated_data
            if action == "offer":
                offer = offer_job(request.user, booking_id, values["technician_id"], values["expected_version"])
                return Response({"id": str(offer.id), "status": offer.status})
            assignment = assign_job(request.user, booking_id, values["technician_id"],
                values["expected_version"], values.get("reason", ""), reassign=action == "reassign")
            return Response({"id": str(assignment.id), "status": assignment.status})
        if action == "cancel":
            require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER")
            version = serializers.IntegerField(min_value=1).run_validation(request.data.get("expected_version"))
            reason = serializers.CharField(max_length=240).run_validation(request.data.get("reason"))
            booking = get_object_or_404(Booking, id=booking_id)
            cancelled = cancel_booking(booking.user, booking.id, version, reason, actor=request.user)
            return Response({"status": cancelled.status, "version": cancelled.version})
        if action == "reschedule":
            require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER")
            version = serializers.IntegerField(min_value=1).run_validation(request.data.get("expected_version"))
            slot_id = serializers.UUIDField().run_validation(request.data.get("slot_id"))
            with transaction.atomic():
                booking = get_object_or_404(Booking.objects.select_related("user", "package", "address", "slot"), id=booking_id)
                if not booking.slot_id or booking.status != "CONFIRMED_UNPAID":
                    raise serializers.ValidationError("Only active unpaid bookings can be rescheduled here.")
                for sid in sorted([booking.slot_id, slot_id]):
                    get_object_or_404(AppointmentSlot.objects.select_for_update(), id=sid)
                hold = create_hold(booking.user, booking.package, booking.address, slot_id)
                moved = reschedule_booking(booking.user, booking.id, hold.id, version, actor=request.user)
            return Response({"status": moved.status, "version": moved.version})
        raise Http404()


class OperationsNotesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        require_role(request.user, "SUPPORT_AGENT", "DISPATCH_OPERATOR", "OPERATIONS_MANAGER")
        text = serializers.CharField(max_length=2000).run_validation(request.data.get("text"))
        booking = get_object_or_404(Booking, id=booking_id)
        note = OperatorNote.objects.create(booking=booking, author=request.user, text=text)
        log(request.user, "OPERATOR_NOTE_ADDED", "OperatorNote", note.id)
        return Response({"id": str(note.id)}, status=201)


class OperationsDispatchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        bookings = booking_query(request).filter(status__in=["CONFIRMED", "CONFIRMED_UNPAID"]).prefetch_related("technician_offers")
        groups = {key: [] for key in ("UNASSIGNED", "OFFERED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "EXCEPTIONS")}
        for b in bookings[:100]:
            assignment = getattr(b, "technician_assignment", None)
            if assignment:
                key = "COMPLETED" if assignment.status == "SERVICE_COMPLETED" else "ASSIGNED" if assignment.status in ("ASSIGNED", "EN_ROUTE") else "IN_PROGRESS"
            elif any(o.status == "OFFERED" for o in b.technician_offers.all()):
                key = "OFFERED"
            else:
                key = "UNASSIGNED"
            if b.slot.end_at < timezone.now() and key != "COMPLETED":
                key = "EXCEPTIONS"
            groups[key].append(booking_data(b))
        return Response({"groups": groups, "rule": rule_data(active_rule())})


def rule_data(rule):
    return {"id": str(rule.id), "name": rule.name, "is_active": rule.is_active,
        "automatic_enabled": rule.automatic_enabled, "offer_timeout_minutes": rule.offer_timeout_minutes,
        "maximum_attempts": rule.maximum_attempts, "travel_buffer_minutes": rule.travel_buffer_minutes,
        "weight_workload": rule.weight_workload, "weight_availability": rule.weight_availability} if rule else None


class OperationsCandidatesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "OPERATIONS_MANAGER")
        booking_id = serializers.UUIDField().run_validation(request.query_params.get("booking_id"))
        booking = get_object_or_404(Booking.objects.select_related("slot__zone", "package"), id=booking_id)
        return Response({"candidates": ranked_candidates(booking), "rule": rule_data(active_rule())})


class OperationsAttemptsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "OPERATIONS_MANAGER")
        booking_id = serializers.UUIDField().run_validation(request.query_params.get("booking_id"))
        attempts = DispatchAttempt.objects.filter(booking_id=booking_id).select_related("offer", "technician").order_by("-created_at")
        return Response({"attempts": [{"id": str(a.id), "technician": a.technician.display_name,
            "status": a.offer.status if a.offer else a.status, "mode": a.mode,
            "created_at": a.created_at} for a in attempts]})

    def post(self, request):
        data = DispatchInput(data=request.data)
        data.is_valid(raise_exception=True)
        booking_id = serializers.UUIDField().run_validation(request.data.get("booking_id"))
        offer = offer_job(request.user, booking_id, data.validated_data["technician_id"],
                          data.validated_data["expected_version"])
        return Response({"id": str(offer.id), "status": offer.status}, status=201)


class OperationsTechniciansView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "OPERATIONS_MANAGER")
        qs = TechnicianProfile.objects.select_related("user").prefetch_related("skills", "zones__zone").annotate(
            active_job_count=Count("assignments", filter=~Q(assignments__status__in=["SERVICE_COMPLETED", "CANCELLED"]), distinct=True)).order_by("display_name")
        if request.query_params.get("q"):
            qs = qs.filter(display_name__icontains=request.query_params["q"][:80])
        return paged(request, qs, technician_data)


def technician_data(p):
    return {"id": str(p.id), "name": p.display_name, "status": p.verification_status,
        "online": p.is_online, "skills": [s.code for s in p.skills.all() if s.is_verified],
        "zones": [z.zone.name for z in p.zones.all()],
        "active_jobs": getattr(p, "active_job_count", None) if getattr(p, "active_job_count", None) is not None else p.assignments.exclude(status__in=["SERVICE_COMPLETED", "CANCELLED"]).count()}


class OperationsTechnicianView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, technician_id):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "OPERATIONS_MANAGER")
        p = get_object_or_404(TechnicianProfile.objects.prefetch_related("skills", "zones__zone", "weekly_availability", "time_off"), id=technician_id)
        result = technician_data(p)
        result["availability"] = list(p.weekly_availability.values("weekday", "start_minute", "end_minute"))
        result["time_off"] = list(p.time_off.values("start_at", "end_at", "reason"))
        result["jobs"] = [{"booking_id": str(a.booking_id), "status": a.status,
            "start_at": a.booking.slot.start_at} for a in p.assignments.select_related("booking__slot").order_by("-assigned_at")[:30]]
        result["notes"] = [{"text": n.text, "at": n.created_at} for n in p.operator_notes.order_by("-created_at")[:20]]
        return Response(result)


class OperationsTechnicianNotesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, technician_id):
        require_role(request.user, "DISPATCH_OPERATOR", "OPERATIONS_MANAGER")
        text = serializers.CharField(max_length=2000).run_validation(request.data.get("text"))
        technician = get_object_or_404(TechnicianProfile, id=technician_id)
        note = OperatorNote.objects.create(technician=technician, author=request.user, text=text)
        log(request.user, "TECHNICIAN_OPERATOR_NOTE_ADDED", "OperatorNote", note.id)
        return Response({"id": str(note.id)}, status=201)


class OperationsScheduleView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        start, end = dates(request)
        start = start or timezone.localdate()
        end = end or start + timedelta(days=6)
        qs = booking_query(request).filter(slot__start_at__date__gte=start, slot__start_at__date__lte=end)
        bookings = [booking_data(b) for b in qs[:200]]
        conflicts = []
        for i, first in enumerate(bookings):
            if not first["technician"]:
                continue
            for second in bookings[i + 1:]:
                if (second["technician"] and first["technician"]["id"] == second["technician"]["id"]
                        and first["start_at"] < second["end_at"] and second["start_at"] < first["end_at"]):
                    conflicts.append({"first": first["reference"], "second": second["reference"]})
        now = timezone.now()
        slots = AppointmentSlot.objects.filter(is_active=True, is_blackout=False,
            start_at__date__gte=start, start_at__date__lte=end).select_related("zone", "package").order_by("start_at")[:100]
        available = []
        for slot in slots:
            remaining = slot.capacity - occupied_bookings(slot, now) - SlotHold.objects.filter(
                slot=slot, status="ACTIVE", expires_at__gt=now).count()
            if remaining > 0:
                available.append({"id": str(slot.id), "start_at": slot.start_at,
                    "zone": slot.zone.name, "package": slot.package.name, "remaining": remaining})
        return Response({"start": start, "end": end, "bookings": bookings,
            "available_slots": available, "conflicts": conflicts})


class OperationsCustomersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER", "OPERATIONS_VIEWER")
        qs = get_user_model().objects.filter(booking__isnull=False).annotate(booking_count=Count("booking", distinct=True)).distinct().order_by("id")
        if request.query_params.get("q"):
            qs = qs.filter(phone_e164__icontains=request.query_params["q"][:20])
        return paged(request, qs, lambda u: {"id": u.id, "phone": u.phone_e164,
            "bookings": u.booking_count})


class OperationsCustomerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, customer_id):
        require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER", "OPERATIONS_VIEWER")
        user = get_object_or_404(get_user_model().objects.filter(booking__isnull=False).distinct(), id=customer_id)
        bookings = Booking.objects.filter(user=user, slot__isnull=False).select_related(
            "user", "service", "package", "address", "slot__zone", "price_snapshot", "technician_assignment__technician").order_by("-created_at")[:30]
        return Response({"id": user.id, "phone": user.phone_e164,
            "bookings": [booking_data(b) for b in bookings],
            "tickets": [ticket_data(t) for t in SupportTicket.objects.filter(customer=user).order_by("-created_at")[:30]]})


class TicketInput(serializers.Serializer):
    customer_id = serializers.IntegerField(min_value=1)
    booking_id = serializers.UUIDField(required=False)
    category = serializers.CharField(max_length=40)
    priority = serializers.ChoiceField(choices=["LOW", "NORMAL", "HIGH", "URGENT"], default="NORMAL")
    subject = serializers.CharField(max_length=180)
    description = serializers.CharField(max_length=4000)


class OperationsSupportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER", "OPERATIONS_VIEWER")
        qs = SupportTicket.objects.select_related("customer", "booking").order_by("-created_at")
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("q"):
            qs = qs.filter(Q(reference__icontains=request.query_params["q"][:80]) |
                           Q(subject__icontains=request.query_params["q"][:80]))
        return paged(request, qs, ticket_data)

    def post(self, request):
        require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        data = TicketInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        customer = get_object_or_404(get_user_model().objects.filter(booking__isnull=False).distinct(), id=v["customer_id"])
        booking = get_object_or_404(Booking, id=v["booking_id"], user=customer) if v.get("booking_id") else None
        ticket = SupportTicket.objects.create(customer=customer, booking=booking, category=v["category"],
            priority=v["priority"], subject=v["subject"], description=v["description"],
            reference=f"SUP-{uuid4().hex[:12].upper()}")
        log(request.user, "SUPPORT_TICKET_CREATED", "SupportTicket", ticket.id)
        for user_id in OperationsGrant.objects.filter(role__in=["SUPPORT_AGENT", "OPERATIONS_MANAGER", "SUPER_ADMIN"]).values_list("user_id", flat=True).distinct():
            alert(get_user_model().objects.get(id=user_id), "SUPPORT_TICKET_CREATED", booking, ticket.reference)
        return Response(ticket_data(ticket), status=201)


class TicketUpdate(serializers.Serializer):
    status = serializers.ChoiceField(choices=["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED"], required=False)
    assigned_to = serializers.IntegerField(min_value=1, required=False)
    note = serializers.CharField(max_length=2000, required=False)
    communication = serializers.CharField(max_length=2000, required=False)


class OperationsSupportDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, ticket_id):
        require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER", "OPERATIONS_VIEWER")
        ticket = get_object_or_404(SupportTicket.objects.prefetch_related("events"), id=ticket_id)
        result = ticket_data(ticket)
        result["events"] = [{"kind": e.kind, "text": e.text, "from_status": e.from_status,
                              "to_status": e.to_status, "created_at": e.created_at} for e in ticket.events.all()]
        return Response(result)

    def patch(self, request, ticket_id):
        require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        data = TicketUpdate(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            ticket = get_object_or_404(SupportTicket.objects.select_for_update(), id=ticket_id)
            values = data.validated_data
            if "assigned_to" in values:
                user = get_object_or_404(get_user_model(), id=values["assigned_to"])
                require_role(user, "SUPPORT_AGENT", "OPERATIONS_MANAGER")
                ticket.assigned_to = user
                SupportTicketEvent.objects.create(ticket=ticket, actor=request.user, kind="ASSIGNMENT",
                    text=f"Assigned to operator {user.id}")
            if "status" in values and values["status"] != ticket.status:
                old = ticket.status
                ticket.status = values["status"]
                ticket.resolved_at = timezone.now() if ticket.status in ("RESOLVED", "CLOSED") else None
                SupportTicketEvent.objects.create(ticket=ticket, actor=request.user, kind="STATUS",
                    from_status=old, to_status=ticket.status)
            for key, kind in (("note", "NOTE"), ("communication", "COMMUNICATION")):
                if values.get(key):
                    SupportTicketEvent.objects.create(ticket=ticket, actor=request.user, kind=kind, text=values[key])
            ticket.save()
            log(request.user, "SUPPORT_TICKET_UPDATED", "SupportTicket", ticket.id)
        return Response(ticket_data(ticket))


class EscalationInput(serializers.Serializer):
    booking_id = serializers.UUIDField(required=False)
    ticket_id = serializers.UUIDField(required=False)
    category = serializers.ChoiceField(choices=["TECHNICIAN_UNAVAILABLE", "TECHNICIAN_LATE", "CUSTOMER_UNAVAILABLE", "SERVICE_DISPUTE", "PAYMENT_ISSUE", "QUOTATION_DISPUTE", "CUSTOMER_COMPLAINT", "TECHNICAL_ISSUE"])
    priority = serializers.ChoiceField(choices=["NORMAL", "HIGH", "URGENT"], default="NORMAL")
    notes = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class OperationsEscalationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        qs = OperationalEscalation.objects.order_by("-created_at")
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        return paged(request, qs, escalation_data)

    def post(self, request):
        require_role(request.user, "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        data = EscalationInput(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if not v.get("booking_id") and not v.get("ticket_id"):
            raise serializers.ValidationError("Select a booking or ticket.")
        booking = get_object_or_404(Booking, id=v["booking_id"]) if v.get("booking_id") else None
        ticket = get_object_or_404(SupportTicket, id=v["ticket_id"]) if v.get("ticket_id") else None
        if ticket and booking and ticket.booking_id != booking.id:
            raise serializers.ValidationError("Ticket and booking must match.")
        esc = OperationalEscalation.objects.create(booking=booking, ticket=ticket,
            category=v["category"], priority=v["priority"], notes=v.get("notes", ""))
        log(request.user, "ESCALATION_CREATED", "OperationalEscalation", esc.id)
        return Response(escalation_data(esc), status=201)


class EscalationUpdate(serializers.Serializer):
    status = serializers.ChoiceField(choices=["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED"], required=False)
    assigned_to = serializers.IntegerField(min_value=1, required=False)
    notes = serializers.CharField(max_length=2000, allow_blank=True, required=False)
    resolution = serializers.CharField(max_length=2000, allow_blank=True, required=False)


class OperationsEscalationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, escalation_id):
        require_role(request.user, "OPERATIONS_MANAGER")
        data = EscalationUpdate(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            esc = get_object_or_404(OperationalEscalation.objects.select_for_update(), id=escalation_id)
            v = data.validated_data
            if "assigned_to" in v:
                operator = get_object_or_404(get_user_model(), id=v["assigned_to"])
                require_role(operator, "OPERATIONS_MANAGER", "SUPPORT_AGENT", "DISPATCH_OPERATOR")
                if esc.assigned_to_id != operator.id:
                    alert(operator, "ESCALATION_ASSIGNED", esc.booking)
                esc.assigned_to = operator
            for key in ("status", "notes", "resolution"):
                if key in v:
                    setattr(esc, key, v[key])
            if esc.status in ("RESOLVED", "CLOSED") and not esc.resolution:
                raise serializers.ValidationError("A resolution is required.")
            esc.resolved_at = timezone.now() if esc.status in ("RESOLVED", "CLOSED") else None
            esc.save()
            log(request.user, "ESCALATION_UPDATED", "OperationalEscalation", esc.id)
        return Response(escalation_data(esc))


class OperationsReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "OPERATIONS_MANAGER")
        start, end = dates(request)
        start = start or timezone.localdate() - timedelta(days=30)
        end = end or timezone.localdate()
        if end < start:
            raise serializers.ValidationError("End date must follow start date.")
        if (end - start).days > 366:
            raise serializers.ValidationError("Reports are limited to one year per request.")
        bookings = Booking.objects.filter(created_at__date__gte=start, created_at__date__lte=end,
            status__in=["CONFIRMED", "CONFIRMED_UNPAID", "CANCELLED"])
        total = bookings.count()
        technicians = TechnicianProfile.objects.filter(verification_status="VERIFIED").prefetch_related(
            "weekly_availability", Prefetch("assignments", queryset=JobAssignment.objects.filter(
                status="SERVICE_COMPLETED", booking__slot__start_at__date__gte=start,
                booking__slot__start_at__date__lte=end).select_related("booking__slot"),
                to_attr="completed_in_range")).order_by("display_name")[:50]
        utilization = []
        for technician in technicians:
            windows = list(technician.weekly_availability.all())
            days = (end - start).days + 1
            available = sum(w.end_minute - w.start_minute for offset in range(days)
                for w in windows if (start + timedelta(days=offset)).weekday() == w.weekday)
            used = sum((a.booking.slot.end_at - a.booking.slot.start_at).total_seconds() / 60
                for a in technician.completed_in_range)
            utilization.append({"id": str(technician.id), "display_name": technician.display_name,
                "completed": len(technician.completed_in_range),
                "utilization_rate": used / available if available else None})
        report = {"start": start, "end": end, "denominator": "bookings created in range, including cancelled",
            "total": total, "assignment_rate": bookings.filter(technician_assignment__isnull=False).count() / total if total else 0,
            "cancellation_rate": bookings.filter(status="CANCELLED").count() / total if total else 0,
            "completion_rate": bookings.filter(technician_assignment__status="SERVICE_COMPLETED").count() / total if total else 0,
            "by_date": list(bookings.values("created_at__date").annotate(count=Count("id")).order_by("created_at__date")),
            "by_service": list(bookings.values("service__name").annotate(count=Count("id")).order_by("-count")[:50]),
            "by_zone": list(bookings.values("slot__zone__name").annotate(count=Count("id")).order_by("-count")[:50]),
            "sla_breaches": SLABreach.objects.filter(breached_at__date__gte=start, breached_at__date__lte=end).count(),
            "support_tickets": SupportTicket.objects.filter(created_at__date__gte=start, created_at__date__lte=end).count(),
            "technician_utilization": utilization}
        if request.query_params.get("format") == "csv":
            import csv
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="operations-report.csv"'
            writer = csv.writer(response)
            writer.writerow(["date", "bookings"])
            for row in report["by_date"]:
                writer.writerow([row["created_at__date"], row["count"]])
            return response
        return Response(report)


class OperationsSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_role(request.user, "OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "SUPPORT_AGENT", "OPERATIONS_MANAGER")
        return Response({"dispatch": rule_data(active_rule()), "sla": [{"id": str(p.id), "code": p.code,
            "duration_minutes": p.duration_minutes, "warning_minutes": p.warning_minutes,
            "is_active": p.is_active} for p in SLAPolicy.objects.all()]})

    def patch(self, request):
        require_role(request.user, "OPERATIONS_MANAGER")
        kind = request.data.get("kind")
        if kind == "dispatch":
            class RuleInput(serializers.Serializer):
                name = serializers.CharField(max_length=100)
                is_active = serializers.BooleanField()
                automatic_enabled = serializers.BooleanField()
                offer_timeout_minutes = serializers.IntegerField(min_value=1, max_value=120)
                maximum_attempts = serializers.IntegerField(min_value=1, max_value=20)
                travel_buffer_minutes = serializers.IntegerField(min_value=0, max_value=240)
                weight_workload = serializers.IntegerField(min_value=0, max_value=100)
                weight_availability = serializers.IntegerField(min_value=0, max_value=100)
            data = RuleInput(data=request.data)
            data.is_valid(raise_exception=True)
            if data.validated_data["automatic_enabled"] and not data.validated_data["is_active"]:
                raise serializers.ValidationError("Automatic dispatch requires an active rule.")
            try:
                with transaction.atomic():
                    DispatchRule.objects.filter(is_active=True).update(is_active=False, automatic_enabled=False)
                    rule = DispatchRule.objects.create(**data.validated_data, updated_by=request.user)
                    log(request.user, "DISPATCH_RULE_CONFIGURED", "DispatchRule", rule.id)
            except IntegrityError as exc:
                raise JobConflict("Dispatch settings changed. Refresh and try again.") from exc
            return Response(rule_data(rule))
        if kind == "sla":
            code = serializers.ChoiceField(choices=["ASSIGNMENT", "ACKNOWLEDGEMENT", "ARRIVAL", "SUPPORT_RESPONSE"]).run_validation(request.data.get("code"))
            duration = serializers.IntegerField(min_value=1, max_value=10080).run_validation(request.data.get("duration_minutes"))
            warning = serializers.IntegerField(min_value=0, max_value=10080).run_validation(request.data.get("warning_minutes", 15))
            if warning > duration:
                raise serializers.ValidationError("Warning time cannot exceed the SLA duration.")
            enabled = serializers.BooleanField().run_validation(request.data.get("is_active", False))
            policy, _ = SLAPolicy.objects.update_or_create(code=code,
                defaults={"duration_minutes": duration, "warning_minutes": warning,
                          "is_active": enabled, "updated_by": request.user})
            log(request.user, "SLA_POLICY_CONFIGURED", "SLAPolicy", policy.id)
            return Response({"id": str(policy.id), "code": policy.code})
        raise serializers.ValidationError("Choose dispatch or SLA settings.")
