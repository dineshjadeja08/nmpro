"""Group the five "TV Wall Mount - <size>" services into one "TV Installation" service with a size option each.

The existing options (packages) are moved, not copied, so their prices per zone, time slots and booking
history stay attached. The old services are switched off. Runs once; does nothing where those services
don't exist (a fresh database), and leaves an existing "tv-installation" service's own details alone.
"""
from django.db import migrations

SIZES = [
    ("tv-wall-mount-up-to-26-inch", "Up to 26 inch"),
    ("tv-wall-mount-32-to-43-inch", "32 to 43 inch"),
    ("tv-wall-mount-46-to-55-inch", "46 to 55 inch"),
    ("tv-wall-mount-56-to-65-inch", "56 to 65 inch"),
    ("tv-wall-mount-over-75-inch", "Over 75 inch"),
]
NEW_SLUG = "tv-installation"
COPY_FIELDS = [
    "summary", "description", "important_notes", "inclusions", "exclusions", "features", "faq_items",
    "process_steps", "brands", "cover_image", "landing_thumbnail", "popup_cover_image", "popup_content_image",
    "list_image", "cover_image_url", "landing_thumbnail_url", "popup_cover_image_url", "popup_content_image_url",
    "list_image_url", "show_in_app",
]


def group_sizes(apps, schema_editor):
    Service = apps.get_model("catalog", "Service")
    ServicePackage = apps.get_model("catalog", "ServicePackage")
    ServiceCoverage = apps.get_model("locations", "ServiceCoverage")

    old = {s.slug: s for s in Service.objects.filter(slug__in=[slug for slug, _ in SIZES])}
    if not old:
        return
    first = old.get(SIZES[0][0]) or next(iter(old.values()))

    new, created = Service.objects.get_or_create(
        slug=NEW_SLUG,
        defaults={"category_id": first.category_id, "name": "TV Installation",
                  "summary": "TV wall mounting with bracket alignment and a basic safety check. Pick your TV size.",
                  "sort_order": first.sort_order, "is_active": True},
    )
    if created:
        for field in COPY_FIELDS:
            setattr(new, field, getattr(first, field))
        new.summary = "TV wall mounting with bracket alignment and a basic safety check. Pick your TV size."
        new.is_popular = any(s.is_popular for s in old.values())
        new.is_featured = any(s.is_featured for s in old.values())

    prices = []
    for slug, label in SIZES:
        service = old.get(slug)
        if service is None:
            continue
        for package in ServicePackage.objects.filter(service=service):
            package.service = new
            package.name = label
            package.save(update_fields=["service", "name"])
        if service.starting_price_paise:
            prices.append(service.starting_price_paise)
        for coverage in ServiceCoverage.objects.filter(service=service):
            row, made = ServiceCoverage.objects.get_or_create(
                service=new, zone_id=coverage.zone_id, defaults={"is_active": coverage.is_active})
            if not made and coverage.is_active and not row.is_active:
                row.is_active = True
                row.save(update_fields=["is_active"])
        service.is_active = False
        service.is_popular = False
        service.save(update_fields=["is_active", "is_popular"])

    if prices:
        new.starting_price_paise = min(prices)
    new.is_active = True
    new.save()


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0013_brand_library"),
        ("locations", "0005_zone_country_zone_locality_aliases_and_more"),
    ]

    operations = [migrations.RunPython(group_sizes, migrations.RunPython.noop)]
