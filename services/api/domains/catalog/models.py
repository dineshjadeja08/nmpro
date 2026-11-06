from django.db import models

from common.models import UUIDStampedModel


class Category(UUIDStampedModel):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=240, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]


class Service(UUIDStampedModel):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="services")
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    summary = models.CharField(max_length=240)
    description = models.TextField(blank=True)
    starting_price_paise = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]


class ServiceImage(UUIDStampedModel):
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="images")
    file = models.FileField(upload_to="catalog/images/%Y/%m/")
    content_type = models.CharField(max_length=40)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "created_at"]


class ServicePackage(UUIDStampedModel):
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="packages")
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    requirements = models.JSONField(default=list)
    pricing_model = models.CharField(max_length=24, choices=[("FIXED_PRICE", "Fixed price"), ("INSPECTION_BASED", "Inspection based")])
    duration_minutes = models.PositiveSmallIntegerField()
    inclusions = models.JSONField(default=list)
    exclusions = models.JSONField(default=list)
    skill_code = models.CharField(max_length=60)
    is_active = models.BooleanField(default=False)


class PricingRule(UUIDStampedModel):
    package = models.ForeignKey(ServicePackage, on_delete=models.PROTECT, related_name="prices")
    zone = models.ForeignKey("locations.Zone", on_delete=models.PROTECT)
    base_paise = models.PositiveBigIntegerField(default=0)
    inspection_paise = models.PositiveBigIntegerField(default=0)
    fee_paise = models.PositiveBigIntegerField(default=0)
    tax_paise = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="INR")
    payment_policy = models.CharField(max_length=24, choices=[("PREPAID", "Online prepaid"), ("PAY_AT_VISIT", "Pay at visit")])
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=False)
    cancellation_cutoff_minutes = models.PositiveIntegerField(null=True, blank=True)
    reschedule_cutoff_minutes = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["package", "zone"], condition=models.Q(is_active=True), name="unique_active_price_package_zone"),
                       models.UniqueConstraint(fields=["package", "zone", "version"], name="unique_price_package_zone_version")]
