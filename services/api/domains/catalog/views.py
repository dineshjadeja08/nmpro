from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, Service, ServiceImage


def serialize_service(service):
    return {"id": str(service.id), "slug": service.slug, "name": service.name,
            "summary": service.summary, "description": service.description, "category": service.category.slug,
            "starting_price_paise": service.starting_price_paise, "is_active": service.is_active,
            "images": [{"id": str(i.id), "url": f"/api/v1/catalog/images/{i.id}/"}
                       for i in service.images.all() if i.is_active],
            "packages": [{"id": str(p.id), "name": p.name, "pricing_model": p.pricing_model,
                          "duration_minutes": p.duration_minutes, "description": p.description,
                          "requirements": p.requirements, "inclusions": p.inclusions,
                          "exclusions": p.exclusions} for p in service.packages.all() if p.is_active]}


class CatalogView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        categories = Category.objects.filter(is_active=True).order_by("sort_order", "name")
        services = Service.objects.select_related("category").prefetch_related("packages", "images").filter(is_active=True, category__is_active=True).order_by("sort_order", "name")
        return Response({"categories": [{"id": str(c.id), "slug": c.slug, "name": c.name,
                                         "description": c.description} for c in categories],
                         "services": [serialize_service(s) for s in services], "demo": settings.ENVIRONMENT != "production"})


class ServiceDetailView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, slug):
        service = get_object_or_404(Service.objects.select_related("category").prefetch_related("packages", "images"), slug=slug, is_active=True,
                                    category__is_active=True)
        return Response(serialize_service(service))


class CategoryListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"categories": [{"id": str(c.id), "slug": c.slug, "name": c.name,
                                          "description": c.description} for c in Category.objects.filter(is_active=True)]})


class ServiceListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        services = Service.objects.select_related("category").prefetch_related("packages", "images").filter(is_active=True, category__is_active=True)
        query = request.query_params.get("q", "").strip()
        if query:
            services = services.filter(name__icontains=query[:100])
        return Response({"services": [serialize_service(s) for s in services[:100]]})


class ServiceImageView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, image_id):
        image = get_object_or_404(ServiceImage, id=image_id, is_active=True,
                                  service__is_active=True, service__category__is_active=True)
        return FileResponse(image.file.open("rb"), content_type=image.content_type)
