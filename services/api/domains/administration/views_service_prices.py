"""Focused admin editor for customer selling and crossed-out prices."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.catalog.models import PricingRule, Service, ServicePackage
from domains.catalog.pricing import rule_total_paise
from domains.locations.models import ServiceCoverage, Zone

from .rbac import require
from .services import audit
from .views_core import validate_price


class ZoneSellingPriceInput(serializers.Serializer):
    zone_id = serializers.UUIDField()
    price_paise = serializers.IntegerField(min_value=1)
    expected_rule_id = serializers.UUIDField(required=False, allow_null=True)


class ServicePriceInput(serializers.Serializer):
    package_id = serializers.UUIDField(required=False, allow_null=True)
    duration_minutes = serializers.IntegerField(min_value=15, max_value=1440, required=False)
    original_price_paise = serializers.IntegerField(min_value=0, allow_null=True)
    zone_prices = ZoneSellingPriceInput(many=True, required=True, allow_empty=True)
    activate_package = serializers.BooleanField(required=False, default=False)


def service_price_data(service):
    zones = list(Zone.objects.filter(is_active=True, city__is_active=True).order_by("city__name", "name"))
    packages = []
    for package in ServicePackage.objects.filter(service=service).order_by("created_at"):
        active_rules = {
            rule.zone_id: rule
            for rule in PricingRule.objects.filter(package=package, is_active=True)
        }
        packages.append({
            "id": str(package.id),
            "name": package.name,
            "pricing_model": package.pricing_model,
            "duration_minutes": package.duration_minutes,
            "is_active": package.is_active,
            "original_price_paise": package.original_price_paise,
            "zones": [{
                "zone_id": str(zone.id),
                "zone_name": zone.name,
                "postal_code": zone.postal_code,
                "price_paise": rule_total_paise(active_rules[zone.id]) if zone.id in active_rules else None,
                "rule_id": str(active_rules[zone.id].id) if zone.id in active_rules else None,
            } for zone in zones],
        })
    return {
        "service_id": str(service.id),
        "service_name": service.name,
        "starting_price_paise": service.starting_price_paise,
        "zones": [{"id": str(zone.id), "name": zone.name, "postal_code": zone.postal_code} for zone in zones],
        "packages": packages,
    }


class AdminServicePricesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, service_id):
        require(request.user, "VIEW_ADMIN")
        service = get_object_or_404(Service, id=service_id)
        return Response(service_price_data(service))

    @transaction.atomic
    def patch(self, request, service_id):
        require(request.user, "MANAGE_PRICING")
        data = ServicePriceInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        service = get_object_or_404(Service.objects.select_for_update().select_related("category"), id=service_id)
        package_id = values.get("package_id")
        if package_id:
            package = get_object_or_404(ServicePackage.objects.select_for_update(), id=package_id, service=service)
        else:
            if ServicePackage.objects.filter(service=service).exists():
                raise serializers.ValidationError({"package_id": "Choose a package for this service."})
            if not values["zone_prices"]:
                raise serializers.ValidationError({"zone_prices": "Enter a selling price for at least one area."})
            if not values.get("duration_minutes"):
                raise serializers.ValidationError({"duration_minutes": "Enter the expected service duration."})
            package = ServicePackage.objects.create(
                service=service, name=service.name, pricing_model="FIXED_PRICE",
                duration_minutes=values["duration_minutes"],
                skill_code=f"{service.category.slug.upper().replace('-', '_')}_SPECIALIST"[:60],
                is_active=True,
            )

        changes = values["zone_prices"]
        zone_ids = [item["zone_id"] for item in changes]
        if len(zone_ids) != len(set(zone_ids)):
            raise serializers.ValidationError({"zone_prices": "Each area may appear only once."})
        zones = {zone.id: zone for zone in Zone.objects.filter(
            id__in=zone_ids, is_active=True, city__is_active=True
        )}
        if len(zones) != len(zone_ids):
            raise serializers.ValidationError({"zone_prices": "Choose active service areas only."})

        active_rules = {
            rule.zone_id: rule for rule in PricingRule.objects.select_for_update().filter(package=package, is_active=True)
        }
        displayed_prices = {zone_id: rule_total_paise(rule) for zone_id, rule in active_rules.items()}
        for item in changes:
            displayed_prices[item["zone_id"]] = item["price_paise"]
            if "expected_rule_id" in item:
                current = active_rules.get(item["zone_id"])
                if (current.id if current else None) != item["expected_rule_id"]:
                    raise serializers.ValidationError({"zone_prices": "A price changed. Refresh and try again."})

        original = values.get("original_price_paise", package.original_price_paise)
        original = original or None
        if original is not None and displayed_prices and original <= max(displayed_prices.values()):
            raise serializers.ValidationError({
                "original_price_paise": "Original price must be higher than every active selling price for this package."
            })

        for item in changes:
            zone = zones[item["zone_id"]]
            desired = item["price_paise"]
            old = active_rules.get(zone.id)
            ServiceCoverage.objects.update_or_create(
                service=service, zone=zone, defaults={"is_active": True},
            )
            if old and rule_total_paise(old) == desired:
                continue
            fee = (old.fee_paise or 0) + (old.tax_paise or 0) if old else 0
            charge = desired - fee
            if charge <= 0:
                raise serializers.ValidationError({"zone_prices": "Selling price must exceed this area's fees and tax."})
            rule_values = {
                "base_paise": charge if package.pricing_model == "FIXED_PRICE" else 0,
                "inspection_paise": charge if package.pricing_model == "INSPECTION_BASED" else 0,
                "fee_paise": old.fee_paise if old else 0,
                "tax_paise": old.tax_paise if old else 0,
                "payment_policy": old.payment_policy if old else "PAY_AT_VISIT",
                "advance_type": old.advance_type if old else "NONE",
                "advance_percentage": old.advance_percentage if old else 0,
                "advance_amount_paise": old.advance_amount_paise if old else 0,
                "is_active": True,
                "cancellation_cutoff_minutes": old.cancellation_cutoff_minutes if old else None,
                "reschedule_cutoff_minutes": old.reschedule_cutoff_minutes if old else None,
            }
            validate_price(rule_values, package)
            version = (PricingRule.objects.filter(package=package, zone=zone)
                       .order_by("-version").values_list("version", flat=True).first() or 0) + 1
            if old:
                old.is_active = False
                old.save(update_fields=["is_active", "updated_at"])
            PricingRule.objects.create(
                package=package, zone=zone, version=version,
                currency=old.currency if old else "INR", **rule_values,
            )

        package.original_price_paise = original
        if values["activate_package"]:
            package.is_active = True
        package.save(update_fields=["original_price_paise", "is_active", "updated_at"])

        active_prices = [
            rule_total_paise(rule)
            for rule in PricingRule.objects.filter(
                package__service=service, package__is_active=True, is_active=True
            )
        ]
        if active_prices:
            service.starting_price_paise = min(active_prices)
            service.save(update_fields=["starting_price_paise", "updated_at"])
        audit(request.user, "SERVICE_PRICES_UPDATED", "Service", service.id, {
            "package_id": str(package.id), "zone_count": len(changes),
        })
        return Response(service_price_data(service))
