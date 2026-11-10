from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.bookings.models import Booking
from domains.notifications.models import Notification
from domains.notifications.tasks import TEMPLATE_VARIABLES
from domains.operations.models import Lead
from domains.operations.views import paged
from domains.payments.models import Payment, Refund
from domains.technicians.models import TechnicianEarning, TechnicianProfile

from .models import AdminAuditLog, PlatformSetting, RolePermission, ROLES, StaffGroup, StaffRole
from .rbac import CAPABILITIES, can, require, require_recent_auth, roles_for
from .services import audit
from .views_core import period, sum_value


class AdminMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        return Response({"id": request.user.id, "phone_e164": request.user.phone_e164,
            "roles": sorted(roles_for(request.user)),
            "capabilities": sorted(p for p in CAPABILITIES if can(request.user, p))})


def staff_data(user):
    return {"id": user.id, "username": user.username, "phone_e164": user.phone_e164,
        "email": user.email, "is_active": user.is_active, "last_login": user.last_login,
        "roles": [r.role for r in user.admin_roles.all()]}


class AdminStaffView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "MANAGE_STAFF")
        qs = get_user_model().objects.filter(admin_roles__isnull=False).distinct().prefetch_related("admin_roles").order_by("id")
        return paged(request, qs, staff_data)

    @transaction.atomic
    def post(self, request):
        require(request.user, "MANAGE_STAFF")
        require_recent_auth(request)
        phone = serializers.RegexField(r"^\+[1-9]\d{7,14}$").run_validation(request.data.get("phone_e164"))
        role = serializers.ChoiceField(choices=ROLES).run_validation(request.data.get("role"))
        user, created = get_user_model().objects.get_or_create(phone_e164=phone,
            defaults={"username": phone, "is_active": True})
        if not created and not user.is_active:
            raise serializers.ValidationError("Activate the existing account explicitly.")
        StaffRole.objects.get_or_create(user=user, role=role, defaults={"assigned_by": request.user})
        audit(request.user, "STAFF_ROLE_ASSIGNED", "User", user.id, {"role": role})
        return Response(staff_data(get_user_model().objects.prefetch_related("admin_roles").get(pk=user.pk)), status=201)


class AdminStaffDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, staff_id):
        require(request.user, "MANAGE_STAFF")
        require_recent_auth(request)
        user = get_object_or_404(get_user_model().objects.select_for_update(), id=staff_id)
        if user.id == request.user.id:
            raise serializers.ValidationError("Your own account and roles need another administrator.")
        if "is_active" in request.data:
            active = serializers.BooleanField().run_validation(request.data["is_active"])
            if not active and user.admin_roles.filter(role="SUPER_ADMIN").exists() and StaffRole.objects.filter(
                    role="SUPER_ADMIN", user__is_active=True).count() <= 1:
                raise serializers.ValidationError("The last active super admin cannot be deactivated.")
            user.is_active = active
            user.save(update_fields=["is_active"])
            audit(request.user, "STAFF_ACTIVITY_CHANGED", "User", user.id, {"is_active": user.is_active})
        if "add_role" in request.data:
            role = serializers.ChoiceField(choices=ROLES).run_validation(request.data["add_role"])
            StaffRole.objects.get_or_create(user=user, role=role, defaults={"assigned_by": request.user})
            audit(request.user, "STAFF_ROLE_ASSIGNED", "User", user.id, {"role": role})
        if "remove_role" in request.data:
            role = serializers.ChoiceField(choices=ROLES).run_validation(request.data["remove_role"])
            if role == "SUPER_ADMIN" and StaffRole.objects.filter(role=role, user__is_active=True).count() <= 1:
                raise serializers.ValidationError("The last active super admin cannot be removed.")
            StaffRole.objects.filter(user=user, role=role).delete()
            audit(request.user, "STAFF_ROLE_REMOVED", "User", user.id, {"role": role})
        return Response(staff_data(get_user_model().objects.prefetch_related("admin_roles").get(pk=user.pk)))


class AdminRolesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "MANAGE_STAFF")
        overrides = {(r.role, r.permission_code) for r in RolePermission.objects.all()}
        return Response({"roles": [{"name": role, "permissions": sorted(
            p for p, defaults in CAPABILITIES.items() if role in defaults or (role, p) in overrides)}
            for role in ROLES], "capabilities": sorted(CAPABILITIES)})

    def post(self, request):
        return self.patch(request)

    @transaction.atomic
    def patch(self, request, role_id=None):
        require(request.user, "MANAGE_STAFF")
        require_recent_auth(request)
        role = serializers.ChoiceField(choices=ROLES).run_validation(role_id or request.data.get("role"))
        if role == "SUPER_ADMIN":
            raise serializers.ValidationError("Super admin permissions are fixed.")
        code = serializers.ChoiceField(choices=CAPABILITIES).run_validation(request.data.get("permission_code"))
        enabled = serializers.BooleanField().run_validation(request.data.get("enabled"))
        if enabled:
            RolePermission.objects.get_or_create(role=role, permission_code=code)
        else:
            RolePermission.objects.filter(role=role, permission_code=code).delete()
        audit(request.user, "ROLE_PERMISSION_CHANGED", "Role", role, {"permission": code, "enabled": enabled})
        return Response({"role": role, "permission_code": code, "enabled": enabled})


SAFE_SETTINGS = {"brand", "support", "business", "timezone", "booking_policy",
                 "service_defaults", "settlement_period", "notification_templates",
                 "homepage_banners", "carousel_items", "faqs", "customer_reviews"}


class AdminSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        return Response({"settings": {row.key: row.value for row in PlatformSetting.objects.filter(key__in=SAFE_SETTINGS)},
            "providers": {"sms_configured": settings.SMS_PROVIDER == "MSG91",
                "whatsapp_configured": settings.WHATSAPP_PROVIDER == "MSG91",
                "email_configured": settings.EMAIL_PROVIDER == "SMTP" and bool(settings.EMAIL_HOST)}})

    def patch(self, request):
        require(request.user, "CHANGE_SETTINGS")
        key = serializers.ChoiceField(choices=SAFE_SETTINGS).run_validation(request.data.get("key"))
        value = serializers.JSONField().run_validation(request.data.get("value"))
        if not isinstance(value, dict) or any("secret" in k.lower() or "token" in k.lower() or "password" in k.lower() or "api_key" in k.lower() for k in value):
            raise serializers.ValidationError("Settings must contain only public configuration fields.")
        setting, _ = PlatformSetting.objects.update_or_create(key=key, defaults={"value": value, "updated_by": request.user})
        audit(request.user, "SETTING_CHANGED", "PlatformSetting", setting.id, {"key": key}, request=request)
        return Response({"key": key, "value": value})


def staff_group_data(group):
    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "permissions": group.permissions,
        "is_active": group.is_active,
        "member_ids": list(group.members.values_list("id", flat=True)),
        "members": [{"id": u.id, "phone_e164": u.phone_e164, "username": u.username} for u in group.members.all()],
    }


class AdminStaffGroupsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "MANAGE_STAFF")
        qs = StaffGroup.objects.prefetch_related("members").order_by("name")
        return Response({"results": [staff_group_data(g) for g in qs]})

    @transaction.atomic
    def post(self, request):
        require(request.user, "MANAGE_STAFF")
        require_recent_auth(request)
        name = serializers.CharField(max_length=80).run_validation(request.data.get("name"))
        description = serializers.CharField(max_length=240, allow_blank=True, required=False).run_validation(request.data.get("description", ""))
        perms = serializers.ListField(child=serializers.ChoiceField(choices=list(CAPABILITIES)), required=False).run_validation(request.data.get("permissions", []))
        member_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False).run_validation(request.data.get("member_ids", []))
        group = StaffGroup.objects.create(name=name, description=description, permissions=sorted(set(perms)), is_active=True)
        if member_ids:
            users = get_user_model().objects.filter(id__in=member_ids, is_active=True)
            group.members.set(users)
        audit(request.user, "STAFF_GROUP_CREATED", "StaffGroup", group.id, {"name": group.name}, request=request)
        return Response(staff_group_data(group), status=201)


class AdminStaffGroupDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, group_id):
        require(request.user, "MANAGE_STAFF")
        require_recent_auth(request)
        group = get_object_or_404(StaffGroup.objects.prefetch_related("members"), id=group_id)
        if "name" in request.data:
            group.name = serializers.CharField(max_length=80).run_validation(request.data["name"])
        if "description" in request.data:
            group.description = serializers.CharField(max_length=240, allow_blank=True).run_validation(request.data["description"])
        if "permissions" in request.data:
            perms = serializers.ListField(child=serializers.ChoiceField(choices=list(CAPABILITIES))).run_validation(request.data["permissions"])
            group.permissions = sorted(set(perms))
        if "is_active" in request.data:
            group.is_active = serializers.BooleanField().run_validation(request.data["is_active"])
        if "member_ids" in request.data:
            member_ids = serializers.ListField(child=serializers.IntegerField(min_value=1)).run_validation(request.data["member_ids"])
            group.members.set(get_user_model().objects.filter(id__in=member_ids, is_active=True))
        group.save()
        audit(request.user, "STAFF_GROUP_UPDATED", "StaffGroup", group.id, {"name": group.name}, request=request)
        return Response(staff_group_data(group))

    @transaction.atomic
    def delete(self, request, group_id):
        require(request.user, "MANAGE_STAFF")
        require_recent_auth(request)
        group = get_object_or_404(StaffGroup, id=group_id)
        gid = group.id
        group.delete()
        audit(request.user, "STAFF_GROUP_DELETED", "StaffGroup", gid, {}, request=request)
        return Response(status=204)


class AdminAuditView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_AUDIT")
        qs = AdminAuditLog.objects.select_related("actor").order_by("-created_at")
        if request.query_params.get("action"):
            qs = qs.filter(action=request.query_params["action"])
        if request.query_params.get("resource_type"):
            qs = qs.filter(resource_type=request.query_params["resource_type"])
        if request.query_params.get("q"):
            q = request.query_params["q"][:80]
            qs = qs.filter(Q(action__icontains=q) | Q(resource_type__icontains=q) | Q(resource_id__icontains=q))
        return paged(request, qs, lambda row: {"id": str(row.id), "at": row.created_at,
            "actor": row.actor.phone_e164 if row.actor else None, "action": row.action,
            "resource_type": row.resource_type, "resource_id": row.resource_id,
            "summary": row.summary, "request_id": row.request_id,
            "ip_address": row.ip_address, "user_agent": row.user_agent})


class AdminNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = Notification.objects.select_related("recipient", "booking").order_by("-created_at")
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("channel"):
            qs = qs.filter(channel=request.query_params["channel"])
        rows = paged(request, qs, lambda n: {"id": str(n.id), "channel": n.channel,
            "recipient_phone": n.recipient.phone_e164 if n.recipient else None,
            "booking_reference": n.booking.reference if n.booking else None,
            "event": n.event, "template_key": n.template_key, "status": n.status,
            "provider_message_id": n.provider_message_id, "sent_at": n.sent_at,
            "attempt_count": n.attempt_count, "created_at": n.created_at})
        rows.data["templates"] = sorted(TEMPLATE_VARIABLES)
        return rows


class AdminNotificationActionView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, notification_id, action):
        require(request.user, "VIEW_ADMIN")
        if action not in ("retry", "cancel"):
            raise Http404()
        notification = get_object_or_404(Notification.objects.select_for_update(), id=notification_id)
        if action == "retry":
            if notification.status == "CANCELLED":
                raise serializers.ValidationError("Cancelled notifications cannot be retried.")
            notification.status = "BLOCKED_CONFIGURATION"
            notification.save(update_fields=["status", "updated_at"])
            audit(request.user, "NOTIFICATION_RETRIED", "Notification", notification.id, request=request)
            return Response({"id": str(notification.id), "status": notification.status})
        notification.status = "CANCELLED"
        notification.save(update_fields=["status", "updated_at"])
        audit(request.user, "NOTIFICATION_CANCELLED", "Notification", notification.id, request=request)
        return Response({"id": str(notification.id), "status": notification.status})


class AdminGlobalSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        q = (request.query_params.get("q") or "").strip()[:80]
        if len(q) < 2:
            return Response({"bookings": [], "leads": [], "customers": [], "technicians": []})
        bookings = Booking.objects.filter(
            Q(reference__icontains=q) | Q(user__phone_e164__icontains=q) | Q(service__name__icontains=q)
        ).select_related("service", "user").order_by("-created_at")[:10]
        leads = Lead.objects.filter(
            Q(lead_reference__icontains=q) | Q(customer_name__icontains=q) | Q(mobile_number__icontains=q)
        ).select_related("service").order_by("-created_at")[:10]
        customers = get_user_model().objects.filter(
            Q(phone_e164__icontains=q) | Q(first_name__icontains=q) | Q(email__icontains=q) | Q(customer_code__icontains=q),
            booking__isnull=False,
        ).distinct().order_by("id")[:10]
        technicians = TechnicianProfile.objects.filter(
            Q(display_name__icontains=q) | Q(user__phone_e164__icontains=q) | Q(city__icontains=q)
        ).select_related("user").order_by("display_name")[:10]
        return Response({
            "bookings": [{"id": str(b.id), "reference": b.reference, "service": b.service.name, "status": b.status} for b in bookings],
            "leads": [{"id": str(l.id), "reference": l.lead_reference, "customer_name": l.customer_name, "status": l.status} for l in leads],
            "customers": [{"id": c.id, "customer_code": c.customer_code, "phone": c.phone_e164, "name": c.get_full_name()} for c in customers],
            "technicians": [{"id": str(t.id), "name": t.display_name, "phone": t.user.phone_e164, "status": t.verification_status} for t in technicians],
        })


class AdminReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, kind):
        require(request.user, "VIEW_FINANCE" if kind in ("revenue", "finance") else "VIEW_ADMIN")
        start, end = period(request)
        bookings = Booking.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
        result = {"kind": kind, "start": start, "end": end}
        if kind == "summary":
            result["bookings_total"] = bookings.count()
            result["completed_bookings"] = bookings.filter(technician_assignment__status="SERVICE_COMPLETED").count()
            result["leads_total"] = Lead.objects.filter(created_at__date__gte=start, created_at__date__lte=end).count()
            result["verified_technicians"] = TechnicianProfile.objects.filter(verification_status="VERIFIED").count()
            result["collected_paise"] = sum_value(Payment.objects.filter(status="CAPTURED",
                created_at__date__gte=start, created_at__date__lte=end))
        elif kind == "bookings":
            result["total"] = bookings.count()
            result["by_status"] = list(bookings.values("status").annotate(count=Count("id")).order_by("status"))
            result["by_service"] = list(bookings.values("service__name").annotate(count=Count("id")).order_by("-count")[:30])
        elif kind == "technicians":
            result["verified"] = TechnicianProfile.objects.filter(verification_status="VERIFIED").count()
            result["earnings_approved_paise"] = sum_value(TechnicianEarning.objects.filter(status="APPROVED",
                created_at__date__gte=start, created_at__date__lte=end))
        elif kind in ("revenue", "finance"):
            result["collected_paise"] = sum_value(Payment.objects.filter(status="CAPTURED",
                created_at__date__gte=start, created_at__date__lte=end))
            result["refunded_paise"] = sum_value(Refund.objects.filter(status="SUCCEEDED",
                created_at__date__gte=start, created_at__date__lte=end))
            result["net_cash_paise"] = result["collected_paise"] - result["refunded_paise"]
            result["revenue_recognition_status"] = "UNAVAILABLE_PENDING_ACCOUNTING_POLICY"
        else:
            raise serializers.ValidationError("Unknown report type.")
        return Response(result)
