import re

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.bookings.services import serviceable
from domains.catalog.models import ServicePackage

from .models import Address


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ["id", "line_1", "label", "contact_name", "contact_phone", "house_flat", "street", "locality",
                  "city", "state", "postal_code", "landmark", "latitude", "longitude", "is_default"]
        read_only_fields = ["id", "line_1"]

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
