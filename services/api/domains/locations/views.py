import re

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.bookings.services import serviceable
from domains.catalog.models import ServicePackage

from .models import Address
from .providers.google_maps import GoogleMapsLocationProvider, LocationProviderError


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ["id", "line_1", "label", "contact_name", "contact_phone", "house_flat", "street", "locality",
                  "city", "state", "postal_code", "landmark", "latitude", "longitude", "is_default"]
        read_only_fields = ["id", "line_1"]

    def to_internal_value(self, data):
        if isinstance(data, dict):
            normalized = dict(data)
            for coord in ("latitude", "longitude"):
                val = normalized.get(coord)
                if val in ("", None):
                    normalized[coord] = None
                else:
                    try:
                        normalized[coord] = round(float(val), 6)
                    except (TypeError, ValueError):
                        pass
            data = normalized
        return super().to_internal_value(data)

    def validate_postal_code(self, value):
        if not re.fullmatch(r"\d{6}", value):
            raise serializers.ValidationError("Enter a six-digit PIN code.")
        return value

    def validate_contact_phone(self, value):
        if value and not re.fullmatch(r"\+91[6-9]\d{9}", value):
            raise serializers.ValidationError("Use +91 followed by a ten-digit mobile number.")
        return value

    def validate(self, attrs):
        for field in ("label", "contact_name", "locality", "city", "state"):
            if not attrs.get(field, getattr(self.instance, field, "")):
                raise serializers.ValidationError({field: "This field is required."})
        if not attrs.get("house_flat", getattr(self.instance, "house_flat", "")):
            raise serializers.ValidationError({"house_flat": "House or flat number is required."})
        if not attrs.get("street", getattr(self.instance, "street", "")):
            raise serializers.ValidationError({"street": "Street is required."})
        return attrs


def address_data(address):
    return AddressSerializer(address).data


class AddressListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        addresses = Address.objects.filter(user=request.user, archived_at__isnull=True).order_by("-is_default", "-created_at")
        return Response({"addresses": AddressSerializer(addresses, many=True).data})

    @transaction.atomic
    def post(self, request):
        serializer = AddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        type(request.user).objects.select_for_update().get(pk=request.user.pk)
        default = serializer.validated_data.get("is_default", False)
        if default:
            Address.objects.filter(user=request.user, is_default=True).update(is_default=False)
        address = serializer.save(user=request.user,
                                  line_1=f"{serializer.validated_data['house_flat']}, {serializer.validated_data['street']}")
        return Response(address_data(address), status=201)


class AddressDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def patch(self, request, address_id):
        type(request.user).objects.select_for_update().get(pk=request.user.pk)
        address = get_object_or_404(Address.objects.select_for_update(), id=address_id, user=request.user,
                                    archived_at__isnull=True)
        serializer = AddressSerializer(address, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("is_default"):
            Address.objects.filter(user=request.user, is_default=True).exclude(id=address.id).update(is_default=False)
        house = serializer.validated_data.get("house_flat", address.house_flat)
        street = serializer.validated_data.get("street", address.street)
        serializer.save(line_1=f"{house}, {street}")
        return Response(address_data(address))

    @transaction.atomic
    def delete(self, request, address_id):
        address = get_object_or_404(Address.objects.select_for_update(), id=address_id, user=request.user,
                                    archived_at__isnull=True)
        address.is_default = False
        address.archived_at = timezone.now()
        address.save(update_fields=["is_default", "archived_at", "updated_at"])
        return Response(status=204)


class ServiceabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = serializers.Serializer(data=request.data)
        data.fields["address_id"] = serializers.UUIDField()
        data.fields["package_id"] = serializers.UUIDField()
        data.is_valid(raise_exception=True)
        address = get_object_or_404(Address, id=data.validated_data["address_id"], user=request.user,
                                    archived_at__isnull=True)
        package = get_object_or_404(ServicePackage.objects.select_related("service__category"),
                                    id=data.validated_data["package_id"])
        zone = serviceable(package, address)
        return Response({"supported": bool(zone), "zone_id": str(zone.id) if zone else None,
                         "reason": None if zone else "This service is not configured for this address."})


class ServiceAreaListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        from .models import Zone
        qs = Zone.objects.filter(is_active=True, city__is_active=True).select_related("city").order_by("city__name", "name")
        if request.query_params.get("postal_code"):
            qs = qs.filter(postal_code=request.query_params["postal_code"].strip())
        if request.query_params.get("city"):
            qs = qs.filter(city__name__iexact=request.query_params["city"].strip())
        return Response({"results": [
            {"id": str(z.id), "name": z.name, "city": z.city.name, "state": z.state,
             "country": z.country, "postal_code": z.postal_code,
             "locality_aliases": z.locality_aliases, "services_configured": z.services_configured}
            for z in qs[:200]
        ]})


class ServiceAreaCheckView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def _check(self, postal_code, service_id=None, city=None, locality=None):
        from .models import ServiceCoverage, Zone
        clean_pin = (postal_code or "").strip()
        clean_city = (city or "").strip()
        clean_locality = (locality or "").strip()
        if not clean_pin and not clean_city:
            raise serializers.ValidationError({"postal_code": "postal_code or city is required."})

        qs = Zone.objects.filter(is_active=True, city__is_active=True).select_related("city")
        if clean_pin:
            pin_qs = qs.filter(postal_code=clean_pin)
            if clean_city and pin_qs.filter(city__name__iexact=clean_city).exists():
                qs = pin_qs.filter(city__name__iexact=clean_city)
            else:
                qs = pin_qs
        else:
            qs = qs.filter(city__name__iexact=clean_city)
            if clean_locality:
                local_matches = [
                    z
                    for z in qs
                    if clean_locality.lower() in z.name.lower()
                    or any(clean_locality.lower() in str(a).lower() for a in (z.locality_aliases or []))
                ]
                if local_matches:
                    qs = qs.filter(id__in=[z.id for z in local_matches])

        zone = qs.first()
        if not zone:
            return Response({"is_supported": False, "supported": False, "service_area": None, "areas": []})
        if service_id and zone.services_configured:
            if not ServiceCoverage.objects.filter(zone=zone, service_id=service_id, is_active=True).exists():
                return Response({"is_supported": False, "supported": False, "service_area": None, "areas": []})
        area_payload = {"id": str(zone.id), "name": zone.name, "city": zone.city.name,
                        "state": zone.state, "postal_code": zone.postal_code}
        return Response({
            "is_supported": True,
            "supported": True,
            "service_area": area_payload,
            "areas": [{"id": str(z.id), "name": z.name, "slug": z.name.lower().replace(" ", "-"), "postal_code": z.postal_code} for z in qs],
        })

    def get(self, request):
        return self._check(
            request.query_params.get("postal_code") or request.query_params.get("pincode"),
            request.query_params.get("service_id"),
            request.query_params.get("city"),
            request.query_params.get("locality") or request.query_params.get("area"),
        )

    def post(self, request):
        return self._check(
            str(request.data.get("postal_code") or request.data.get("pincode") or ""),
            request.data.get("service_id"),
            request.data.get("city"),
            request.data.get("locality") or request.data.get("area"),
        )


class LocationAutocompleteView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        query = (request.query_params.get("input") or request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response({"suggestions": []})
        lat = request.query_params.get("lat")
        lng = request.query_params.get("lng")
        city = request.query_params.get("city", "")
        latitude = float(lat) if lat else None
        longitude = float(lng) if lng else None

        provider = GoogleMapsLocationProvider()
        try:
            suggestions = provider.autocomplete(query, latitude=latitude, longitude=longitude, city=city)
            return Response({"suggestions": suggestions})
        except LocationProviderError as exc:
            return Response({"error": {"message": str(exc), "code": exc.reason}}, status=400)


class LocationGeocodeView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        place_id = request.query_params.get("place_id", "").strip()
        if not place_id:
            return Response({"error": {"message": "place_id is required", "code": "INVALID_PARAMS"}}, status=400)
        provider = GoogleMapsLocationProvider()
        try:
            result = provider.geocode(place_id)
            return Response(result)
        except LocationProviderError as exc:
            return Response({"error": {"message": str(exc), "code": exc.reason}}, status=400)


class LocationReverseGeocodeView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        lat = request.query_params.get("lat", "").strip()
        lng = request.query_params.get("lng", "").strip()
        if not lat or not lng:
            return Response({"error": {"message": "lat and lng are required", "code": "INVALID_PARAMS"}}, status=400)
        try:
            latitude = float(lat)
            longitude = float(lng)
        except ValueError:
            return Response({"error": {"message": "Invalid coordinates", "code": "INVALID_PARAMS"}}, status=400)

        provider = GoogleMapsLocationProvider()
        try:
            result = provider.reverse_geocode(latitude, longitude)
            return Response(result)
        except LocationProviderError as exc:
            return Response({"error": {"message": str(exc), "code": exc.reason}}, status=400)

