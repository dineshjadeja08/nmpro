"""Create the first admin from environment variables (for hosts without a shell, e.g. Render's free plan).

Runs on every API start (see the Dockerfile). It does nothing unless both variables are set:

    BOOTSTRAP_ADMIN_PHONE=+919840012345
    BOOTSTRAP_ADMIN_PASSWORD=<at least 12 characters>
    BOOTSTRAP_ADMIN_NAME=Dinesh            (optional)

When they are set, that number becomes a Super Admin with that password. Remove the variables after the first
sign-in: while they stay, every restart sets the password back to this value.
"""
import os

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create or update a Super Admin from BOOTSTRAP_ADMIN_* environment variables (no-op when unset)."

    def handle(self, *args, **options):
        phone = os.environ.get("BOOTSTRAP_ADMIN_PHONE", "").strip()
        if not phone or not os.environ.get("BOOTSTRAP_ADMIN_PASSWORD"):
            self.stdout.write("bootstrap_admin: BOOTSTRAP_ADMIN_PHONE / BOOTSTRAP_ADMIN_PASSWORD not set, nothing to do.")
            return
        args = [phone, "--role", "SUPER_ADMIN", "--password-env", "BOOTSTRAP_ADMIN_PASSWORD"]
        name = os.environ.get("BOOTSTRAP_ADMIN_NAME", "").strip()
        if name:
            args += ["--name", name]
        try:
            call_command("create_admin", *args, stdout=self.stdout)
        except CommandError as exc:
            # Never stop the API from starting; the reason is in the deploy log.
            self.stderr.write(f"bootstrap_admin: admin not created: {exc}")
            return
        self.stdout.write("bootstrap_admin: done. Remove BOOTSTRAP_ADMIN_* from the environment after signing in.")
