from rest_framework.exceptions import PermissionDenied
from django.utils import timezone

from .models import RolePermission, StaffGroup, StaffRole


CAPABILITIES = {
    "VIEW_ADMIN": {"SUPER_ADMIN", "FINANCE_ADMIN", "FINANCE_VIEWER", "OPERATIONS_MANAGER", "DISPATCH_OPERATOR", "SUPPORT_AGENT", "CATALOG_MANAGER", "TECHNICIAN_VERIFIER"},
    "VIEW_FINANCE": {"SUPER_ADMIN", "FINANCE_ADMIN", "FINANCE_VIEWER"},
    "APPROVE_REFUNDS": {"SUPER_ADMIN", "FINANCE_ADMIN"},
    "APPROVE_SETTLEMENTS": {"SUPER_ADMIN", "FINANCE_ADMIN"},
    "INITIATE_PAYOUTS": {"SUPER_ADMIN", "FINANCE_ADMIN"},
    "MANAGE_PRICING": {"SUPER_ADMIN", "CATALOG_MANAGER"},
    "MANAGE_SERVICES": {"SUPER_ADMIN", "CATALOG_MANAGER"},
    "MANAGE_TECHNICIANS": {"SUPER_ADMIN", "TECHNICIAN_VERIFIER"},
    "VERIFY_KYC": {"SUPER_ADMIN", "TECHNICIAN_VERIFIER"},
    "MANAGE_STAFF": {"SUPER_ADMIN"},
    "VIEW_AUDIT": {"SUPER_ADMIN", "FINANCE_ADMIN"},
    "CHANGE_SETTINGS": {"SUPER_ADMIN"},
}


def roles_for(user):
    if not user.is_authenticated or not user.is_active:
        return set()
    return set(StaffRole.objects.filter(user=user).values_list("role", flat=True))


def can(user, permission):
    if not user.is_authenticated or not user.is_active:
        return False
    roles = roles_for(user)
    if "SUPER_ADMIN" in roles:
        return True
    if permission not in CAPABILITIES:
        return False
    if roles & CAPABILITIES[permission]:
        return True
    if RolePermission.objects.filter(role__in=roles, permission_code=permission).exists():
        return True
    return any(
        permission in (group.permissions or [])
        for group in StaffGroup.objects.filter(members=user, is_active=True)
    )


def require(user, permission):
    if not can(user, permission):
        from .models import AdminAuditLog
        AdminAuditLog.objects.create(
            actor=user if getattr(user, "is_authenticated", False) else None,
            action="PERMISSION_DENIED",
            resource_type="Permission",
            resource_id=permission,
            summary={"permission": permission},
        )
        raise PermissionDenied("Admin permission is required.")


def require_recent_auth(request, seconds=600):
    if getattr(request, "auth", None) and isinstance(request.auth, dict):
        iat = request.auth.get("iat", 0)
        if isinstance(iat, (int, float)) and timezone.now().timestamp() - iat <= seconds:
            return
    verified_at = request.session.get("privileged_verified_at", 0)
    if not isinstance(verified_at, (int, float)) or timezone.now().timestamp() - verified_at > seconds:
        raise PermissionDenied("Sign in again before this financial action.")
