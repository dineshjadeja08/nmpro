import secrets

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.sequences import next_work_order_reference
from domains.bookings.models import (
    AppointmentSlot,
    Booking,
    BookingItem,
    BookingPriceSnapshot,
    BookingStatusEvent,
    ScheduleClosure,
)
from domains.bookings.services import Conflict, calculate_price, cancel_booking
from domains.catalog.models import PricingRule, ServicePackage
from domains.locations.models import Address, Zone
from domains.operations.models import DispatchAttempt
from domains.operations.views import booking_data, paged
from domains.payments.models import Payment
from domains.technicians.models import JobAssignment, JobOffer, JobStatusEvent, TechnicianDocument

from .rbac import require
from .services import audit


def _slot_data(slot):
    return {
        "id": str(slot.id),
        "zone_id": str(slot.zone_id),
        "zone": slot.zone.name,
        "package_id": str(slot.package_id),
        "package": slot.package.name,
        "start_at": slot.start_at,
        "end_at": slot.end_at,
        "capacity": slot.capacity,
        "minimum_lead_minutes": slot.minimum_lead_minutes,
        "is_active": slot.is_active,
        "is_blackout": slot.is_blackout,
    }


class AdminTimeSlotsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = AppointmentSlot.objects.select_related("zone", "package").order_by("start_at")
        if request.query_params.get("zone_id"):
            qs = qs.filter(zone_id=request.query_params["zone_id"])
        if request.query_params.get("package_id"):
            qs = qs.filter(package_id=request.query_params["package_id"])
        return paged(request, qs, _slot_data)

    def post(self, request):
        require(request.user, "MANAGE_SERVICES")
        zone = get_object_or_404(Zone, id=serializers.UUIDField().run_validation(request.data.get("zone_id")))
        package = get_object_or_404(ServicePackage, id=serializers.UUIDField().run_validation(request.data.get("package_id")))
        start_at = serializers.DateTimeField().run_validation(request.data.get("start_at"))
        end_at = serializers.DateTimeField().run_validation(request.data.get("end_at"))
        if end_at <= start_at:
            raise serializers.ValidationError("end_at must follow start_at.")
        capacity = serializers.IntegerField(min_value=1, max_value=500).run_validation(request.data.get("capacity", 1))
        slot = AppointmentSlot.objects.create(
            zone=zone,
            package=package,
            start_at=start_at,
            end_at=end_at,
            capacity=capacity,
            minimum_lead_minutes=int(request.data.get("minimum_lead_minutes", 0)),
            is_active=bool(request.data.get("is_active", True)),
            is_blackout=bool(request.data.get("is_blackout", False)),
        )
        audit(request.user, "TIME_SLOT_CREATED", "AppointmentSlot", slot.id, request=request)
        return Response(_slot_data(slot), status=201)


class AdminTimeSlotDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, slot_id):
        require(request.user, "MANAGE_SERVICES")
        slot = get_object_or_404(AppointmentSlot.objects.select_related("zone", "package"), id=slot_id)
        for field in ("capacity", "minimum_lead_minutes", "is_active", "is_blackout"):
            if field in request.data:
                setattr(slot, field, request.data[field])
        slot.version += 1
        slot.save()
        audit(request.user, "TIME_SLOT_UPDATED", "AppointmentSlot", slot.id, request=request)
        return Response(_slot_data(slot))

    def delete(self, request, slot_id):
        require(request.user, "MANAGE_SERVICES")
        slot = get_object_or_404(AppointmentSlot, id=slot_id)
        if Booking.objects.filter(slot=slot).exists():
            slot.is_active = False
            slot.save(update_fields=["is_active", "updated_at"])
        else:
            slot.delete()
        return Response(status=204)


def _closure_data(c):
    return {
        "id": str(c.id),
        "zone_id": str(c.zone_id) if c.zone_id else None,
        "zone": c.zone.name if c.zone else "All zones",
        "start_at": c.start_at,
        "end_at": c.end_at,
        "reason": c.reason,
        "is_active": c.is_active,
        "created_at": c.created_at,
    }


