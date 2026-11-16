"""City landing pages for SEO, e.g. /ac-service-chennai or /water-tank-cleaning-chennai."""
import re

from django.http import Http404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.locations.models import City, Zone

from .models import FAQ, Category, SEOLandingPage
from .pricing import resolve_zone
from .views import public_services, serialize_category, serialize_service

# Words people add after a category name in searches ("ac service", "washing machine repair").
SERVICE_WORDS = ("service", "services", "repair", "repairs", "cleaning", "installation", "maintenance")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _active_cities():
    city_ids = Zone.objects.filter(is_active=True).values_list("city_id", flat=True)
    return list(City.objects.filter(is_active=True, id__in=city_ids).order_by("name"))


def landing_slug(category, city):
    base = category.slug
    if not any(base.endswith(f"-{w}") for w in SERVICE_WORDS):
        base = f"{base}-service"
    return f"{base}-{city.slug}"


def _match_category(prefix):
    candidates = [prefix]
    for word in SERVICE_WORDS:
        if prefix.endswith(f"-{word}"):
            candidates.append(prefix[: -len(word) - 1])
    for slug in candidates:
        category = Category.objects.filter(slug=slug, is_active=True).first()
        if category:
            return category
    return None


def _areas(city):
    return [{"name": z.name, "postal_code": z.postal_code}
            for z in Zone.objects.filter(city=city, is_active=True).order_by("name")[:60]]


class LandingListView(APIView):
    """Every landing page slug, for the sitemap."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        cities = _active_cities()
        categories = Category.objects.filter(is_active=True, services__is_active=True).distinct().order_by("sort_order")
        slugs = [landing_slug(c, city) for city in cities for c in categories]
        slugs += list(SEOLandingPage.objects.filter(status="PUBLISHED").values_list("page_slug", flat=True))
        return Response({"slugs": sorted(set(slugs))})


class LandingDetailView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, slug):
        slug = slug.lower()[:160]
        if not SLUG_RE.match(slug):
            raise Http404
        zone = resolve_zone(request.query_params)

        page = SEOLandingPage.objects.select_related("service__category", "city").filter(
            page_slug=slug, status="PUBLISHED").first()
        if page:
            services = list(page.featured_services.filter(is_active=True, category__is_active=True))
            if not services and page.service_id:
                services = [page.service]
            ids = [s.id for s in services]
            services = list(public_services().filter(id__in=ids))
            category = page.service.category if page.service_id else (services[0].category if services else None)
            return Response({
                "kind": "seo_page", "slug": slug,
                "title": page.meta_title or page.title, "description": page.meta_description,
                "heading": page.hero_heading or page.title, "summary": page.hero_summary,
                "content": page.content_html,
                "city": {"name": page.city.name, "slug": page.city.slug} if page.city_id else None,
                "category": serialize_category(category) if category else None,
                "services": [serialize_service(s, zone) for s in services],
                "faqs": [], "areas": _areas(page.city) if page.city_id else [],
            })

        for city in _active_cities():
            suffix = f"-{city.slug}"
            if not slug.endswith(suffix):
                continue
            category = _match_category(slug[: -len(suffix)])
            if not category:
                continue
            services = list(public_services().filter(category=category).order_by("sort_order", "name"))
            if not services:
                continue
            if slug != landing_slug(category, city):
                return Response({"kind": "redirect", "slug": landing_slug(category, city)})
            label = category.name if any(category.name.lower().endswith(w) for w in SERVICE_WORDS) \
                else f"{category.name} service"
            heading = f"{label} in {city.name}"
            faqs = FAQ.objects.filter(category=category, is_active=True).order_by("sort_order")[:10]
            return Response({
                "kind": "generated", "slug": slug,
                "title": heading,
                "description": (f"Book {label} in {city.name} with verified professionals. "
                                "See the price before you book and pick a time that suits you."),
                "heading": heading,
                "summary": category.description or f"Verified {label} professionals across {city.name}.",
                "content": "",
                "city": {"name": city.name, "slug": city.slug},
                "category": serialize_category(category, sub_service_count=len(services)),
                "services": [serialize_service(s, zone) for s in services],
                "faqs": [{"id": str(f.id), "question": f.question, "answer": f.answer} for f in faqs],
                "areas": _areas(city),
            })
        raise Http404
