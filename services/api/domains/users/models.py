from django.contrib.auth.models import AbstractUser
from django.db import models

from common.models import UUIDStampedModel


class User(AbstractUser):
    phone_e164 = models.CharField(max_length=16, unique=True, null=True, blank=True)
    firebase_uid = models.CharField(max_length=128, unique=True, null=True, blank=True)
    customer_code = models.CharField(max_length=16, unique=True, null=True, blank=True)
    # No public registration or privileged role assignment endpoint in Phase 1.

    def save(self, *args, **kwargs):
        if not self.customer_code:
            from common.sequences import next_customer_code
            self.customer_code = next_customer_code()
        return super().save(*args, **kwargs)

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


class CustomerProfile(UUIDStampedModel):
    user = models.OneToOneField("users.User", on_delete=models.CASCADE, related_name="customer_profile")
    full_name = models.CharField(max_length=120, blank=True)
    alternate_phone = models.CharField(max_length=16, blank=True)
    preferred_language = models.CharField(max_length=20, default="en")
    support_notes = models.TextField(blank=True)


class BlacklistedRefreshToken(UUIDStampedModel):
    jti = models.CharField(max_length=64, unique=True)
    user = models.ForeignKey("users.User", on_delete=models.CASCADE)
    expires_at = models.DateTimeField()
