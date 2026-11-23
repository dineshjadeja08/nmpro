"""Seed the requested Plumber and Carpenter catalogues without popup variants.

Prices are the listed base amounts. A zero duration means the reference did
not specify a duration, so the customer UI does not display one.
"""

from django.db import migrations


SERVICES = {
    'plumber': (
        ('Tap & mixer', 'Tap repair', 'plumber-tap-mixer-tap-repair', 129, 0, '', True),
        ('Tap & mixer', 'Tap accessory installation', 'plumber-tap-mixer-tap-accessory-installation', 99, 0, '', True),
        ('Tap & mixer', 'Tap installation/replacement', 'plumber-tap-mixer-tap-installationreplacement', 129, 0, '', True),
        ('Toilet', 'Jet spray repair/replacement', 'plumber-toilet-jet-spray-repairreplacement', 149, 0, '', True),
        ('Toilet', 'Toilet seat cover installation', 'plumber-toilet-toilet-seat-cover-installation', 129, 30, '', False),
        ('Toilet', 'External PVC flush tank replacement', 'plumber-toilet-external-pvc-flush-tank-replacement', 449, 60, '', False),
        ('Toilet', 'Western toilet repair (wall-mounted)', 'plumber-toilet-western-toilet-repair-wall-mounted', 749, 0, '', True),
        ('Toilet', 'Indian toilet installation / blockage removal', 'plumber-toilet-indian-toilet-installation-blockage-removal', 1299, 0, '', True),
        ('Toilet', 'Flush tank repair', 'plumber-toilet-flush-tank-repair', 149, 0, '', True),
        ('Toilet', 'Western toilet repair (floor-mounted)', 'plumber-toilet-western-toilet-repair-floor-mounted', 749, 0, '', True),
        ('Bath & shower', 'Shower mixer tap installation', 'plumber-bath-shower-shower-mixer-tap-installation', 369, 60, '', False),
        ('Bath & shower', 'Shower installation', 'plumber-bath-shower-shower-installation', 129, 0, '', True),
        ('Bath & shower', 'Shower filter installation', 'plumber-bath-shower-shower-filter-installation', 149, 30, '', False),
        ('Bath & shower', 'Shower repair', 'plumber-bath-shower-shower-repair', 129, 30, '', False),
        ('Bath & shower', 'Shower diverter repair', 'plumber-bath-shower-shower-diverter-repair', 369, 60, '', False),
        ('Bath accessories', 'Soap holder installation', 'plumber-bath-accessories-soap-holder-installation', 129, 30, '', False),
        ('Bath accessories', 'Towel holder installation', 'plumber-bath-accessories-towel-holder-installation', 129, 0, '', True),
        ('Bath accessories', 'Shelf installation', 'plumber-bath-accessories-shelf-installation', 119, 0, '', True),
        ('Basin & sink', 'Wash basin leakage repair', 'plumber-basin-sink-wash-basin-leakage-repair', 129, 0, '', True),
        ('Basin & sink', 'Wash basin blockage removal', 'plumber-basin-sink-wash-basin-blockage-removal', 249, 30, '', False),
        ('Basin & sink', 'Wash basin installation', 'plumber-basin-sink-wash-basin-installation', 499, 60, '', False),
        ('Basin & sink', 'Waste coupling installation', 'plumber-basin-sink-waste-coupling-installation', 149, 0, '', True),
        ('Drainage & blockage', 'Drain cover installation', 'plumber-drainage-blockage-drain-cover-installation', 149, 20, '', False),
        ('Drainage & blockage', 'Drain blockage removal', 'plumber-drainage-blockage-drain-blockage-removal', 199, 0, '', True),
        ('Leakage & connections', 'Connection hose installation', 'plumber-leakage-connections-connection-hose-installation', 129, 15, '', False),
        ('Leakage & connections', 'Washing machine inlet / outlet installation', 'plumber-leakage-connections-washing-machine-inlet-outlet-installation', 199, 30, '', False),
        ('Leakage & connections', 'RO inlet/tap point connection', 'plumber-leakage-connections-ro-inlettap-point-connection', 129, 30, '', False),
        ('Leakage & connections', 'Geyser inlet/outlet connection', 'plumber-leakage-connections-geyser-inletoutlet-connection', 129, 20, '', False),
        ('Leakage & connections', 'Shut-off valve leakage repair', 'plumber-leakage-connections-shut-off-valve-leakage-repair', 149, 30, '', False),
        ('Water tank & motor', 'Overhead water tank installation', 'plumber-water-tank-motor-overhead-water-tank-installation', 699, 0, '', True),
        ('Water tank & motor', 'Water tank repair', 'plumber-water-tank-motor-water-tank-repair', 129, 0, '', True),
        ('Water tank & motor', 'Motor installation', 'plumber-water-tank-motor-motor-installation', 449, 60, 'Borewell motors not included', False),
        ('Water tank & motor', 'Motor air cavity removal', 'plumber-water-tank-motor-motor-air-cavity-removal', 169, 30, '', False),
    ),
    'carpenter': (
        ('Cupboard & drawer', 'Cupboard repair', 'carpenter-cupboard-drawer-cupboard-repair', 89, 0, '', True),
        ('Cupboard & drawer', 'Cupboard lock & latches', 'carpenter-cupboard-drawer-cupboard-lock-latches', 79, 0, '', True),
        ('Cupboard & drawer', 'Drawer repair & installation', 'carpenter-cupboard-drawer-drawer-repair-installation', 89, 0, '', True),
        ('Kitchen fittings', 'Pull-out drawer repair/replacement', 'carpenter-kitchen-fittings-pull-out-drawer-repairreplacement', 229, 10, '', False),
        ('Kitchen fittings', 'Cabinet hinges', 'carpenter-kitchen-fittings-cabinet-hinges', 139, 15, '', False),
        ('Kitchen fittings', 'Cabinet hydraulic repair', 'carpenter-kitchen-fittings-cabinet-hydraulic-repair', 99, 20, '', False),
        ('Kitchen fittings', 'Utensil rack installation', 'carpenter-kitchen-fittings-utensil-rack-installation', 199, 10, '', False),
        ('Kitchen fittings', 'Shelf installation', 'carpenter-kitchen-fittings-shelf-installation', 99, 0, '', True),
        ('Shelves & decor', 'Decor installation', 'carpenter-shelves-decor-decor-installation', 99, 0, '', True),
        ('Shelves & decor', 'Mirror installation', 'carpenter-shelves-decor-mirror-installation', 119, 0, '', True),
        ('Shelves & decor', 'Shelf installation', 'carpenter-shelves-decor-shelf-installation', 99, 0, '', True),
        ('Shelves & decor', 'Wall cabinet assembly & installation', 'carpenter-shelves-decor-wall-cabinet-assembly-installation', 199, 0, '', True),
        ('Shelves & decor', 'Bathroom mirror cabinet installation', 'carpenter-shelves-decor-bathroom-mirror-cabinet-installation', 499, 0, '', True),
        ('Shelves & decor', 'Drill (per hole)', 'carpenter-shelves-decor-drill-per-hole', 49, 0, '', True),
        ('Bath fittings & mirrors', 'Mirror installation', 'carpenter-bath-fittings-mirrors-mirror-installation', 119, 0, '', True),
        ('Bath fittings & mirrors', 'Soap holder installation', 'carpenter-bath-fittings-mirrors-soap-holder-installation', 99, 15, '', False),
        ('Bath fittings & mirrors', 'Towel holder installation', 'carpenter-bath-fittings-mirrors-towel-holder-installation', 99, 0, '', True),
        ('Bath fittings & mirrors', 'Shelf installation', 'carpenter-bath-fittings-mirrors-shelf-installation', 99, 0, '', True),
        ('Wooden door', 'Door repair', 'carpenter-wooden-door-door-repair', 199, 0, '', True),
        ('Wooden door', 'Door accessories & mesh installation', 'carpenter-wooden-door-door-accessories-mesh-installation', 79, 0, '', True),
        ('Wooden door', 'Door closer installation', 'carpenter-wooden-door-door-closer-installation', 179, 0, '', True),
        ('Wooden door', 'Door installation', 'carpenter-wooden-door-door-installation', 419, 0, '', True),
        ('Wooden door', 'Door lock repair & installation', 'carpenter-wooden-door-door-lock-repair-installation', 149, 0, '', True),
        ('Window & curtain', 'Window AC frame installation', 'carpenter-window-curtain-window-ac-frame-installation', 349, 60, '', False),
        ('Window & curtain', 'Mosquito net installation', 'carpenter-window-curtain-mosquito-net-installation', 149, 0, '', True),
        ('Window & curtain', 'Blinds inspection & measurement (up to 5 ft)', 'carpenter-window-curtain-blinds-inspection-measurement-up-to-5-ft', 49, 0, '', True),
        ('Window & curtain', 'Window accessories', 'carpenter-window-curtain-window-accessories', 89, 0, '', True),
        ('Window & curtain', 'Window AC frame uninstallation', 'carpenter-window-curtain-window-ac-frame-uninstallation', 99, 0, '', True),
        ('Window & curtain', 'Window misalignment/jam repair', 'carpenter-window-curtain-window-misalignmentjam-repair', 149, 0, '', True),
        ('Window & curtain', 'Curtain rod installation', 'carpenter-window-curtain-curtain-rod-installation', 189, 0, '', True),
        ('Furniture repair', 'Bed support repair', 'carpenter-furniture-repair-bed-support-repair', 349, 30, '', False),
        ('Furniture repair', 'Headboard repair', 'carpenter-furniture-repair-headboard-repair', 199, 20, '', False),
        ('Furniture repair', 'Wooden chair repair', 'carpenter-furniture-repair-wooden-chair-repair', 99, 0, '', True),
        ('Furniture repair', 'Wooden table repair', 'carpenter-furniture-repair-wooden-table-repair', 49, 0, '', True),
        ('Furniture repair', 'Wooden sofa repair', 'carpenter-furniture-repair-wooden-sofa-repair', 49, 0, '', True),
        ('Furniture repair', 'Plastic buffer installation', 'carpenter-furniture-repair-plastic-buffer-installation', 49, 0, '', True),
        ('Furniture repair', 'Table/chair wheel fitting', 'carpenter-furniture-repair-tablechair-wheel-fitting', 49, 15, '', False),
        ('Clothes hanger', 'Ceiling-mounted hanger installation', 'carpenter-clothes-hanger-ceiling-mounted-hanger-installation', 449, 0, '', True),
        ('Clothes hanger', 'Wall hanger installation', 'carpenter-clothes-hanger-wall-hanger-installation', 119, 30, '', False),
        ('Clothes hanger', 'Cloth drying rope installation', 'carpenter-clothes-hanger-cloth-drying-rope-installation', 99, 15, '', False),
        ('At home consultation', 'Carpenters consultation', 'carpenter-at-home-consultation-carpenters-consultation', 99, 20, 'Expert evaluates requirements and shares a quote; service begins immediately after acceptance', False),
    ),
}


