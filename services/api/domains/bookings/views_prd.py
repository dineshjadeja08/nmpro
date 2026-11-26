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


def _sync_cart_lead(cart):
    """Keep one actionable lead for a customer's current cart."""
    from domains.operations.models import Lead

    items = list(cart.items.select_related("service__category", "package").order_by("created_at"))
    if not items:
        return
    user = cart.user
    marker = f"Customer cart: {cart.id}"
    lead = (Lead.objects.filter(created_by=user, source="WEBSITE", internal_notes=marker,
                                converted_booking__isnull=True).order_by("-created_at").first())
    first = items[0]
    service_items = [{"service_id": str(item.service_id), "package_id": str(item.package_id),
                      "quantity": item.quantity} for item in items]
    values = {
        "customer_name": (user.get_full_name() or user.username or "Customer")[:120],
        "mobile_number": user.phone_e164 or "",
        "email": user.email or "",
        "service_category": first.service.category,
        "service": first.service,
        "service_items": service_items,
        "quoted_amount_paise": sum((item.service.starting_price_paise or 0) * item.quantity for item in items),
    }
    if lead:
        for field, value in values.items():
            setattr(lead, field, value)
        lead.save(update_fields=[*values, "updated_at"])
    else:
        Lead.objects.create(lead_reference=f"NL-{timezone.now():%y%m%d}-{uuid4().hex[:12].upper()}",
                            created_by=user, source="WEBSITE", internal_notes=marker, **values)


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
        include_full = request.query_params.get("include_full") in ("1", "true", "True")
        now = timezone.now()
        start = now
        end = now + timedelta(days=14)

        if postal_code and city:
            address = Address(user_id=0, line_1="Lookup", locality=city, city=city, postal_code=postal_code)
            slots = available_slots(package, address, start, end, include_full=include_full)
            return Response({"slots": slots})

        from domains.locations.models import Zone
        zones = Zone.objects.filter(is_active=True, city__is_active=True, pricingrule__package=package, pricingrule__is_active=True)
        if city:
            zones = zones.filter(city__name__iexact=city)
        first_zone = zones.first()
        if not first_zone:
            return Response({"slots": []})
        address = Address(user_id=0, line_1="Lookup", locality=first_zone.name, city=first_zone.city.name, postal_code=first_zone.postal_code)
        return Response({"slots": available_slots(package, address, start, end, include_full=include_full)})


class BookingStartOTPView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        booking = get_object_or_404(Booking, id=booking_id, user=request.user)
        return Response({
            "booking_id": str(booking.id),
            "start_otp": booking.start_otp_code,
            "attempts": booking.start_otp_attempts,
        })


MAX_CART_ITEMS = 20
MAX_ITEM_QUANTITY = 20


def _serialize_cart(cart, skipped=None):
    items = list(cart.items.select_related("service", "package").order_by("created_at"))
    data = {
        "id": str(cart.id),
        "item_count": sum(item.quantity for item in items),
        "items": [
            {
                "id": str(item.id),
                "service_id": str(item.service_id),
                "service_slug": item.service.slug,
                "service_name": item.service.name,
                "service_image": item.service.list_image_display or item.service.cover_image_display or "",
                "package_id": str(item.package_id) if item.package_id else None,
                "package_name": item.package.name if item.package else None,
                "quantity": item.quantity,
            }
            for item in items
        ],
    }
    if skipped is not None:
        data["skipped"] = skipped
    return data


class CartMergeItemInput(serializers.Serializer):
    service_id = serializers.UUIDField()
    package_id = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1, required=False, default=1)


