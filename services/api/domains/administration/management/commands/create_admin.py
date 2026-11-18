"""Create or update a staff account that signs in to the admin site with a password.

Run once in Render's Shell (or locally):

    python manage.py create_admin +919840012345 --name "Dinesh"
    python manage.py create_admin +919840012345 --role OPERATIONS_MANAGER

The password is asked for twice and never shown. For scripts, pass it in an environment variable instead:

    ADMIN_PASSWORD=... python manage.py create_admin +919840012345 --password-env ADMIN_PASSWORD
"""
import getpass
import os
import re

from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from domains.administration.models import ROLES, StaffRole

MIN_LENGTH = 12


def normalise_phone(raw: str) -> str:
    digits = re.sub(r"[^\d+]", "", raw)
    if re.fullmatch(r"\d{10}", digits):
        digits = f"+91{digits}"
    if not re.fullmatch(r"\+91[6-9]\d{9}", digits):
        raise CommandError("Use an Indian mobile number, e.g. +919840012345.")
    return digits


class Command(BaseCommand):
    help = "Create or update a staff account (password sign-in) with an admin role."

    def add_arguments(self, parser):
        parser.add_argument("phone", help="Mobile number, e.g. +919840012345")
        parser.add_argument("--role", default="SUPER_ADMIN", choices=ROLES, help="Staff role (default SUPER_ADMIN)")
        parser.add_argument("--name", default="", help="First name shown in the admin site")
        parser.add_argument("--password-env", default="", help="Read the password from this environment variable")

    def _password(self, options, user):
        if options["password_env"]:
            password = os.environ.get(options["password_env"], "")
            if not password:
                raise CommandError(f"Environment variable {options['password_env']} is empty.")
        else:
            password = getpass.getpass("New password: ")
            if password != getpass.getpass("Repeat the password: "):
                raise CommandError("The passwords do not match.")
        if len(password) < MIN_LENGTH:
            raise CommandError(f"Use at least {MIN_LENGTH} characters.")
        try:
            password_validation.validate_password(password, user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc
        return password

    def handle(self, *args, **options):
        phone = normalise_phone(options["phone"])
        User = get_user_model()
        user = User.objects.filter(phone_e164=phone).first() or User(username=phone, phone_e164=phone)
        password = self._password(options, user)
        with transaction.atomic():
            created = user.pk is None
            user.is_active = True
            if options["name"]:
                user.first_name = options["name"][:150]
            user.set_password(password)
            user.save()
            _, role_added = StaffRole.objects.get_or_create(user=user, role=options["role"], defaults={"assigned_by": user})
        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if created else 'Updated'} {phone}: password set"
            + (f", role {options['role']} added." if role_added else f", already {options['role']}.")))
        self.stdout.write("Sign in at the admin site with this phone number and password.")
