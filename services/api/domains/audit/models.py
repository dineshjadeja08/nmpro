from django.conf import settings
from django.db import models

from common.models import UUIDStampedModel


class AuditLog(UUIDStampedModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    action = models.CharField(max_length=80)
    resource_type = models.CharField(max_length=80)
    resource_id = models.CharField(max_length=80)
    metadata = models.JSONField(default=dict)
