"""Present the ten existing water tank sizes as three services with size packages.

Move the original packages rather than recreating them so pricing rules and
existing cart or booking references keep their package IDs.
"""

from django.db import migrations


GROUPS = (
    (
        "overhead-water-tank-cleaning",
        "Overhead Water Tank Cleaning",
        "Overhead tank cleaning with sludge removal, scrubbing, and rinse. Choose your tank size.",
        (
            ("overhead-water-tank-cleaning-up-to-1000-litres", "Up to 1000 Litres"),
            ("overhead-water-tank-cleaning-1000-to-3000-litres", "1000 to 3000 Litres"),
            ("overhead-water-tank-cleaning-3000-to-6000-litres", "3000 to 6000 Litres"),
            ("overhead-water-tank-cleaning-6000-to-10000-litres", "6000 to 10000 Litres"),
        ),
    ),
    (
        "overhead-concrete-water-tank-cleaning",
        "Overhead Concrete Water Tank Cleaning",
        "Concrete overhead tank cleaning with intensive scrubbing and sludge removal. Choose your tank size.",
        (
            ("overhead-concrete-water-tank-cleaning-up-to-1000-l", "Up to 1000 Litres"),
            ("overhead-concrete-water-tank-cleaning-1000-to-3000", "1000 to 3000 Litres"),
        ),
    ),
    (
        "underground-sump-cleaning",
        "Underground Sump Cleaning",
        "Underground sump cleaning with sludge removal and rinse. Choose your sump size.",
        (
            ("underground-sump-cleaning-up-to-5000-litres", "Up to 5000 Litres"),
            ("underground-sump-cleaning-5000-to-8000-litres", "5000 to 8000 Litres"),
            ("underground-sump-cleaning-8000-to-12000-litres", "8000 to 12000 Litres"),
            ("underground-sump-cleaning-12000-to-20000-litres", "12000 to 20000 Litres"),
        ),
    ),
)

PRESENTATION_FIELDS = (
    "description", "important_notes", "inclusions", "exclusions", "features",
    "faq_items", "process_steps", "brands", "brands_image", "brands_image_url",
    "cover_image", "landing_thumbnail", "popup_cover_image", "popup_content_image",
    "list_image", "cover_image_url", "landing_thumbnail_url", "popup_cover_image_url",
    "popup_content_image_url", "list_image_url", "show_in_app", "price_note",
)


def group_water_tank_sizes(apps, schema_editor):
    Service = apps.get_model("catalog", "Service")
    ServicePackage = apps.get_model("catalog", "ServicePackage")
    ServiceCoverage = apps.get_model("locations", "ServiceCoverage")

    for order, (slug, name, summary, sizes) in enumerate(GROUPS, start=1):
        old = {service.slug: service for service in Service.objects.filter(slug__in=[s for s, _ in sizes])}
        if not old:
            continue
        first = next(old[s] for s, _ in sizes if s in old)
        new, created = Service.objects.get_or_create(
            slug=slug,
            defaults={"category_id": first.category_id, "name": name,
                      "summary": summary, "sort_order": order, "is_active": True},
        )
        if created:
            for field in PRESENTATION_FIELDS:
                setattr(new, field, getattr(first, field))
            new.is_popular = any(s.is_popular for s in old.values())
            new.is_featured = any(s.is_featured for s in old.values())
        new.name = name
        new.summary = summary
        new.sort_order = order
        new.is_active = True

        prices = []
        for old_slug, size_label in sizes:
            source = old.get(old_slug)
            if source is None:
                continue
            for package in ServicePackage.objects.filter(service=source):
                package.service = new
                package.name = size_label
                package.save(update_fields=["service", "name"])
            if source.starting_price_paise is not None:
                prices.append(source.starting_price_paise)
            for coverage in ServiceCoverage.objects.filter(service=source):
                row, made = ServiceCoverage.objects.get_or_create(
                    service=new, zone_id=coverage.zone_id,
                    defaults={"is_active": coverage.is_active},
                )
                if not made and coverage.is_active and not row.is_active:
                    row.is_active = True
                    row.save(update_fields=["is_active"])
            source.is_active = False
            source.is_popular = False
            source.save(update_fields=["is_active", "is_popular"])

        if prices:
            new.starting_price_paise = min(prices)
        new.save()


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0017_seed_spotlight_banners"),
        ("locations", "0005_zone_country_zone_locality_aliases_and_more"),
    ]

    operations = [migrations.RunPython(group_water_tank_sizes, migrations.RunPython.noop)]