def seed_trades(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Service = apps.get_model("catalog", "Service")
    ServicePackage = apps.get_model("catalog", "ServicePackage")
    PricingRule = apps.get_model("catalog", "PricingRule")
    Zone = apps.get_model("locations", "Zone")
    ServiceCoverage = apps.get_model("locations", "ServiceCoverage")

    categories = {}
    for trade in SERVICES:
        category = Category.objects.filter(slug=trade).first()
        if category is None:
            raise RuntimeError(f"{trade} category must exist before seeding its services")
        categories[trade] = category

    zones = list(Zone.objects.filter(is_active=True, city__is_active=True))
    new_rows = []
    new_services = []
    for trade, rows in SERVICES.items():
        existing = set(Service.objects.filter(slug__in=[row[2] for row in rows]).values_list("slug", flat=True))
        for order, (group, name, slug, rupees, minutes, description, starts_at) in enumerate(rows, 1):
            if slug in existing:
                continue  # Preserve any service already created by staff.
            is_exclusion = description == "Borewell motors not included"
            summary = description if description and not is_exclusion else f"{name}." + (f" {description}." if is_exclusion else "")
            inclusions = [description] if description and not is_exclusion else []
            exclusions = [description] if is_exclusion else []
            note = "Starts at the listed base price. Extra work or parts are quoted separately before service." if starts_at else ""
            new_rows.append((slug, name, rupees, minutes, description, inclusions, exclusions))
            new_services.append(
                Service(
                    category=categories[trade], slug=slug, name=name, summary=summary[:240],
                    description=description, starting_price_paise=rupees * 100,
                    price_note=note, sort_order=order, is_active=True, show_in_app=True,
                    inclusions=inclusions, exclusions=exclusions,
                )
            )

    if not new_rows:
        return
    Service.objects.bulk_create(new_services)
    services_by_slug = {
        service.slug: service
        for service in Service.objects.filter(slug__in=[row[0] for row in new_rows])
    }
    ServicePackage.objects.bulk_create([
        ServicePackage(
            service=services_by_slug[slug], name=name, description=description,
            pricing_model="FIXED_PRICE", duration_minutes=minutes,
            inclusions=inclusions, exclusions=exclusions,
            skill_code="PLUMBER_SPECIALIST" if slug.startswith("plumber-") else "CARPENTER_SPECIALIST",
            is_active=True,
        )
        for slug, name, rupees, minutes, description, inclusions, exclusions in new_rows
    ])
    packages_by_service = {
        package.service_id: package
        for package in ServicePackage.objects.filter(service_id__in=[service.id for service in services_by_slug.values()])
    }
    ServiceCoverage.objects.bulk_create([
        ServiceCoverage(service=service, zone=zone, is_active=True)
        for service in services_by_slug.values() for zone in zones
    ])
    price_by_slug = {row[0]: row[2] * 100 for row in new_rows}
    PricingRule.objects.bulk_create([
        PricingRule(
            package=packages_by_service[service.id], zone=zone, version=1,
            base_paise=price_by_slug[service.slug], payment_policy="PAY_AT_VISIT", is_active=True,
        )
        for service in services_by_slug.values() for zone in zones
    ])


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0019_seed_electrician_services"),
        ("locations", "0005_zone_country_zone_locality_aliases_and_more"),
    ]

    operations = [migrations.RunPython(seed_trades, migrations.RunPython.noop)]
