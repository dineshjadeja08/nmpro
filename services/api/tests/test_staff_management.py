"""Staff account management and password changes through the admin API."""

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from domains.administration.models import StaffRole


@pytest.fixture
def super_admin():
    user = get_user_model().objects.create_user(username="+919800000001", phone_e164="+919800000001")
    user.set_password("Original-admin-password-42")
    user.save()
    StaffRole.objects.create(user=user, role="SUPER_ADMIN", assigned_by=user)
    client = APIClient()
    client.force_authenticate(user=user)
    session = client.session
    session["privileged_verified_at"] = timezone.now().timestamp()
    session.save()
    return client, user


@pytest.mark.django_db
def test_super_admin_creates_and_edits_staff_with_a_usable_password(super_admin):
    client, admin = super_admin
    url = "/api/v1/admin/staff/"
    password = "New-staff-password-42"
    created = client.post(url, {"phone_e164": "+919800000002", "role": "OPERATIONS_MANAGER",
        "first_name": "Maya", "email": "maya@example.com", "password": password}, format="json")
    assert created.status_code == 201, created.content
    assert password not in created.content.decode()
    user = get_user_model().objects.get(phone_e164="+919800000002")
    assert user.check_password(password)
    assert StaffRole.objects.filter(user=user, role="OPERATIONS_MANAGER").exists()

    changed = client.patch(f"{url}{user.id}/", {"first_name": "Maya S", "email": "maya.s@example.com",
        "phone_e164": "+919800000003", "add_role": "SUPPORT_AGENT"}, format="json")
    assert changed.status_code == 200, changed.content
    user.refresh_from_db()
    assert (user.first_name, user.email, user.phone_e164, user.username) == (
        "Maya S", "maya.s@example.com", "+919800000003", "+919800000003")
    assert set(changed.json()["roles"]) == {"OPERATIONS_MANAGER", "SUPPORT_AGENT"}
    login = APIClient().post("/api/v1/auth/password/login/", {
        "phone_e164": "+919800000003", "password": password}, format="json")
    assert login.status_code == 200, login.content

    reset = client.post(f"{url}{user.id}/password/", {"new_password": "Replacement-password-84"}, format="json")
    assert reset.status_code == 200, reset.content
    user.refresh_from_db()
    assert user.check_password("Replacement-password-84") and not user.check_password(password)
    assert client.post(f"{url}{admin.id}/password/", {"new_password": "Another-password-84"}, format="json").status_code == 400


@pytest.mark.django_db
def test_weak_password_does_not_create_staff_and_last_super_admin_is_protected(super_admin):
    client, admin = super_admin
    response = client.post("/api/v1/admin/staff/", {"phone_e164": "+919800000004",
        "role": "SUPPORT_AGENT", "password": "short"}, format="json")
    assert response.status_code == 400
    assert not get_user_model().objects.filter(phone_e164="+919800000004").exists()
    assert client.patch(f"/api/v1/admin/staff/{admin.id}/", {"is_active": False}, format="json").status_code == 400


@pytest.mark.django_db
def test_staff_can_change_own_password_but_cannot_manage_staff(super_admin):
    client, admin = super_admin
    own = client.post("/api/v1/admin/me/password/", {"current_password": "Original-admin-password-42",
        "new_password": "New-admin-password-84"}, format="json")
    assert own.status_code == 200, own.content
    admin.refresh_from_db()
    assert admin.check_password("New-admin-password-84") and not admin.check_password("Original-admin-password-42")
    assert client.post("/api/v1/admin/me/password/", {"current_password": "wrong-password",
        "new_password": "Third-admin-password-84"}, format="json").status_code == 400

    staff = get_user_model().objects.create_user(username="+919800000005", phone_e164="+919800000005")
    staff.set_password("Staff-password-12345")
    staff.save()
    StaffRole.objects.create(user=staff, role="SUPPORT_AGENT", assigned_by=admin)
    limited = APIClient()
    limited.force_authenticate(user=staff)
    assert limited.post("/api/v1/admin/staff/", {"phone_e164": "+919800000006",
        "role": "SUPER_ADMIN", "password": "Unauthorized-pass-84"}, format="json").status_code == 403
    assert limited.post(f"/api/v1/admin/staff/{admin.id}/password/",
        {"new_password": "Unauthorized-pass-84"}, format="json").status_code == 403

    stale = APIClient()
    stale.force_authenticate(user=admin)
    assert stale.post("/api/v1/admin/staff/", {"phone_e164": "+919800000006",
        "role": "SUPPORT_AGENT", "password": "Another-staff-pass-84"}, format="json").status_code == 403

    key = f"staff-password-change-failures:{admin.pk}"
    cache.set(key, 5, 900)
    assert client.post("/api/v1/admin/me/password/", {"current_password": "New-admin-password-84",
        "new_password": "Third-admin-password-84"}, format="json").status_code == 429
    cache.delete(key)
