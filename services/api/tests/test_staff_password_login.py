"""Staff password sign-in for the admin and operations sites, and the create_admin command."""
import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from domains.administration.models import StaffRole

User = get_user_model()
URL = "/api/v1/auth/password/login/"


@pytest.fixture(autouse=True)
def clear_cache():
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


def make_user(phone, password="correct-horse-battery", role=None):
    user = User.objects.create_user(username=phone, phone_e164=phone, is_active=True)
    user.set_password(password)
    user.save()
    if role:
        StaffRole.objects.create(user=user, role=role, assigned_by=user)
    return user


@pytest.mark.django_db
def test_staff_sign_in_with_phone_and_password_opens_admin():
    make_user("+919840055501", role="SUPER_ADMIN")
    client = APIClient(enforce_csrf_checks=True)
    token = client.get("/api/v1/auth/csrf/").json()["csrf_token"]
    response = client.post(URL, {"phone_e164": "98400 55501", "password": "correct-horse-battery"}, format="json",
                           HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 200, response.content
    assert client.get("/api/v1/admin/me/").status_code == 200  # session cookie works for the admin site


@pytest.mark.django_db
def test_password_login_is_refused_without_csrf_token():
    make_user("+919840055506", role="SUPER_ADMIN")
    client = APIClient(enforce_csrf_checks=True)
    assert client.post(URL, {"phone_e164": "+919840055506", "password": "correct-horse-battery"},
                       format="json").status_code == 403


@pytest.mark.django_db
def test_non_staff_account_cannot_use_password_login():
    make_user("+919840055502")  # customer or partner who somehow has a password
    response = APIClient().post(URL, {"phone_e164": "+919840055502", "password": "correct-horse-battery"}, format="json")
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Invalid phone number or password."


@pytest.mark.django_db
def test_five_wrong_passwords_lock_the_account():
    make_user("+919840055503", role="SUPER_ADMIN")
    client = APIClient()
    for _ in range(5):
        assert client.post(URL, {"phone_e164": "+919840055503", "password": "wrong"}, format="json").status_code == 401
    locked = client.post(URL, {"phone_e164": "+919840055503", "password": "correct-horse-battery"}, format="json")
    assert locked.status_code == 429


@pytest.mark.django_db
def test_create_admin_command_makes_a_super_admin(monkeypatch):
    monkeypatch.setenv("NEW_ADMIN_PASSWORD", "a-long-staff-password-42")
    call_command("create_admin", "9840055504", "--name", "Dinesh", "--password-env", "NEW_ADMIN_PASSWORD")
    user = User.objects.get(phone_e164="+919840055504")
    assert user.first_name == "Dinesh" and user.check_password("a-long-staff-password-42")
    assert StaffRole.objects.filter(user=user, role="SUPER_ADMIN").exists()
    response = APIClient().post(URL, {"phone_e164": "+919840055504", "password": "a-long-staff-password-42"}, format="json")
    assert response.status_code == 200

    # Running it again resets the password instead of creating a second account.
    monkeypatch.setenv("NEW_ADMIN_PASSWORD", "another-long-password-77")
    call_command("create_admin", "+919840055504", "--password-env", "NEW_ADMIN_PASSWORD")
    assert User.objects.filter(phone_e164="+919840055504").count() == 1
    assert User.objects.get(phone_e164="+919840055504").check_password("another-long-password-77")


@pytest.mark.django_db
def test_create_admin_rejects_short_passwords(monkeypatch):
    monkeypatch.setenv("NEW_ADMIN_PASSWORD", "short")
    with pytest.raises(CommandError):
        call_command("create_admin", "+919840055505", "--password-env", "NEW_ADMIN_PASSWORD")
    assert not User.objects.filter(phone_e164="+919840055505").exists()


@pytest.mark.django_db
def test_bootstrap_admin_does_nothing_without_variables(monkeypatch):
    monkeypatch.delenv("BOOTSTRAP_ADMIN_PHONE", raising=False)
    monkeypatch.delenv("BOOTSTRAP_ADMIN_PASSWORD", raising=False)
    call_command("bootstrap_admin")
    assert not StaffRole.objects.exists()


@pytest.mark.django_db
def test_bootstrap_admin_creates_super_admin_from_environment(monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PHONE", "+919840055507")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "a-long-bootstrap-pass-91")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_NAME", "Owner")
    call_command("bootstrap_admin")
    call_command("bootstrap_admin")  # every restart runs it; still one account and one role
    user = User.objects.get(phone_e164="+919840055507")
    assert user.first_name == "Owner" and StaffRole.objects.filter(user=user, role="SUPER_ADMIN").count() == 1
    assert APIClient().post(URL, {"phone_e164": "+919840055507", "password": "a-long-bootstrap-pass-91"},
                            format="json").status_code == 200


@pytest.mark.django_db
def test_bootstrap_admin_with_a_weak_password_creates_nothing_and_does_not_crash(monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PHONE", "+919840055508")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "short")
    call_command("bootstrap_admin")
    assert not User.objects.filter(phone_e164="+919840055508").exists()
