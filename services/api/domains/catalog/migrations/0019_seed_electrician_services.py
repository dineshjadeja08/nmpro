"""Add the requested Electrician catalogue without the reference site's options.

Each service has one bookable package. The supplied amounts are base service
prices; entries marked "Starts at" may need a separate quote for extra work.
"""

from django.db import migrations
from django.utils.text import slugify


# Group, name, rupee price, description, duration when supplied, starts-at flag.
SERVICES = (
    ("Switch & socket", "New switchbox / switchboard installation", 149, "Installed in the specified area for a new power outlet.", 0, True),
    ("Fan", "Fan repair", 149, "BLDC and smart fan repair is not included.", 0, True),
    ("Fan", "Regular ceiling fan installation", 99, "Installation of a regular ceiling fan.", 0, True),
    ("Fan", "Decorative fan installation", 99, "Installation of a decorative fan.", 0, True),
    ("Fan", "Smart/BLDC fan installation", 99, "Installation of a smart or BLDC fan.", 0, True),
    ("Fan", "Exhaust/pedestal/tower fan installation", 99, "Installation of an exhaust, pedestal, or tower fan.", 0, True),
    ("Fan", "Fan regulator replacement", 89, "Replacement of a fan regulator.", 30, False),
    ("Light", "Fancy light installation/replacement", 149, "Installation or replacement of a fancy light.", 30, False),
    ("Light", "Tubelight installation / replacement", 119, "Installation or replacement of a tubelight.", 30, False),
    ("Light", "Bulb installation/replacement", 49, "Installation or replacement of a bulb.", 0, True),
    ("Light", "Ceiling light installation", 149, "Installation of a ceiling light.", 0, True),
    ("Light", "Hanging light installation", 199, "Installation of a hanging light.", 40, False),
    ("Light", "Chandelier installation", 499, "Installation of a chandelier.", 0, True),
    ("Wiring", "New internal wiring (per 5 m)", 199, "Internal wiring, charged per 5 m.", 15, False),
    ("Wiring", "New external wiring (per 5 m)", 119, "External wiring, charged per 5 m.", 0, True),
    ("Doorbell & security", "Regular doorbell installation", 99, "Installation of a regular doorbell.", 0, True),
    ("Doorbell & security", "Video doorbell installation", 600, "Installation of a video doorbell.", 0, True),
    ("Doorbell & security", "Wireless CCTV installation", 299, "Installation of wireless CCTV.", 30, False),
    ("MCB/fuse", "MCB / Fuse repair or replacement", 119, "Repair or replacement of an MCB or fuse.", 0, True),
    ("MCB/fuse", "Submeter installation", 249, "Installation of a submeter.", 0, True),
    ("MCB/fuse", "3-phase changeover switch installation", 299, "Installation of a switch to change supply in a 3-phase power source.", 30, False),
    ("Appliances", "Home theatre installation", 399, "Installation of 2 speakers, 1 sound bar, and 1 subwoofer.", 80, False),
    ("Appliances", "TV installation", 399, "Television installation.", 0, True),
    ("Appliances", "TV uninstallation", 249, "Television uninstallation.", 0, True),
    ("Appliances", "Sound bar installation", 99, "Sound bar installation.", 60, False),
    ("Appliances", "Karban Airzone installation", 399, "Includes electrical connection and remote testing.", 0, True),
    ("Appliances", "Inverter installation", 485, "Inverter installation.", 0, True),
    ("Appliances", "Stabiliser installation", 149, "Stabiliser installation.", 45, False),
    ("Appliances", "Inverter fuse replacement", 99, "Inverter fuse replacement.", 15, False),
    ("Appliances", "Inverter servicing", 249, "Terminal dust removal and distilled water top-up.", 60, False),
    ("Appliances", "Inverter check-up", 160, "Check-up to identify issues before repair.", 40, False),
    ("Appliances", "Inverter uninstallation", 499, "Inverter uninstallation.", 30, False),
)


def seed_electrician(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Service = apps.get_model("catalog", "Service")
    ServicePackage = apps.get_model("catalog", "ServicePackage")
    PricingRule = apps.get_model("catalog", "PricingRule")
    Zone = apps.get_model("locations", "Zone")
    ServiceCoverage = apps.get_model("locations", "ServiceCoverage")

    category = Category.objects.filter(slug="electrician").first()
    if category is None:
        raise RuntimeError("Electrician category must exist before seeding its services")
    zones = list(Zone.objects.filter(is_active=True, city__is_active=True))

    for order, (group, name, rupees, description, minutes, starts_at) in enumerate(SERVICES, 1):
        slug = f"electrician-{slugify(name)}"
        note = "Starts at the listed base price. Extra work or parts are quoted separately before service." if starts_at else ""
        exclusions = [description] if name == "Fan repair" else []
        inclusions = [] if exclusions else [description]
        service, _ = Service.objects.get_or_create(
            slug=slug,
            defaults={
                "category": category, "name": name, "summary": description,
                "description": description, "starting_price_paise": rupees * 100,
                "price_note": note, "sort_order": order, "is_active": True,
                "show_in_app": True, "inclusions": inclusions, "exclusions": exclusions,
            },
        )
        package, _ = ServicePackage.objects.get_or_create(
            service=service, name=name,
            defaults={
                "description": description, "pricing_model": "FIXED_PRICE",
                "duration_minutes": minutes, "inclusions": inclusions,
                "exclusions": exclusions, "skill_code": "ELECTRICIAN_SPECIALIST",
                "is_active": True,
            },
        )
        for zone in zones:
            ServiceCoverage.objects.get_or_create(
                service=service, zone=zone, defaults={"is_active": True},
            )
            PricingRule.objects.get_or_create(
                package=package, zone=zone, version=1,
                defaults={
                    "base_paise": rupees * 100, "payment_policy": "PAY_AT_VISIT",
                    "is_active": True,
                },
            )


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0018_group_water_tank_sizes"),
        ("locations", "0005_zone_country_zone_locality_aliases_and_more"),
    ]

    operations = [migrations.RunPython(seed_electrician, migrations.RunPython.noop)]
