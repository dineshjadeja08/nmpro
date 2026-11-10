from datetime import timedelta
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.catalog.models import Service, ServicePackage
from domains.locations.models import Address

from .models import AppointmentSlot, Booking, Cart, CartItem
from .services import available_slots, confirm_booking, create_hold, create_quote, serialize_booking


class PublicSlotsView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        package_id = request.query_params.get("package_id")
        service_id = request.query_params.get("service_id")
        if package_id:
            package = get_object_or_404(ServicePackage.objects.select_related("service__category"), id=package_id, is_active=True)
        elif service_id:
            package = get_object_or_404(
                ServicePackage.objects.select_related("service__category"),
                service_id=service_id,
                is_active=True,
            )
        else:
            raise serializers.ValidationError("package_id or service_id is required.")

        postal_code = (request.query_params.get("postal_code") or "").strip()
        city = (request.query_params.get("city") or "").strip()
        if not postal_code or not city:
            raise serializers.ValidationError("postal_code and city are required.")

        address = Address(user_id=0, line_1="Lookup", locality=city, city=city, postal_code=postal_code)
        now = timezone.now()
        start = now
        end = now + timedelta(days=14)
        return Response({"slots": available_slots(package, address, start, end)})


class BookingStartOTPView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        booking = get_object_or_404(Booking, id=booking_id, user=request.user)
        return Response({
            "booking_id": str(booking.id),
            "start_otp": booking.start_otp_code,
            "attempts": booking.start_otp_attempts,
        })


def _serialize_cart(cart):
    items = list(cart.items.select_related("service", "package").order_by("created_at"))
    return {
        "id": str(cart.id),
        "items": [
            {
                "id": str(item.id),
                "service_id": str(item.service_id),
                "service_slug": item.service.slug,
                "service_name": item.service.name,
                "package_id": str(item.package_id) if item.package_id else None,
                "package_name": item.package.name if item.package else None,
                "quantity": item.quantity,
            }
            for item in items
        ],
    }


class CartView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        return Response(_serialize_cart(cart))

    def delete(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        cart.items.all().delete()
        return Response(_serialize_cart(cart))


class CartItemView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, service_id):
        service = get_object_or_404(Service, id=service_id, is_active=True, category__is_active=True)
        quantity = serializers.IntegerField(min_value=1, max_value=20).run_validation(request.data.get("quantity", 1))
        package = None
        if request.data.get("package_id"):
            package = get_object_or_404(ServicePackage, id=request.data["package_id"], service=service, is_active=True)
        else:
            package = service.packages.filter(is_active=True).first()
        cart, _ = Cart.objects.get_or_create(user=request.user)
        CartItem.objects.update_or_create(cart=cart, service=service, defaults={"package": package, "quantity": quantity})
        return Response(_serialize_cart(cart))

    def post(self, request, service_id):
        return self.put(request, service_id)

    def delete(self, request, service_id):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        cart.items.filter(service_id=service_id).delete()
        return Response(_serialize_cart(cart))


class CartCheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if not settings.PUBLIC_BOOKING_ENABLED:
            return Response({"detail": "Public booking is temporarily unavailable."}, status=503)
        address_id = serializers.UUIDField().run_validation(request.data.get("address_id"))
        slot_id = serializers.UUIDField().run_validation(request.data.get("slot_id"))
        terms_accepted = serializers.BooleanField().run_validation(request.data.get("terms_accepted", True))
        if not terms_accepted:
            raise serializers.ValidationError({"terms_accepted": "Accept terms to checkout."})
        cart, _ = Cart.objects.get_or_create(user=request.user)
        items = list(cart.items.select_related("service", "package"))
        if not items:
            raise serializers.ValidationError("Your cart is empty.")
        primary = items[0]
        package = primary.package or primary.service.packages.filter(is_active=True).first()
        if not package:
            raise serializers.ValidationError("No active package configured for the selected service.")
        address = get_object_or_404(Address, id=address_id, user=request.user, archived_at__isnull=True)
        key = request.headers.get("Idempotency-Key") or f"cart-{cart.id}-{uuid4().hex[:12]}"
        hold = create_hold(request.user, package, address, slot_id)
        quote = create_quote(request.user, hold.id)
        booking, _ = confirm_booking(request.user, hold.id, quote.id, key, quote.total_paise)
        if request.data.get("problem_description"):
            booking.problem_description = str(request.data["problem_description"])[:2000]
            booking.save(update_fields=["problem_description", "updated_at"])
        cart.items.all().delete()
        booking = Booking.objects.select_related(
            "service", "package", "address", "slot", "price_snapshot", "invoice", "payment_order"
        ).prefetch_related("events").get(id=booking.id)
        return Response(serialize_booking(booking), status=201)
