from django.core.management.base import BaseCommand

from domains.catalog.models import Category, Service


class Command(BaseCommand):
    help = "Create clearly labeled demonstration services for local development only."

    def handle(self, *args, **options):
        from django.conf import settings
        if settings.ENVIRONMENT == "production":
            raise RuntimeError("Demonstration catalog may not be seeded in production")
        catalog = [
            ("air-conditioning", "Air conditioning", [
                ("ac-service-repair", "AC Service & Repair", "Care and troubleshooting for your air conditioner."),
                ("ac-installation", "AC Installation", "Plan an air conditioner installation."),
                ("ac-gas-refill", "AC Gas Refill", "Get help assessing a cooling or refrigerant issue."),
            ]),
            ("appliances", "Home appliances", [
                ("washing-machine-repair", "Washing Machine Repair", "Help with washing machine faults."),
                ("refrigerator-repair", "Refrigerator Repair", "Help with refrigerator faults."),
            ]),
            ("home-essentials", "Home essentials", [
                ("electrician", "Electrician", "Help with electrical repairs and installations."),
                ("plumber", "Plumber", "Help with plumbing repairs and leaks."),
            ]),
        ]
        for category_order, (slug, name, services) in enumerate(catalog):
            category, _ = Category.objects.update_or_create(slug=slug, defaults={"name": name, "sort_order": category_order})
            for service_order, (service_slug, service_name, summary) in enumerate(services):
                Service.objects.update_or_create(slug=service_slug, defaults={
                    "category": category, "name": service_name, "summary": summary,
                    "sort_order": service_order, "starting_price_paise": None})
        self.stdout.write(self.style.SUCCESS("Local demonstration catalog ready; no prices or availability were invented."))