class CartMergeView(APIView):
    """Merge a guest cart kept in the browser into the signed-in user's cart (called after OTP login)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        items = serializers.ListField(child=CartMergeItemInput(), max_length=50).run_validation(
            request.data.get("items", []) if isinstance(request.data, dict) else []
        )
        skipped = []
        with transaction.atomic():
            cart, _ = Cart.objects.select_for_update().get_or_create(user=request.user)
            existing = {item.package_id: item for item in cart.items.all()}
            for entry in items:
                service = Service.objects.filter(
                    id=entry["service_id"], is_active=True, category__is_active=True
                ).first()
                if not service:
                    skipped.append({"service_id": str(entry["service_id"]), "reason": "Service is not available."})
                    continue
                packages = service.packages.filter(is_active=True)
                package = packages.filter(id=entry["package_id"]).first() if entry.get("package_id") else packages.first()
                if not package:
                    skipped.append({"service_id": str(service.id), "reason": "Package is not available."})
                    continue
                quantity = min(entry.get("quantity") or 1, MAX_ITEM_QUANTITY)
                if package.id in existing:
                    item = existing[package.id]
                    item.quantity = quantity
                    item.save(update_fields=["quantity", "updated_at"])
                    continue
                if len(existing) >= MAX_CART_ITEMS:
                    skipped.append({"service_id": str(service.id), "reason": "Cart is full."})
                    continue
                existing[package.id] = CartItem.objects.create(cart=cart, service=service, package=package, quantity=quantity)
        _sync_cart_lead(cart)
        return Response(_serialize_cart(cart, skipped=skipped))


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
        if not package:
            raise serializers.ValidationError("No active package configured for this service.")
        cart, _ = Cart.objects.get_or_create(user=request.user)
        CartItem.objects.update_or_create(
            cart=cart,
            package=package,
            defaults={"service": service, "quantity": quantity},
        )
        _sync_cart_lead(cart)
        return Response(_serialize_cart(cart))

    def post(self, request, service_id):
        return self.put(request, service_id)

    def delete(self, request, service_id):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        package_id = request.query_params.get("package_id") or (request.data.get("package_id") if isinstance(request.data, dict) else None)
        if package_id:
            cart.items.filter(package_id=package_id).delete()
        else:
            cart.items.filter(service_id=service_id).delete()
            cart.items.filter(package_id=service_id).delete()
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
        items = list(cart.items.select_related("service", "package").order_by("created_at"))
        if not items:
            raise serializers.ValidationError("Your cart is empty.")
        primary = items[0]
        package = primary.package or primary.service.packages.filter(is_active=True).first()
        if not package:
            raise serializers.ValidationError("No active package configured for the selected service.")
        resolved_items = []
        for item in items:
            item_pkg = item.package or item.service.packages.filter(is_active=True).first()
            if not item_pkg:
                raise serializers.ValidationError(f"No active package configured for {item.service.name}.")
            resolved_items.append({"package_id": str(item_pkg.id), "quantity": item.quantity})
        address = get_object_or_404(Address, id=address_id, user=request.user, archived_at__isnull=True)
        key = request.headers.get("Idempotency-Key") or f"cart-{cart.id}-{uuid4().hex[:12]}"
        hold = create_hold(request.user, package, address, slot_id)
        quote = create_quote(request.user, hold.id, cart_items=resolved_items)
        booking, _ = confirm_booking(request.user, hold.id, quote.id, key, quote.total_paise)
        from domains.operations.models import Lead
        cart_lead = (Lead.objects.filter(created_by=request.user, source="WEBSITE",
                         internal_notes=f"Customer cart: {cart.id}", converted_booking__isnull=True)
                     .order_by("-created_at").first())
        if cart_lead:
            if Lead.objects.filter(converted_booking=booking).exists():
                cart_lead.status = "CANCELLED"
                cart_lead.save(update_fields=["status", "updated_at"])
            else:
                cart_lead.converted_booking = booking
                cart_lead.status = "CONVERTED"
                cart_lead.save(update_fields=["converted_booking", "status", "updated_at"])
        if request.data.get("problem_description"):
            booking.problem_description = str(request.data["problem_description"])[:2000]
            booking.save(update_fields=["problem_description", "updated_at"])
        cart.items.all().delete()
        booking = Booking.objects.select_related(
            "service", "package", "address", "slot", "price_snapshot", "invoice", "payment_order"
        ).prefetch_related("events", "items__package__service").get(id=booking.id)
        return Response(serialize_booking(booking), status=201)
