import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model

from domains.catalog.models import Category, Service, ServicePackage, PricingRule
from domains.locations.models import City, Zone, ServiceCoverage, Address
from domains.bookings.models import AppointmentSlot


class Command(BaseCommand):
    help = "Seed realistic local demo data including packages, zones, slots, and test addresses for full end-to-end testing."

    def handle(self, *args, **options):
        # 1. City & Zones (Matching Google Maps suggestions)
        city, _ = City.objects.get_or_create(slug="chennai", defaults={"name": "Chennai", "is_active": True})
        city.is_active = True
        city.save()

        zones_data = [
            ("Anna Nagar", "600040"),
            ("Adyar", "600020"),
            ("T. Nagar", "600017"),
            ("Velachery", "600042"),
        ]
        zones = []
        for name, pin in zones_data:
            zone, _ = Zone.objects.get_or_create(
                city=city,
                postal_code=pin,
                defaults={
                    "name": name,
                    "state": "Tamil Nadu",
                    "operational_capacity": 25,
                    "is_active": True,
                },
            )
            zone.is_active = True
            zone.operational_capacity = 25
            zone.save()
            zones.append(zone)

        # 2. Categories & Services
        cat_ac, _ = Category.objects.get_or_create(slug="air-conditioning", defaults={"name": "Air Conditioning", "sort_order": 0, "is_active": True})
        cat_ac.is_active = True
        cat_ac.save()

        cat_app, _ = Category.objects.get_or_create(slug="appliances", defaults={"name": "Home Appliances", "sort_order": 1, "is_active": True})
        cat_app.is_active = True
        cat_app.save()

        cat_home, _ = Category.objects.get_or_create(slug="home-essentials", defaults={"name": "Home Essentials", "sort_order": 2, "is_active": True})
        cat_home.is_active = True
        cat_home.save()

        services_data = [
            (cat_ac, "ac-service-repair", "AC Service & Repair", "Comprehensive maintenance and cooling checkup.", 49900),
            (cat_ac, "ac-installation", "AC Installation", "Professional AC indoor and outdoor unit mounting.", 129900),
            (cat_app, "washing-machine-repair", "Washing Machine Repair", "Drum, motor, and drain pump diagnosis.", 39900),
            (cat_home, "electrician", "Electrician Inspection", "Electrical switchboard, wiring, and appliance check.", 29900),
            (cat_home, "plumber", "Plumber Repair", "Leakage, tap fitting, and pipe repair.", 29900),
        ]

        all_packages = []
        for cat, slug, name, summary, price_paise in services_data:
            svc, _ = Service.objects.get_or_create(
                slug=slug,
                defaults={
                    "category": cat,
                    "name": name,
                    "summary": summary,
                    "starting_price_paise": price_paise,
                    "is_active": True,
                },
            )
            svc.category = cat
            svc.name = name
            svc.summary = summary
            svc.starting_price_paise = price_paise
            svc.is_active = True
            svc.save()

            # Link coverage to all zones
            for zone in zones:
                ServiceCoverage.objects.get_or_create(service=svc, zone=zone, defaults={"is_active": True})

            # Create packages
            pkg1, _ = ServicePackage.objects.get_or_create(
                service=svc,
                name=f"Standard {name}",
                defaults={
                    "pricing_model": "FIXED_PRICE",
                    "duration_minutes": 60,
                    "skill_code": "GENERAL_SERVICE",
                    "inclusions": ["Complete system inspection", "Filter cleaning", "Operational testing"],
                    "exclusions": ["Spare part replacements", "Major refrigerant overhaul"],
                    "is_active": True,
                },
            )
            pkg1.is_active = True
            pkg1.save()
            all_packages.append(pkg1)

            # Pricing with 20% advance
            for zone in zones:
                p_rule, _ = PricingRule.objects.get_or_create(
                    package=pkg1,
                    zone=zone,
                    defaults={
                        "base_paise": price_paise,
                        "payment_policy": "ADVANCE",
                        "advance_type": "PERCENTAGE",
                        "advance_percentage": 20,
                        "is_active": True,
                    },
                )
                p_rule.base_paise = price_paise
                p_rule.payment_policy = "ADVANCE"
                p_rule.advance_type = "PERCENTAGE"
                p_rule.advance_percentage = 20
                p_rule.is_active = True
                p_rule.save()

        # 3. Create appointment slots for the next 7 days
        now = timezone.now()
        created_slots = 0
        for day_offset in range(1, 8):
            target_date = (now + datetime.timedelta(days=day_offset)).date()
            for hour in [9, 13, 16]:  # 9 AM, 1 PM, 4 PM
                start_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(hour, 0)))
                end_dt = start_dt + datetime.timedelta(hours=2)
                for pkg in all_packages:
                    for zone in zones:
                        slot, created = AppointmentSlot.objects.get_or_create(
                            zone=zone,
                            package=pkg,
                            start_at=start_dt,
                            end_at=end_dt,
                            defaults={"capacity": 5, "is_active": True},
                        )
                        if created:
                            created_slots += 1

        # 4. Create default dev test customer user & address
        User = get_user_model()
        test_phone = "+919876543210"
        test_user, _ = User.objects.get_or_create(username="test_customer", defaults={"phone_e164": test_phone})
        test_user.phone_e164 = test_phone
        test_user.save()

        Address.objects.get_or_create(
            user=test_user,
            label="Home (Anna Nagar)",
            defaults={
                "line_1": "Flat 4B, 2nd Avenue",
                "house_flat": "Flat 4B",
                "street": "2nd Avenue",
                "locality": "Anna Nagar",
                "city": "Chennai",
                "state": "Tamil Nadu",
                "postal_code": "600040",
                "contact_name": "Test Customer",
                "contact_phone": test_phone,
                "latitude": 13.0850,
                "longitude": 80.2101,
                "is_default": True,
            },
        )

        self.stdout.write(self.style.SUCCESS(
            f"Successfully seeded demo data!\n"
            f"- Cities: {City.objects.count()}, Zones: {Zone.objects.count()}\n"
            f"- Services: {Service.objects.count()}, Packages: {ServicePackage.objects.count()}\n"
            f"- New appointment slots created: {created_slots}\n"
            f"- Test customer: {test_phone}"
        ))
