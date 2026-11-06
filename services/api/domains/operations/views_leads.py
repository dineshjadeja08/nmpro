from datetime import timedelta
from uuid import uuid4

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.administration.rbac import require as require_admin, require_recent_auth, roles_for
from domains.bookings.models import AppointmentSlot
from domains.bookings.services import available_slots, confirm_booking, create_hold, create_quote, serviceable
from domains.catalog.models import Category, PricingRule, Service, ServicePackage
from domains.bookings.services import calculate_price
from domains.locations.models import Address, Zone

from .models import (LEAD_SOURCES, LEAD_STATUSES, Lead, LeadActivity, LeadFollowUp,
                     OperationsGrant, OperationsZoneGrant)
from .services import log


def lead_access(user, edit=False):
    if not user.is_authenticated or not user.is_active:
        raise PermissionDenied("Operations access is required.")
    admin = roles_for(user)
    operations = set(OperationsGrant.objects.filter(user=user).values_list("role", flat=True))
    if "SUPER_ADMIN" in admin or "SUPER_ADMIN" in operations:
        return True
    allowed = {"OPERATIONS_MANAGER", "DISPATCH_OPERATOR", "SUPPORT_AGENT"}
    if edit and not (admin & allowed or operations & allowed):
        raise PermissionDenied("Lead editing access is required.")
    if not edit and not (admin or operations):
        raise PermissionDenied("Lead viewing access is required.")
    return bool(admin & allowed or operations & allowed)


def scoped_leads(user):
    qs = Lead.objects.select_related("service", "service_category", "zone", "assigned_to", "converted_booking")
    zone_ids = list(OperationsZoneGrant.objects.filter(user=user).values_list("zone_id", flat=True))
    if zone_ids and "SUPER_ADMIN" not in roles_for(user) and not OperationsGrant.objects.filter(user=user, role="SUPER_ADMIN").exists():
        qs = qs.filter(zone_id__in=zone_ids)
    return qs


def lead_data(lead, contact=False, detail=False):
    result = {"id": str(lead.id), "lead_reference": lead.lead_reference,
        "customer_name": lead.customer_name,
        "mobile_number": lead.mobile_number if contact else f"******{lead.mobile_number[-4:]}",
        "alternate_mobile": lead.alternate_mobile if contact else "",
        "email": lead.email if contact else "", "service_category_id": str(lead.service_category_id),
        "service_category": lead.service_category.name, "service_id": str(lead.service_id),
        "service": lead.service.name, "zone_id": str(lead.zone_id) if lead.zone_id else None,
        "problem_description": lead.problem_description, "address": lead.address if contact else "",
        "landmark": lead.landmark if contact else "", "area": lead.area, "city": lead.city,
        "pincode": lead.pincode if contact else "", "preferred_date": lead.preferred_date,
        "preferred_time": lead.preferred_time, "urgency": lead.urgency, "source": lead.source,
        "status": lead.status, "priority": lead.priority,
        "assigned_to": lead.assigned_to_id, "assigned_to_phone": lead.assigned_to.phone_e164 if lead.assigned_to else None,
        "follow_up_at": lead.follow_up_at, "internal_notes": lead.internal_notes if contact else "",
        "converted_booking_id": str(lead.converted_booking_id) if lead.converted_booking_id else None,
        "created_at": lead.created_at, "updated_at": lead.updated_at}
    if detail:
        result["activities"] = [{"kind": a.kind, "detail": a.detail, "created_at": a.created_at,
            "actor_id": a.actor_id} for a in lead.activities.all()]
        result["follow_ups"] = [{"id": str(f.id), "due_at": f.due_at, "notes": f.notes if contact else "",
            "assigned_to": f.assigned_to_id, "completed_at": f.completed_at}
            for f in lead.follow_ups.all().order_by("due_at")]
    return result


