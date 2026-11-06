from django.contrib.auth.models import AbstractUser
from django.db import models

from common.models import UUIDStampedModel


class User(AbstractUser):
    phone_e164 = models.CharField(max_length=16, unique=True, null=True, blank=True)
    firebase_uid = models.CharField(max_length=128, unique=True, null=True, blank=True)
    # No public registration or privileged role assignment endpoint in Phase 1.

    def __str__(self):
        return self.username


class OTPChallenge(UUIDStampedModel):
    phone_e164 = models.CharField(max_length=16, db_index=True)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["phone_e164", "-created_at"])]
