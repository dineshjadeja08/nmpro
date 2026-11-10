from django.core.management.base import BaseCommand
from domains.catalog.models import Category, Service


DEFAULT_TREE = [
    ("ac", "AC", 1, [
        ("ac-installation", "AC Installation", "Split & window AC installation by certified technicians."),
        ("ac-uninstallation", "AC Uninstallation", "Safe AC dismantling and gas locking."),
        ("ac-general-service", "AC General Service", "Complete indoor and outdoor unit filter and coil cleaning."),
        ("ac-gas-refilling", "AC Gas Refilling", "Leak check, vacuuming, and refrigerant gas top-up."),
        ("ac-repair", "AC Repair", "PCB, compressor, cooling, and water leakage diagnostics."),
        ("ac-amc", "AC AMC", "Annual maintenance contract for hassle-free cooling."),
        ("ac-jet-cleaning", "AC Jet Cleaning", "High-pressure foam jet deep cleaning for split and window AC."),
    ]),
    ("washing-machine", "Washing Machine", 2, [
        ("washing-machine-installation", "Washing Machine Installation", "Inlet, outlet, and leveling setup for front and top load."),
        ("washing-machine-uninstallation", "Washing Machine Uninstallation", "Safe disconnection and transit locking."),
        ("washing-machine-repair", "Washing Machine Repair", "Motor, drain pump, spin, and drum repair."),
        ("washing-machine-service", "Washing Machine Service", "Full preventive checkup and inlet filter clean."),
        ("washing-machine-drum-cleaning", "Washing Machine Drum Cleaning", "Descaling and bacterial drum deep wash."),
    ]),
    ("water-heater", "Water Heater", 3, [
        ("water-heater-installation", "Water Heater Installation", "Wall mounting and plumbing connection for geysers."),
        ("water-heater-uninstallation", "Water Heater Uninstallation", "Safe removal and plumbing capping."),
        ("water-heater-repair", "Water Heater Repair", "Thermostat, leakage, and heating fault resolution."),
        ("water-heater-service", "Water Heater Service", "Tank descaling and anode rod checkup."),
        ("water-heater-element-replacement", "Water Heater Element Replacement", "Replacement of burnt heating coil with testing."),
    ]),
    ("tv", "TV", 4, [
        ("tv-wall-mounting", "TV Wall Mounting", "Fixed or swivel bracket wall mounting with level check."),
        ("tv-installation", "TV Installation", "Unboxing, stand/wall fitment, and AV configuration."),
        ("tv-uninstallation", "TV Uninstallation", "Careful demounting for shifting or upgrade."),
        ("tv-repair", "TV Repair", "Backlight, display panel, power supply, and sound repair."),
    ]),
    ("refrigerator", "Refrigerator", 5, [
        ("refrigerator-repair", "Refrigerator Repair", "Cooling issue, compressor, and thermostat repair."),
        ("refrigerator-gas-refill", "Refrigerator Gas Refill", "Gas charging for single-door, double-door, and side-by-side fridges."),
    ]),
    ("microwave-oven", "Microwave Oven", 6, [
        ("microwave-oven-repair", "Microwave Oven Repair", "Magnetron, touchpad, heating, and turntable service."),
    ]),
    ("chimney", "Chimney", 7, [
        ("chimney-deep-cleaning", "Chimney Deep Cleaning", "Filter degreasing and motor blower cleanup."),
        ("chimney-installation", "Chimney Installation", "Ducting and wall-mount hood installation."),
    ]),
    ("fan", "Fan", 8, [
        ("ceiling-fan-installation", "Fan Installation & Repair", "Ceiling, exhaust, and wall fan installation or capacitor fix."),
    ]),
    ("cooler", "Cooler", 9, [
        ("air-cooler-service", "Air Cooler Service & Repair", "Pump, motor, and cooling pad replacement."),
    ]),
    ("inverter-ups", "Inverter / UPS", 10, [
        ("inverter-ups-installation", "Inverter & UPS Installation", "Home inverter, battery wiring, and load testing."),
    ]),
    ("other-appliances", "Other Appliances", 11, [
        ("other-appliance-inspection", "Other Appliance Inspection", "Doorstep diagnostic visit for household appliances."),
    ]),
]


class Command(BaseCommand):
    help = "Ensure core Service Categories and Sub-Services exist without any default images."

    def handle(self, *args, **options):
        cat_created = 0
        svc_created = 0
        for slug, name, sort_order, items in DEFAULT_TREE:
            cat, created = Category.objects.get_or_create(
                slug=slug,
                defaults={"name": name, "sort_order": sort_order, "is_active": True},
            )
            if created:
                cat_created += 1
            elif cat.sort_order == 0:
                cat.sort_order = sort_order
                cat.save(update_fields=["sort_order"])

            for idx, (s_slug, s_name, summary) in enumerate(items, start=1):
                _, screated = Service.objects.get_or_create(
                    slug=s_slug,
                    defaults={
                        "category": cat,
                        "name": s_name,
                        "summary": summary,
                        "sort_order": idx,
                        "is_active": True,
                    },
                )
                if screated:
                    svc_created += 1
        self.stdout.write(f"Seeded categories={cat_created}, sub_services={svc_created}")
