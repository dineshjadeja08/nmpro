"""Brand library: staff upload each brand logo once (to Cloudinary when configured) and pick brands per service."""
import mimetypes

from django.db import IntegrityError
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect
from rest_framework import serializers
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Brand


def brand_data(b):
    return {"id": str(b.id), "name": b.name, "logo_url": b.logo_display, "is_active": b.is_active,
            "sort_order": b.sort_order}


def _save_logo(request, brand):
    from domains.administration.views_core import _validate_and_upload_catalog_image

    if not (request.FILES.get("file") or request.FILES.get("image")):
        return
    upload, _mime, cloudinary_res = _validate_and_upload_catalog_image(request, allow_svg=False)
    if cloudinary_res:
        brand.logo_url = cloudinary_res["secure_url"]
    else:
        brand.logo_url = ""
        brand.logo.save(upload.name, upload, save=False)


class AdminBrandsView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        from domains.administration.rbac import require

        require(request.user, "VIEW_ADMIN")
        return Response({"results": [brand_data(b) for b in Brand.objects.order_by("sort_order", "name")]})

    def post(self, request):
        from domains.administration.rbac import require
        from domains.administration.services import audit

        require(request.user, "MANAGE_SERVICES")
        name = serializers.CharField(max_length=60).run_validation(str(request.data.get("name", "")).strip())
        if Brand.objects.filter(name__iexact=name).exists():
            raise serializers.ValidationError({"name": "This brand already exists."})
        brand = Brand(name=name)
        _save_logo(request, brand)
        try:
            brand.save()
        except IntegrityError as exc:
            raise serializers.ValidationError({"name": "This brand already exists."}) from exc
        audit(request.user, "BRAND_CREATED", "Brand", brand.id)
        return Response(brand_data(brand), status=201)


class AdminBrandDetailView(APIView):
    """POST with a file replaces the logo; PATCH changes name/active/order."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, brand_id):
        from domains.administration.rbac import require
        from domains.administration.services import audit

        require(request.user, "MANAGE_SERVICES")
        brand = get_object_or_404(Brand, id=brand_id)
        if not (request.FILES.get("file") or request.FILES.get("image")):
            raise serializers.ValidationError("Choose a logo image.")
        _save_logo(request, brand)
        brand.save()
        audit(request.user, "BRAND_LOGO_UPDATED", "Brand", brand.id)
        return Response(brand_data(brand))

    def patch(self, request, brand_id):
        from domains.administration.rbac import require

        require(request.user, "MANAGE_SERVICES")
        brand = get_object_or_404(Brand, id=brand_id)
        if "name" in request.data:
            brand.name = serializers.CharField(max_length=60).run_validation(str(request.data["name"]).strip())
        if "is_active" in request.data:
            brand.is_active = serializers.BooleanField().run_validation(request.data["is_active"])
        if "sort_order" in request.data:
            brand.sort_order = serializers.IntegerField(min_value=0, max_value=1000).run_validation(request.data["sort_order"])
        try:
            brand.save()
        except IntegrityError as exc:
            raise serializers.ValidationError({"name": "This brand already exists."}) from exc
        return Response(brand_data(brand))


class BrandLogoView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, brand_id):
        brand = get_object_or_404(Brand, id=brand_id)
        if brand.logo_url:
            return redirect(brand.logo_url)
        if not brand.logo or not getattr(brand.logo, "name", ""):
            raise Http404
        ctype, _ = mimetypes.guess_type(brand.logo.name)
        return FileResponse(brand.logo.open("rb"), content_type=ctype or "image/png")