class AdminScheduleClosuresView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = ScheduleClosure.objects.select_related("zone").order_by("-start_at")
        return paged(request, qs, _closure_data)

    def post(self, request):
        require(request.user, "MANAGE_SERVICES")
        start_at = serializers.DateTimeField().run_validation(request.data.get("start_at"))
        end_at = serializers.DateTimeField().run_validation(request.data.get("end_at"))
        if end_at <= start_at:
            raise serializers.ValidationError("end_at must follow start_at.")
        zone = get_object_or_404(Zone, id=request.data["zone_id"]) if request.data.get("zone_id") else None
        reason = serializers.CharField(max_length=240, allow_blank=True, required=False).run_validation(request.data.get("reason", ""))
        closure = ScheduleClosure.objects.create(
            zone=zone, start_at=start_at, end_at=end_at, reason=reason,
            is_active=bool(request.data.get("is_active", True)), created_by=request.user,
        )
        audit(request.user, "SCHEDULE_CLOSURE_CREATED", "ScheduleClosure", closure.id, {"reason": reason}, request=request)
        return Response(_closure_data(closure), status=201)


class AdminScheduleClosureDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, closure_id):
        require(request.user, "MANAGE_SERVICES")
        closure = get_object_or_404(ScheduleClosure, id=closure_id)
        cid = closure.id
        closure.delete()
        audit(request.user, "SCHEDULE_CLOSURE_DELETED", "ScheduleClosure", cid, request=request)
        return Response(status=204)


class AdminWorkOrdersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = Booking.objects.filter(
            Q(is_manual_work_order=True) | Q(payment_status__in=["PAID", "ADVANCE_PAID"]) | Q(status__in=["CONFIRMED", "CONFIRMED_UNPAID", "TECHNICIAN_ASSIGNED", "IN_PROGRESS", "COMPLETED", "CLOSED"])
        ).select_related("user", "service", "package", "address__zone", "slot__zone", "price_snapshot", "invoice", "technician_assignment__technician__user").order_by("-created_at")
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("q"):
            q = request.query_params["q"][:40]
            qs = qs.filter(Q(reference__icontains=q) | Q(user__customer_code__icontains=q) | Q(address__contact_name__icontains=q))
        return paged(request, qs, booking_data)

    @transaction.atomic
    def post(self, request):
        require(request.user, "VIEW_ADMIN")
        phone = serializers.RegexField(r"^\+91[6-9]\d{9}$").run_validation(request.data.get("customer_phone"))
        package = get_object_or_404(ServicePackage.objects.select_related("service"), id=serializers.UUIDField().run_validation(request.data.get("package_id")))
        slot = get_object_or_404(AppointmentSlot.objects.select_for_update().select_related("zone"), id=serializers.UUIDField().run_validation(request.data.get("slot_id")))
        User = get_user_model()
        user, _ = User.objects.get_or_create(phone_e164=phone, defaults={"username": phone, "is_active": True})
        if request.data.get("address_id"):
            address = get_object_or_404(Address, id=request.data["address_id"], user=user)
        else:
            address = Address.objects.create(
                user=user,
                zone=slot.zone,
                line_1=str(request.data.get("address", "Manual work order address"))[:200],
                house_flat=str(request.data.get("house_flat", "1"))[:80],
                street=str(request.data.get("street", "Main Street"))[:120],
                locality=str(request.data.get("locality", slot.zone.name))[:100],
                city=str(request.data.get("city", slot.zone.city.name))[:80],
                state=slot.zone.state,
                postal_code=slot.zone.postal_code,
                contact_name=str(request.data.get("customer_name", "Customer"))[:100],
                contact_phone=phone,
            )
        rule = PricingRule.objects.filter(package=package, zone=slot.zone, is_active=True).first()
        if rule:
            lines, total = calculate_price(rule)
            policy = rule.payment_policy
            rule_id, version = rule.id, rule.version
        else:
            total = int(request.data.get("total_paise", 0))
            lines = [{"code": "BASE", "amount_paise": total}]
            policy = "PAY_AT_VISIT"
            rule_id, version = package.id, 1
        booking = Booking.objects.create(
            user=user,
            service=package.service,
            package=package,
            address=address,
            slot=slot,
            reference=next_work_order_reference(),
            status="CONFIRMED",
            payment_status="UNPAID",
            confirmed_at=timezone.now(),
            is_manual_work_order=True,
            problem_description=str(request.data.get("problem_description", ""))[:2000],
            start_otp_code=f"{secrets.randbelow(10000):04d}",
        )
        BookingItem.objects.create(booking=booking, package=package)
        BookingPriceSnapshot.objects.create(
            booking=booking,
            pricing_rule_id=rule_id,
            pricing_version=version,
            lines=lines,
            total_paise=total,
            remaining_balance_paise=total,
            payment_policy=policy,
        )
        BookingStatusEvent.objects.create(booking=booking, from_status="DRAFT", to_status="CONFIRMED", actor=request.user, reason="Manual work order created")
        audit(request.user, "MANUAL_WORK_ORDER_CREATED", "Booking", booking.id, {"reference": booking.reference}, request=request)
        return Response(booking_data(booking), status=201)


