from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Sum
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.bookings.models import Booking
from domains.notifications.models import Notification
from domains.notifications.tasks import TEMPLATE_VARIABLES
from domains.operations.views import paged
from domains.payments.models import Payment, Refund
from domains.technicians.models import TechnicianEarning, TechnicianProfile

from .models import AdminAuditLog, PlatformSetting, RolePermission, ROLES, StaffRole
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
                 "service_defaults", "settlement_period", "notification_templates"}


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
        audit(request.user, "SETTING_CHANGED", "PlatformSetting", setting.id, {"key": key})
        return Response({"key": key, "value": value})


class AdminAuditView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_AUDIT")
        qs = AdminAuditLog.objects.select_related("actor").order_by("-created_at")
        if request.query_params.get("action"):
            qs = qs.filter(action=request.query_params["action"])
        return paged(request, qs, lambda row: {"id": str(row.id), "at": row.created_at,
            "actor": row.actor.phone_e164 if row.actor else None, "action": row.action,
            "resource_type": row.resource_type, "resource_id": row.resource_id,
            "summary": row.summary, "request_id": row.request_id})


class AdminNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = Notification.objects.order_by("-created_at")
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        rows = paged(request, qs, lambda n: {"id": str(n.id), "channel": n.channel,
            "event": n.event, "template_key": n.template_key, "status": n.status,
            "attempt_count": n.attempt_count, "created_at": n.created_at})
        rows.data["templates"] = sorted(TEMPLATE_VARIABLES)
        return rows


class AdminReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, kind):
        require(request.user, "VIEW_FINANCE" if kind in ("revenue", "finance") else "VIEW_ADMIN")
        start, end = period(request)
        bookings = Booking.objects.filter(created_at__date__gte=start, created_at__date__lte=end)
        result = {"kind": kind, "start": start, "end": end}
        if kind == "bookings":
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
