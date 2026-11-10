from datetime import timedelta

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.catalog.models import ServicePackage
from domains.locations.models import Address

from .models import Booking
from .services import (
    available_slots,
    cancel_booking,
    confirm_booking,
    create_hold,
    create_quote,
    release_hold,
    reschedule_booking,
    serialize_booking,
    serialize_quote,
)


class SlotQuery(serializers.Serializer):
    package_id = serializers.UUIDField()
    address_id = serializers.UUIDField()
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()

    def validate(self, attrs):
        if attrs["end"] <= attrs["start"] or attrs["end"] > attrs["start"] + timedelta(days=31):
            raise serializers.ValidationError("Choose a valid date range within 31 days.")
        return attrs


class AvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not settings.PUBLIC_BOOKING_ENABLED:
            return Response({"detail": "Public booking is temporarily unavailable."}, status=503)
        query = SlotQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        package = get_object_or_404(ServicePackage.objects.select_related("service__category"),
                                    id=query.validated_data["package_id"])
        address = get_object_or_404(Address, id=query.validated_data["address_id"], user=request.user,
                                    archived_at__isnull=True)
        return Response({"slots": available_slots(package, address, query.validated_data["start"],
                                                   query.validated_data["end"])})


class HoldInput(serializers.Serializer):
    package_id = serializers.UUIDField()
    address_id = serializers.UUIDField()
    slot_id = serializers.UUIDField()


class HoldView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not settings.PUBLIC_BOOKING_ENABLED:
            return Response({"detail": "Public booking is temporarily unavailable."}, status=503)
        data = HoldInput(data=request.data)
        data.is_valid(raise_exception=True)
        package = get_object_or_404(ServicePackage.objects.select_related("service__category"), id=data.validated_data["package_id"])
        address = get_object_or_404(Address, id=data.validated_data["address_id"], user=request.user, archived_at__isnull=True)
        hold = create_hold(request.user, package, address, data.validated_data["slot_id"])
        return Response({"id": str(hold.id), "expires_at": hold.expires_at}, status=201)


class HoldDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, hold_id):
        release_hold(request.user, hold_id)
        return Response(status=204)


class QuoteInput(serializers.Serializer):
    hold_id = serializers.UUIDField()


class QuoteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = QuoteInput(data=request.data)
        data.is_valid(raise_exception=True)
        quote = create_quote(request.user, data.validated_data["hold_id"])
        return Response(serialize_quote(quote), status=201)


class BookingInput(serializers.Serializer):
    hold_id = serializers.UUIDField()
    quote_id = serializers.UUIDField()
    accepted_total_paise = serializers.IntegerField(min_value=0)
    terms_accepted = serializers.BooleanField()
    problem_description = serializers.CharField(max_length=2000, allow_blank=True, required=False, default="")

    def validate_terms_accepted(self, value):
        if not value:
            raise serializers.ValidationError("Accept the booking terms to continue.")
        return value


class BookingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        page = serializers.IntegerField(min_value=1, max_value=10000).run_validation(request.query_params.get("page", 1))
        size = 20
        bookings = Booking.objects.filter(user=request.user, package__isnull=False, address__isnull=False,
                                          slot__isnull=False, price_snapshot__isnull=False).select_related(
            "service", "package", "address", "slot", "price_snapshot", "invoice", "payment_order",
            "technician_assignment__technician__user", "review",
        ).prefetch_related("events").order_by("-created_at")
        return Response({"count": bookings.count(), "page": page,
                         "results": [serialize_booking(b) for b in bookings[(page - 1) * size:page * size]]})

    def post(self, request):
        if not settings.PUBLIC_BOOKING_ENABLED:
            return Response({"detail": "Public booking is temporarily unavailable."}, status=503)
        data = BookingInput(data=request.data)
        data.is_valid(raise_exception=True)
        booking, created = confirm_booking(request.user, data.validated_data["hold_id"],
                                           data.validated_data["quote_id"],
                                           request.headers.get("Idempotency-Key", ""),
                                           data.validated_data["accepted_total_paise"],
                                           problem_description=data.validated_data.get("problem_description", ""))
        booking = Booking.objects.select_related("service", "package", "address", "slot", "price_snapshot", "invoice", "payment_order", "technician_assignment__technician__user", "review").prefetch_related("events").get(id=booking.id)
        return Response(serialize_booking(booking), status=201 if created else 200)


class BookingDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        booking = get_object_or_404(Booking.objects.select_related(
            "service", "package", "address", "slot", "price_snapshot", "invoice", "payment_order",
            "technician_assignment__technician__user", "review",
        ).prefetch_related("events"), id=booking_id, user=request.user, price_snapshot__isnull=False)
        return Response(serialize_booking(booking))


class CancelInput(serializers.Serializer):
    expected_version = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(max_length=240, allow_blank=True, required=False)


class CancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        data = CancelInput(data=request.data)
        data.is_valid(raise_exception=True)
        booking = cancel_booking(request.user, booking_id, data.validated_data["expected_version"],
                                 data.validated_data.get("reason", ""))
        return Response({"id": str(booking.id), "status": booking.status, "version": booking.version})


class RescheduleInput(serializers.Serializer):
    new_hold_id = serializers.UUIDField()
    expected_version = serializers.IntegerField(min_value=1)


class RescheduleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        data = RescheduleInput(data=request.data)
        data.is_valid(raise_exception=True)
        booking = reschedule_booking(request.user, booking_id, data.validated_data["new_hold_id"],
                                     data.validated_data["expected_version"])
        return Response({"id": str(booking.id), "status": booking.status, "version": booking.version,
                         "slot_id": str(booking.slot_id)})