class LeadInput(serializers.Serializer):
    customer_name = serializers.CharField(max_length=120, required=False)
    mobile_number = serializers.RegexField(r"^\+91[6-9]\d{9}$", required=False)
    alternate_mobile = serializers.RegexField(r"^\+91[6-9]\d{9}$", required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    service_category_id = serializers.UUIDField(required=False)
    service_id = serializers.UUIDField(required=False)
    problem_description = serializers.CharField(max_length=4000, required=False, allow_blank=True)
    address = serializers.CharField(max_length=200, required=False, allow_blank=True)
    landmark = serializers.CharField(max_length=120, required=False, allow_blank=True)
    area = serializers.CharField(max_length=100, required=False, allow_blank=True)
    city = serializers.CharField(max_length=80, required=False, allow_blank=True)
    pincode = serializers.RegexField(r"^\d{6}$", required=False, allow_blank=True)
    preferred_date = serializers.DateField(required=False, allow_null=True)
    preferred_time = serializers.TimeField(required=False, allow_null=True)
    urgency = serializers.ChoiceField(choices=["NORMAL", "SOON", "URGENT"], required=False)
    source = serializers.ChoiceField(choices=LEAD_SOURCES, required=False)
    status = serializers.ChoiceField(choices=LEAD_STATUSES, required=False)
    priority = serializers.ChoiceField(choices=["LOW", "NORMAL", "HIGH", "URGENT"], required=False)
    assigned_to = serializers.IntegerField(required=False, allow_null=True)
    follow_up_at = serializers.DateTimeField(required=False, allow_null=True)
    internal_notes = serializers.CharField(max_length=4000, required=False, allow_blank=True)
    loss_reason = serializers.CharField(max_length=500, required=False, allow_blank=True, write_only=True)


def resolved_fields(data, current=None):
    if current and not ({"service_category_id", "service_id"} & data.keys()):
        category, service = current.service_category, current.service
    else:
        category_id = data.get("service_category_id", current.service_category_id if current else None)
        service_id = data.get("service_id", current.service_id if current else None)
        category = get_object_or_404(Category, id=category_id, is_active=True)
        service = get_object_or_404(Service, id=service_id, category=category, is_active=True)
    city = data.get("city", current.city if current else "")
    pincode = data.get("pincode", current.pincode if current else "")
    zone = Zone.objects.filter(city__name__iexact=city, postal_code=pincode,
        is_active=True, city__is_active=True).first() if city and pincode else None
    return category, service, zone


def validate_owner(user_id, zone=None):
    if user_id is None:
        return None
    user = get_object_or_404(get_user_model(), id=user_id, is_active=True)
    if not (roles_for(user).intersection({"SUPER_ADMIN", "OPERATIONS_MANAGER", "DISPATCH_OPERATOR", "SUPPORT_AGENT"})
            or OperationsGrant.objects.filter(user=user, role__in=["SUPER_ADMIN", "OPERATIONS_MANAGER",
                "DISPATCH_OPERATOR", "SUPPORT_AGENT"]).exists()):
        raise serializers.ValidationError({"assigned_to": "Assign an active operations staff member."})
    owner_zones = list(OperationsZoneGrant.objects.filter(user=user).values_list("zone_id", flat=True))
    if owner_zones and (not zone or zone.id not in owner_zones) and "SUPER_ADMIN" not in roles_for(user):
        raise serializers.ValidationError({"assigned_to": "This staff member cannot access the lead's zone."})
    return user


def save_lead(actor, data, lead=None):
    previous_follow_up = lead.follow_up_at if lead else None
    category, service, zone = resolved_fields(data, lead)
    permitted = list(OperationsZoneGrant.objects.filter(user=actor).values_list("zone_id", flat=True))
    if permitted and (not zone or zone.id not in permitted) and "SUPER_ADMIN" not in roles_for(actor) and not OperationsGrant.objects.filter(user=actor, role="SUPER_ADMIN").exists():
        raise PermissionDenied("This lead is outside your assigned zones.")
    owner = validate_owner(data["assigned_to"], zone) if "assigned_to" in data else (lead.assigned_to if lead else None)
    if lead is None:
        required = ("customer_name", "mobile_number", "service_category_id", "service_id", "source")
        missing = [field for field in required if not data.get(field)]
        if missing:
            raise serializers.ValidationError({field: "Required." for field in missing})
        if data.get("status") == "CONVERTED":
            raise serializers.ValidationError("Use the conversion action to mark a lead converted.")
        if data.get("status") == "LOST" and not data.get("loss_reason"):
            raise serializers.ValidationError({"loss_reason": "A reason is required."})
        lead = Lead(lead_reference=f"NL-{timezone.now():%y%m%d}-{uuid4().hex[:12].upper()}", created_by=actor)
        kind = "CREATED"
    else:
        if lead.status == "CONVERTED":
            raise serializers.ValidationError("Converted leads cannot be edited.")
        if data.get("status") == "CONVERTED":
            raise serializers.ValidationError("Use the conversion action to mark a lead converted.")
        if data.get("status") == "LOST" and not data.get("loss_reason"):
            raise serializers.ValidationError({"loss_reason": "A reason is required."})
        kind = "UPDATED"
    before = {key: str(getattr(lead, key, "")) for key in data if key not in {"loss_reason", "service_category_id", "service_id", "assigned_to"}}
    for key, value in data.items():
        if key not in {"loss_reason", "service_category_id", "service_id", "assigned_to"}:
            setattr(lead, key, value)
    lead.service_category, lead.service, lead.zone, lead.assigned_to = category, service, zone, owner
    lead.save()
    changed = sorted(key for key in before if before[key] != str(getattr(lead, key)))
    if "assigned_to" in data:
        changed.append("assigned_to")
    if "service_id" in data or "service_category_id" in data:
        changed.append("service")
    LeadActivity.objects.create(lead=lead, actor=actor, kind=kind,
        detail={"fields": changed, "status": lead.status, **({"loss_reason": data["loss_reason"]} if data.get("loss_reason") else {})})
    if "follow_up_at" in data and data["follow_up_at"] and data["follow_up_at"] != previous_follow_up:
        LeadFollowUp.objects.create(lead=lead, assigned_to=owner or actor, due_at=data["follow_up_at"])
    log(actor, f"LEAD_{kind}", "Lead", lead.id, {"reference": lead.lead_reference})
    return lead


class LeadsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        contact = lead_access(request.user)
        qs = scoped_leads(request.user)
        for param, lookup in (("status", "status"), ("service", "service_id"), ("area", "area__icontains"),
                              ("source", "source"), ("priority", "priority"), ("assigned_to", "assigned_to_id")):
            if request.query_params.get(param):
                qs = qs.filter(**{lookup: request.query_params[param]})
        if request.query_params.get("q"):
            term = request.query_params["q"][:100]
            search = Q(lead_reference__icontains=term) | Q(customer_name__icontains=term)
            if contact:
                search |= Q(mobile_number__icontains=term)
            qs = qs.filter(search)
        for param, lookup in (("start", "created_at__date__gte"), ("end", "created_at__date__lte")):
            if request.query_params.get(param):
                date = parse_date(request.query_params[param])
                if not date:
                    raise serializers.ValidationError({param: "Use YYYY-MM-DD."})
                qs = qs.filter(**{lookup: date})
        sort = request.query_params.get("sort", "-created_at")
        if sort not in {"-created_at", "created_at", "follow_up_at", "-follow_up_at", "priority", "-priority"}:
            raise serializers.ValidationError({"sort": "Invalid order."})
        page = serializers.IntegerField(min_value=1).run_validation(request.query_params.get("page", 1))
        return Response({"count": qs.count(), "page": page,
            "results": [lead_data(row, contact) for row in qs.order_by(sort, "id")[(page - 1) * 20:page * 20]]})

    @transaction.atomic
    def post(self, request):
        lead_access(request.user, edit=True)
        form = LeadInput(data=request.data)
        form.is_valid(raise_exception=True)
        lead = save_lead(request.user, form.validated_data)
        return Response(lead_data(lead, True), status=201)


class LeadSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        lead_access(request.user)
        qs = scoped_leads(request.user)
        now = timezone.now()
        counts = qs.aggregate(total=Count("id"), new=Count("id", filter=Q(status="NEW")),
            qualified=Count("id", filter=Q(status="QUALIFIED")),
            converted=Count("id", filter=Q(status="CONVERTED")))
        counts["follow_ups_due"] = LeadFollowUp.objects.filter(lead__in=qs, completed_at__isnull=True,
            due_at__lte=now).count()
        counts["conversion_rate"] = round(100 * counts["converted"] / counts["total"], 1) if counts["total"] else 0
        return Response(counts)


class LeadFollowUpQueueView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        contact = lead_access(request.user)
        scope = scoped_leads(request.user)
        state = request.query_params.get("state", "due")
        if state not in {"due", "overdue", "completed", "upcoming"}:
            raise serializers.ValidationError({"state": "Invalid follow-up state."})
        now = timezone.now()
        qs = LeadFollowUp.objects.filter(lead__in=scope).select_related("lead", "assigned_to")
        if state == "completed":
            qs = qs.filter(completed_at__isnull=False)
        elif state == "upcoming":
            qs = qs.filter(completed_at__isnull=True, due_at__gt=now)
        elif state == "overdue":
            qs = qs.filter(completed_at__isnull=True, due_at__date__lt=timezone.localdate())
        else:
            qs = qs.filter(completed_at__isnull=True, due_at__date=timezone.localdate())
        page = serializers.IntegerField(min_value=1).run_validation(request.query_params.get("page", 1))
        return Response({"count": qs.count(), "page": page, "results": [{"id": str(f.id),
            "lead_id": str(f.lead_id), "lead_reference": f.lead.lead_reference,
            "customer_name": f.lead.customer_name, "mobile_number": f.lead.mobile_number if contact else f"******{f.lead.mobile_number[-4:]}",
            "due_at": f.due_at, "notes": f.notes if contact else "", "assigned_to": f.assigned_to_id,
            "completed_at": f.completed_at} for f in qs.order_by("due_at", "id")[(page - 1) * 20:page * 20]]})


class LeadZoneGrantsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_admin(request.user, "MANAGE_STAFF")
        return Response({"results": [{"id": str(g.id), "user_id": g.user_id, "zone_id": str(g.zone_id)}
            for g in OperationsZoneGrant.objects.all().order_by("user_id", "zone_id")[:500]]})

    @transaction.atomic
    def post(self, request):
        require_admin(request.user, "MANAGE_STAFF")
        require_recent_auth(request)
        user_id = serializers.IntegerField(min_value=1).run_validation(request.data.get("user_id"))
        zone_id = serializers.UUIDField().run_validation(request.data.get("zone_id"))
        user = get_object_or_404(get_user_model(), id=user_id, is_active=True)
        zone = get_object_or_404(Zone, id=zone_id, is_active=True)
        grant, _ = OperationsZoneGrant.objects.get_or_create(user=user, zone=zone)
        log(request.user, "LEAD_ZONE_GRANTED", "OperationsZoneGrant", grant.id)
        return Response({"id": str(grant.id), "user_id": user.id, "zone_id": str(zone.id)}, status=201)


class LeadZoneGrantDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def delete(self, request, grant_id):
        require_admin(request.user, "MANAGE_STAFF")
        require_recent_auth(request)
        grant = get_object_or_404(OperationsZoneGrant, id=grant_id)
        if (OperationsZoneGrant.objects.filter(user=grant.user).count() <= 1 and
                (roles_for(grant.user) or OperationsGrant.objects.filter(user=grant.user).exists())):
            raise serializers.ValidationError("The final zone grant cannot be removed while the staff role grants area-wide access. Remove the staff role first.")
        log(request.user, "LEAD_ZONE_REVOKED", "OperationsZoneGrant", grant.id)
        grant.delete()
        return Response(status=204)


class LeadDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, lead_id):
        contact = lead_access(request.user)
        return Response(lead_data(get_object_or_404(scoped_leads(request.user), id=lead_id), contact, True))

    @transaction.atomic
    def patch(self, request, lead_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user).select_for_update(), id=lead_id)
        form = LeadInput(data=request.data, partial=True)
        form.is_valid(raise_exception=True)
        return Response(lead_data(save_lead(request.user, form.validated_data, lead), True, True))


