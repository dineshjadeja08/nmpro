from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from common.models import UUIDStampedModel


class Category(UUIDStampedModel):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=240, blank=True)
    image = models.ImageField(upload_to="categories/", blank=True, null=True)
    image_url = models.URLField(max_length=500, blank=True, default="")
    banner_image = models.ImageField(upload_to="categories/banners/", blank=True, null=True)
    banner_image_url = models.URLField(max_length=500, blank=True, default="")
    banner_title = models.CharField(max_length=160, blank=True, default="")
    banner_subtitle = models.CharField(max_length=320, blank=True, default="")
    banner_button_text = models.CharField(max_length=60, blank=True, default="")
    banner_button_link = models.CharField(max_length=300, blank=True, default="")
    banner_is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]

    @property
    def image_display(self):
        if self.image_url:
            return self.image_url
        if self.image and getattr(self.image, "name", ""):
            return f"/api/v1/catalog/categories/{self.id}/media/card/"
        return None

    @property
    def banner_image_display(self):
        if self.banner_image_url:
            return self.banner_image_url
        if self.banner_image and getattr(self.banner_image, "name", ""):
            return f"/api/v1/catalog/categories/{self.id}/media/banner/"
        return None


class Service(UUIDStampedModel):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="services")
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    summary = models.CharField(max_length=240)
    description = models.TextField(blank=True)
    starting_price_paise = models.PositiveIntegerField(null=True, blank=True)
    price_note = models.CharField(max_length=160, blank=True, default="")

    banner_title = models.CharField(max_length=160, blank=True, default="")
    banner_subtitle = models.CharField(max_length=320, blank=True, default="")
    banner_button_text = models.CharField(max_length=60, blank=True, default="")
    banner_button_link = models.CharField(max_length=300, blank=True, default="")
    banner_is_active = models.BooleanField(default=True)

    # 5 Presentation image fields matching Purple Squad
    cover_image = models.ImageField(upload_to="services/covers/", blank=True, null=True)
    landing_thumbnail = models.ImageField(upload_to="services/landing-thumbnails/", blank=True, null=True)
    popup_cover_image = models.ImageField(upload_to="services/popup-covers/", blank=True, null=True)
    popup_content_image = models.ImageField(upload_to="services/popup-content/", blank=True, null=True)
    list_image = models.ImageField(upload_to="services/list-images/", blank=True, null=True)

    # URL overrides for Cloudinary or external image URLs
    cover_image_url = models.URLField(max_length=500, blank=True, default="")
    landing_thumbnail_url = models.URLField(max_length=500, blank=True, default="")
    popup_cover_image_url = models.URLField(max_length=500, blank=True, default="")
    popup_content_image_url = models.URLField(max_length=500, blank=True, default="")
    list_image_url = models.URLField(max_length=500, blank=True, default="")

    is_active = models.BooleanField(default=True)
    is_popular = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    show_in_app = models.BooleanField(default=True)
    training_fee_paise = models.PositiveIntegerField(default=0)
    important_notes = models.TextField(blank=True, default="")
    features = models.JSONField(default=list)
    inclusions = models.JSONField(default=list)
    exclusions = models.JSONField(default=list)
    faq_items = models.JSONField(default=list)
    process_steps = models.JSONField(default=list, blank=True)
    spare_parts_rates = models.JSONField(default=list, blank=True)
    seo_title = models.CharField(max_length=160, blank=True, default="")
    seo_description = models.CharField(max_length=320, blank=True, default="")
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def save(self, *args, **kwargs):
        old_slug = None
        if not self._state.adding and self.pk:
            old_slug = Service.objects.filter(pk=self.pk).values_list("slug", flat=True).first()
        super().save(*args, **kwargs)
        if old_slug and old_slug != self.slug:
            ServiceSlugHistory.objects.update_or_create(old_slug=old_slug, defaults={"service": self})

    def get_image_url(self, field_name):
        url_override = getattr(self, f"{field_name}_url", None)
        if url_override:
            return url_override
        field = getattr(self, field_name, None)
        if field and getattr(field, "name", ""):
            return f"/api/v1/catalog/services/{self.id}/media/{field_name}/"
        return None

    @property
    def main_image_display(self):
        return self.get_image_url("cover_image")

    @property
    def banner_image_display(self):
        return self.get_image_url("landing_thumbnail")

    @property
    def cover_image_display(self):
        return self.get_image_url("cover_image")

    @property
    def landing_thumbnail_display(self):
        return self.get_image_url("landing_thumbnail")

    @property
    def popup_cover_image_display(self):
        return self.get_image_url("popup_cover_image")

    @property
    def popup_content_image_display(self):
        return self.get_image_url("popup_content_image")

    @property
    def list_image_display(self):
        return self.get_image_url("list_image")


class ServiceImage(UUIDStampedModel):
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="images")
    file = models.FileField(upload_to="catalog/images/%Y/%m/")
    content_type = models.CharField(max_length=40)
    alt_text = models.CharField(max_length=200, blank=True, default="")
    cloudinary_url = models.URLField(max_length=500, blank=True, default="")
    cloudinary_public_id = models.CharField(max_length=200, blank=True, default="")
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
    original_price_paise = models.PositiveBigIntegerField(null=True, blank=True)
    is_most_booked = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)


