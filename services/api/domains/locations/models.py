from django.conf import settings
from django.db import models

from common.models import UUIDStampedModel


class City(UUIDStampedModel):
    name = models.CharField(max_length=80)
    slug = models.SlugField(unique=True)
    is_active = models.BooleanField(default=False)


class Zone(UUIDStampedModel):
    city = models.ForeignKey(City, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=6)
    state = models.CharField(max_length=80, default="Tamil Nadu")
    operational_capacity = models.PositiveSmallIntegerField(default=0)
    working_hours = models.JSONField(default=list)
    is_active = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["city", "postal_code"], name="unique_zone_city_postal")]


class ServiceCoverage(UUIDStampedModel):
    zone = models.ForeignKey(Zone, on_delete=models.PROTECT)
    service = models.ForeignKey("catalog.Service", on_delete=models.PROTECT)
    is_active = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["zone", "service"], name="unique_service_zone_coverage")]


class Address(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    zone = models.ForeignKey(Zone, on_delete=models.PROTECT, null=True, blank=True)
    line_1 = models.CharField(max_length=200)
    label = models.CharField(max_length=60, default="Home")
    contact_name = models.CharField(max_length=100, default="")
    contact_phone = models.CharField(max_length=16, blank=True)
    house_flat = models.CharField(max_length=80, default="")
    street = models.CharField(max_length=120, default="")
    locality = models.CharField(max_length=100)
    city = models.CharField(max_length=80)
    state = models.CharField(max_length=80, default="Tamil Nadu")
    postal_code = models.CharField(max_length=6)
    landmark = models.CharField(max_length=120, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_default = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user"], condition=models.Q(is_default=True, archived_at__isnull=True), name="unique_live_default_address")]