class LeadFollowUpsView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lead_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user).select_for_update(), id=lead_id)
        if lead.status in {"CONVERTED", "LOST", "CANCELLED"}:
            raise serializers.ValidationError("This lead is closed.")
        due_at = serializers.DateTimeField().run_validation(request.data.get("due_at"))
        if due_at <= timezone.now():
            raise serializers.ValidationError({"due_at": "Choose a future date and time."})
        assigned = validate_owner(request.data.get("assigned_to"), lead.zone) or lead.assigned_to or request.user
        notes = serializers.CharField(max_length=2000, allow_blank=True).run_validation(request.data.get("notes", ""))
        follow_up = LeadFollowUp.objects.create(lead=lead, assigned_to=assigned, due_at=due_at, notes=notes)
        lead.follow_up_at = due_at
        lead.status = "FOLLOW_UP"
        lead.save(update_fields=["follow_up_at", "status", "updated_at"])
        LeadActivity.objects.create(lead=lead, actor=request.user, kind="FOLLOW_UP_SCHEDULED",
            detail={"follow_up_id": str(follow_up.id), "due_at": due_at.isoformat()})
        log(request.user, "LEAD_FOLLOW_UP_SCHEDULED", "Lead", lead.id)
        return Response(lead_data(lead, True, True), status=201)


class LeadFollowUpCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lead_id, follow_up_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user).select_for_update(), id=lead_id)
        follow_up = get_object_or_404(LeadFollowUp.objects.select_for_update(), id=follow_up_id,
            lead=lead, completed_at__isnull=True)
        follow_up.completed_at = timezone.now()
        follow_up.completed_by = request.user
        follow_up.save(update_fields=["completed_at", "completed_by", "updated_at"])
        LeadActivity.objects.create(lead=lead, actor=request.user, kind="FOLLOW_UP_COMPLETED",
            detail={"follow_up_id": str(follow_up.id)})
        log(request.user, "LEAD_FOLLOW_UP_COMPLETED", "Lead", lead.id)
        return Response(lead_data(lead, True, True))


class LeadConvertView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lead_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user).select_for_update(), id=lead_id)
        if lead.converted_booking_id:
            return Response(lead_data(lead, True, True))
        if lead.status != "QUALIFIED":
            raise serializers.ValidationError("Qualify the lead before booking.")
        package_id = serializers.UUIDField().run_validation(request.data.get("package_id"))
        slot_id = serializers.UUIDField().run_validation(request.data.get("slot_id"))
        accepted_total = serializers.IntegerField(min_value=0).run_validation(request.data.get("accepted_total_paise"))
        package = get_object_or_404(ServicePackage, id=package_id, service=lead.service, is_active=True)
        slot = get_object_or_404(AppointmentSlot, id=slot_id, package=package)
        if not all([lead.address, lead.area, lead.city, lead.pincode, lead.zone_id]):
            raise serializers.ValidationError("Complete the service address and zone before conversion.")
        if slot.zone_id != lead.zone_id:
            raise serializers.ValidationError("The appointment must be in the lead's service zone.")
        user, _ = get_user_model().objects.get_or_create(phone_e164=lead.mobile_number,
            defaults={"username": lead.mobile_number, "is_active": True})
        if not user.is_active:
            raise serializers.ValidationError("Customer account is inactive.")
        address = Address.objects.create(user=user, zone=lead.zone, line_1=lead.address,
            contact_name=lead.customer_name, contact_phone=lead.mobile_number, locality=lead.area,
            city=lead.city, postal_code=lead.pincode, landmark=lead.landmark)
        if not serviceable(package, address):
            raise serializers.ValidationError("The service is not available at this address.")
        hold = create_hold(user, package, address, slot.id)
        quote = create_quote(user, hold.id)
        booking, _ = confirm_booking(user, hold.id, quote.id, f"lead:{lead.id}", accepted_total)
        lead.converted_booking = booking
        lead.status = "CONVERTED"
        lead.save(update_fields=["converted_booking", "status", "updated_at"])
        LeadActivity.objects.create(lead=lead, actor=request.user, kind="CONVERTED",
            detail={"booking_id": str(booking.id), "booking_reference": booking.reference})
        log(request.user, "LEAD_CONVERTED", "Lead", lead.id, {"booking_id": str(booking.id)})
        return Response(lead_data(lead, True, True))


class LeadConversionOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, lead_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user), id=lead_id)
        if lead.status != "QUALIFIED" or not all([lead.address, lead.area, lead.city, lead.pincode, lead.zone_id]):
            return Response({"packages": [], "detail": "Qualify the lead and complete its address first."})
        address = Address(user_id=0, zone=lead.zone, line_1=lead.address, locality=lead.area,
            city=lead.city, postal_code=lead.pincode)
        now = timezone.now()
        options = []
        for package in ServicePackage.objects.filter(service=lead.service, is_active=True):
            if not serviceable(package, address):
                continue
            rule = PricingRule.objects.filter(package=package, zone=lead.zone, is_active=True).first()
            if not rule:
                continue
            if rule.payment_policy == "PREPAID" and not settings.RAZORPAY_ENABLED:
                continue
            try:
                _, total = calculate_price(rule)
            except ValidationError:
                continue
            options.append({"id": str(package.id), "name": package.name, "payment_policy": rule.payment_policy,
                "total_paise": total,
                "slots": available_slots(package, address, now, now + timedelta(days=30))})
        return Response({"packages": options})