class AdminWorkOrderCloseView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, booking_id):
        require(request.user, "VIEW_ADMIN")
        booking = get_object_or_404(Booking.objects.select_for_update(), id=booking_id)
        if booking.status in ("CANCELLED", "EXPIRED", "CLOSED"):
            raise Conflict("Work order cannot be closed in its current status.")
        note = serializers.CharField(max_length=240, allow_blank=True, required=False).run_validation(request.data.get("note", ""))
        old = booking.status
        booking.status = "CLOSED"
        booking.closed_at = timezone.now()
        booking.closed_by = request.user
        booking.closure_note = note
        booking.version += 1
        booking.save(update_fields=["status", "closed_at", "closed_by", "closure_note", "version", "updated_at"])
        BookingStatusEvent.objects.create(booking=booking, from_status=old, to_status="CLOSED", actor=request.user, reason=note)
        audit(request.user, "WORK_ORDER_CLOSED", "Booking", booking.id, {"note": note}, request=request)
        return Response({"id": str(booking.id), "status": booking.status, "closed_at": booking.closed_at})


class AdminBookingActivitiesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        require(request.user, "VIEW_ADMIN")
        booking = get_object_or_404(Booking.objects.prefetch_related("events__actor", "operator_notes__author"), id=booking_id)
        activities = []
        for e in booking.events.all():
            activities.append({
                "id": str(e.id),
                "kind": "STATUS",
                "title": f"{e.from_status} → {e.to_status}",
                "description": e.reason,
                "actor": e.actor.phone_e164 if e.actor else "System",
                "created_at": e.created_at,
            })
        for n in booking.operator_notes.all():
            activities.append({
                "id": str(n.id),
                "kind": "NOTE",
                "title": "Operator note",
                "description": n.text,
                "actor": n.author.phone_e164 if n.author else "Staff",
                "created_at": n.created_at,
            })
        if hasattr(booking, "technician_assignment"):
            for je in booking.technician_assignment.events.select_related("actor").all():
                activities.append({
                    "id": str(je.id),
                    "kind": "JOB",
                    "title": f"Technician: {je.from_status} → {je.to_status}",
                    "description": "",
                    "actor": je.actor.phone_e164 if je.actor else "Technician",
                    "created_at": je.created_at,
                })
        activities.sort(key=lambda item: item["created_at"], reverse=True)
        return Response({"results": activities[:100]})


class AdminBookingPhotosView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        require(request.user, "VIEW_ADMIN")
        booking = get_object_or_404(Booking, id=booking_id)
        photos = TechnicianDocument.objects.filter(
            assignment__booking=booking,
            kind__in=("BEFORE", "AFTER", "RECEIPT"),
        ).order_by("created_at")
        return Response({
            "results": [
                {
                    "id": str(p.id),
                    "kind": p.kind,
                    "content_type": p.content_type,
                    "url": f"/api/v1/technicians/admin/documents/{p.id}/",
                    "created_at": p.created_at,
                }
                for p in photos
            ]
        })