class PricingRule(UUIDStampedModel):
    package = models.ForeignKey(ServicePackage, on_delete=models.PROTECT, related_name="prices")
    zone = models.ForeignKey("locations.Zone", on_delete=models.PROTECT)
    base_paise = models.PositiveBigIntegerField(default=0)
    inspection_paise = models.PositiveBigIntegerField(default=0)
    fee_paise = models.PositiveBigIntegerField(default=0)
    tax_paise = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="INR")
    payment_policy = models.CharField(max_length=24, choices=[("PREPAID", "Online prepaid"), ("PAY_AT_VISIT", "Pay at visit"), ("ADVANCE", "Advance payment")])
    advance_type = models.CharField(max_length=20, choices=[("NONE", "None"), ("PERCENTAGE", "Percentage"), ("FIXED", "Fixed amount")], default="NONE")
    advance_percentage = models.PositiveSmallIntegerField(default=0)
    advance_amount_paise = models.PositiveBigIntegerField(default=0)
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=False)
    cancellation_cutoff_minutes = models.PositiveIntegerField(null=True, blank=True)
    reschedule_cutoff_minutes = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["package", "zone"], condition=models.Q(is_active=True), name="unique_active_price_package_zone"),
                       models.UniqueConstraint(fields=["package", "zone", "version"], name="unique_price_package_zone_version")]


class ServiceSlugHistory(UUIDStampedModel):
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="slug_history")
    old_slug = models.SlugField(unique=True)


class SEOLandingPage(UUIDStampedModel):
    page_slug = models.SlugField(max_length=160, unique=True)
    title = models.CharField(max_length=160)
    service = models.ForeignKey(Service, on_delete=models.PROTECT, null=True, blank=True, related_name="seo_pages")
    city = models.ForeignKey("locations.City", on_delete=models.PROTECT, null=True, blank=True)
    area_slug = models.SlugField(max_length=100, blank=True, default="")
    meta_title = models.CharField(max_length=160, blank=True, default="")
    meta_description = models.CharField(max_length=320, blank=True, default="")
    hero_heading = models.CharField(max_length=200, blank=True, default="")
    hero_summary = models.TextField(blank=True, default="")
    content_html = models.TextField(blank=True, default="")
    featured_services = models.ManyToManyField(Service, blank=True, related_name="featured_in_seo_pages")
    status = models.CharField(max_length=20, choices=[("DRAFT", "Draft"), ("PUBLISHED", "Published")], default="DRAFT")


class BlogPost(UUIDStampedModel):
    slug = models.SlugField(max_length=160, unique=True)
    title = models.CharField(max_length=180)
    excerpt = models.CharField(max_length=400, blank=True, default="")
    content = models.TextField(blank=True, default="")
    cover_image_url = models.URLField(max_length=500, blank=True, default="")
    author_name = models.CharField(max_length=100, blank=True, default="NammaPros Team")
    meta_title = models.CharField(max_length=160, blank=True, default="")
    meta_description = models.CharField(max_length=320, blank=True, default="")
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)


class FAQ(UUIDStampedModel):
    question = models.CharField(max_length=300)
    answer = models.TextField()
    service = models.ForeignKey(Service, on_delete=models.CASCADE, null=True, blank=True, related_name="faqs")
    category = models.ForeignKey(Category, on_delete=models.CASCADE, null=True, blank=True, related_name="faqs")
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "created_at"]


class HomepageBanner(UUIDStampedModel):
    PLACEMENT_CHOICES = [("HERO", "Hero"), ("MAIN", "Main"), ("CATEGORY", "Category"), ("SERVICE", "Service"), ("PROMO", "Promo")]
    title = models.CharField(max_length=160)
    subtitle = models.CharField(max_length=300, blank=True, default="")
    placement = models.CharField(max_length=20, choices=PLACEMENT_CHOICES, default="HERO")
    desktop_image_url = models.URLField(max_length=500, blank=True, default="")
    mobile_image_url = models.URLField(max_length=500, blank=True, default="")
    target_url = models.CharField(max_length=300, blank=True, default="")
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "created_at"]


class Review(UUIDStampedModel):
    booking = models.OneToOneField("bookings.Booking", on_delete=models.PROTECT, related_name="review")
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="reviews")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reviews")
    technician = models.ForeignKey("technicians.TechnicianProfile", on_delete=models.PROTECT, null=True, blank=True, related_name="reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(max_length=2000, blank=True, default="")
    tags = models.JSONField(default=list, blank=True)
    photo = models.ImageField(upload_to="reviews/photos/", blank=True, null=True)
    photo_url = models.URLField(max_length=500, blank=True, default="")
    is_visible = models.BooleanField(default=True)
    moderated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="moderated_reviews")
    moderation_note = models.CharField(max_length=240, blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    @property
    def photo_display(self):
        if self.photo_url:
            return self.photo_url
        if self.photo and getattr(self.photo, "name", ""):
            return f"/api/v1/catalog/reviews/{self.id}/photo/"
        return None