class AdminBookingActionView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, booking_id, action):
        require(request.user, "VIEW_ADMIN")
        booking = get_object_or_404(Booking.objects.select_for_update().select_related("price_snapshot"), id=booking_id)
        note = serializers.CharField(max_length=240, allow_blank=True, required=False).run_validation(
            request.data.get("notes") or request.data.get("reason") or ""
        )
        if action in ("confirm", "approve"):
            if booking.status not in ("REQUESTED", "AWAITING_PAYMENT", "PENDING_PAYMENT", "PAYMENT_FAILED", "CONFIRMED_UNPAID"):
                raise Conflict("Booking cannot be confirmed in its current state.")
            old = booking.status
            booking.status = "CONFIRMED"
            if not booking.confirmed_at:
                booking.confirmed_at = timezone.now()
            booking.version += 1
            booking.save(update_fields=["status", "confirmed_at", "version", "updated_at"])
            BookingStatusEvent.objects.create(booking=booking, from_status=old, to_status="CONFIRMED",
                                              actor=request.user, reason=note or "Confirmed by operations")
            audit(request.user, "ADMIN_BOOKING_CONFIRMED", "Booking", booking.id, {"note": note}, request=request)
            return Response({"id": str(booking.id), "reference": booking.reference,
                             "status": booking.status, "version": booking.version})

        if action == "start":
            if booking.status in ("CANCELLED", "EXPIRED", "CLOSED", "COMPLETED"):
                raise Conflict("Booking cannot be started in its current state.")
            old = booking.status
            booking.status = "IN_PROGRESS"
            booking.version += 1
            booking.save(update_fields=["status", "version", "updated_at"])
            BookingStatusEvent.objects.create(booking=booking, from_status=old, to_status="IN_PROGRESS", actor=request.user, reason=note)
            if hasattr(booking, "technician_assignment") and booking.technician_assignment.status != "IN_PROGRESS":
                a = booking.technician_assignment
                prev = a.status
                a.status = "IN_PROGRESS"
                a.save(update_fields=["status", "updated_at"])
                JobStatusEvent.objects.create(assignment=a, from_status=prev, to_status="IN_PROGRESS", actor=request.user)
            audit(request.user, "ADMIN_BOOKING_STARTED", "Booking", booking.id, {"note": note}, request=request)
            return Response({"id": str(booking.id), "status": booking.status, "version": booking.version})

        if action == "complete":
            if booking.status in ("CANCELLED", "EXPIRED", "CLOSED"):
                raise Conflict("Booking cannot be completed in its current state.")
            old = booking.status
            booking.status = "COMPLETED"
            booking.version += 1
            booking.save(update_fields=["status", "version", "updated_at"])
            BookingStatusEvent.objects.create(booking=booking, from_status=old, to_status="COMPLETED", actor=request.user, reason=note)
            if hasattr(booking, "technician_assignment") and booking.technician_assignment.status != "SERVICE_COMPLETED":
                a = booking.technician_assignment
                prev = a.status
                a.status = "SERVICE_COMPLETED"
                a.completed_at = timezone.now()
                a.save(update_fields=["status", "completed_at", "updated_at"])
                JobStatusEvent.objects.create(assignment=a, from_status=prev, to_status="SERVICE_COMPLETED", actor=request.user)
            audit(request.user, "ADMIN_BOOKING_COMPLETED", "Booking", booking.id, {"note": note}, request=request)
            return Response({"id": str(booking.id), "status": booking.status, "version": booking.version})

        if action == "cancel":
            if booking.status in ("CANCELLED", "EXPIRED", "CLOSED", "COMPLETED"):
                raise Conflict("Booking cannot be cancelled.")
            old = booking.status
            booking.status = "CANCELLED"
            booking.version += 1
            booking.save(update_fields=["status", "version", "updated_at"])
            JobOffer.objects.filter(booking=booking, status="OFFERED").update(status="WITHDRAWN")
            DispatchAttempt.objects.filter(booking=booking, status="OFFERED").update(status="WITHDRAWN")
            if hasattr(booking, "technician_assignment") and booking.technician_assignment.status != "SERVICE_COMPLETED":
                a = booking.technician_assignment
                prev = a.status
                a.status = "CANCELLED"
                a.save(update_fields=["status", "updated_at"])
                JobStatusEvent.objects.create(assignment=a, from_status=prev, to_status="CANCELLED", actor=request.user)
            BookingStatusEvent.objects.create(booking=booking, from_status=old, to_status="CANCELLED", actor=request.user, reason=note)
            audit(request.user, "ADMIN_BOOKING_CANCELLED", "Booking", booking.id, {"reason": note}, request=request)
            return Response({"id": str(booking.id), "status": booking.status, "version": booking.version})

        if action == "record-balance":
            amount_paise = serializers.IntegerField(min_value=1).run_validation(request.data.get("amount_paise"))
            method = serializers.ChoiceField(choices=["CASH", "UPI", "CARD_OFFLINE", "OTHER"]).run_validation(request.data.get("method", "CASH"))
            booking.offline_collected_paise += amount_paise
            snapshot_total = booking.price_snapshot.total_paise if hasattr(booking, "price_snapshot") else amount_paise
            if booking.offline_collected_paise >= snapshot_total:
                booking.payment_status = "PAID"
            booking.save(update_fields=["offline_collected_paise", "payment_status", "updated_at"])
            audit(request.user, "ADMIN_BALANCE_RECORDED", "Booking", booking.id,
                  {"amount_paise": amount_paise, "method": method, "note": note}, request=request)
            return Response({"id": str(booking.id), "payment_status": booking.payment_status,
                             "offline_collected_paise": booking.offline_collected_paise})

        raise Http404()
