import mimetypes
from uuid import UUID

from django.conf import settings
from django.db.models import Avg, Count, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404, redirect
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.bookings.models import Booking
from .models import BlogPost, Category, FAQ, HomepageBanner, Review, SEOLandingPage, Service, ServiceImage, ServiceSlugHistory


def serialize_category(category, sub_service_count=None):
    if sub_service_count is None:
        sub_service_count = getattr(category, "sub_service_count", None)
    if sub_service_count is None:
        sub_service_count = category.services.filter(is_active=True).count()
    return {
        "id": str(category.id),
        "slug": category.slug,
        "name": category.name,
        "description": category.description,
        "short_description": category.description,
        "image_url": category.image_display,
        "icon_url": category.icon_display,
        "banner_image": category.banner_image_display,
        "banner_title": category.banner_title,
        "banner_subtitle": category.banner_subtitle,
        "banner_button_text": category.banner_button_text,
        "banner_button_link": category.banner_button_link,
        "banner_is_active": category.banner_is_active,
        "sort_order": category.sort_order,
        "is_active": category.is_active,
        "sub_service_count": sub_service_count,
    }


def _serialize_review(r):
    booking = getattr(r, "booking", None)
    address = getattr(booking, "address", None) if booking else None
    area = ""
    if address:
        area = address.locality or address.city or ""
    tech_name = r.technician.display_name if r.technician else ""
    customer_label = (r.customer.get_full_name() or r.customer.first_name or "Customer").strip()
    return {
        "id": str(r.id),
        "rating": r.rating,
        "comment": r.comment,
        "tags": r.tags or [],
        "photo_url": r.photo_display,
        "customer_name": customer_label or "Customer",
        "area": area,
        "technician_name": tech_name,
        "service_name": r.service.name if r.service_id else "",
        "service_slug": r.service.slug if r.service_id else "",
        "category_slug": r.service.category.slug if r.service_id and r.service.category_id else "",
        "created_at": r.created_at,
    }


def _package_price_paise(pkg):
    first_rule = next((pr for pr in pkg.prices.all() if pr.is_active), None)
    if not first_rule:
        return None
    return int((first_rule.base_paise or 0) + (first_rule.inspection_paise or 0) + (first_rule.fee_paise or 0) + (first_rule.tax_paise or 0))


def serialize_service(service):
    main_img = service.cover_image_display
    banner_img = service.landing_thumbnail_display
    visible_reviews = [r for r in service.reviews.all() if r.is_visible] if hasattr(service, "_prefetched_objects_cache") and "reviews" in service._prefetched_objects_cache else list(Review.objects.filter(service=service, is_visible=True).only("rating"))
    rating_avg = round(sum(r.rating for r in visible_reviews) / len(visible_reviews), 1) if visible_reviews else None
    packages_data = []
    for p in service.packages.all():
        if not p.is_active:
            continue
        pkg_price = _package_price_paise(p)
        packages_data.append({
            "id": str(p.id),
            "name": p.name,
            "pricing_model": p.pricing_model,
            "duration_minutes": p.duration_minutes,
            "description": p.description,
            "requirements": p.requirements,
            "inclusions": p.inclusions,
            "exclusions": p.exclusions,
            "starting_price_paise": pkg_price if pkg_price is not None else service.starting_price_paise,
            "original_price_paise": p.original_price_paise,
            "is_most_booked": bool(p.is_most_booked),
        })
    return {"id": str(service.id), "slug": service.slug, "name": service.name,
            "summary": service.summary, "short_description": service.summary,
            "description": service.description, "full_description": service.description,
            "category": service.category.slug, "category_id": str(service.category_id),
            "category_name": service.category.name,
            "starting_price_paise": service.starting_price_paise,
            "price_note": service.price_note,
            "rating_avg": rating_avg,
            "review_count": len(visible_reviews),
            "is_active": service.is_active,
            "is_popular": service.is_popular, "is_featured": service.is_featured, "show_in_app": service.show_in_app,
            "training_fee_paise": service.training_fee_paise, "important_notes": service.important_notes,
            "features": service.features, "inclusions": service.inclusions, "exclusions": service.exclusions,
            "faqs": service.faq_items, "process_steps": service.process_steps or [], "spare_parts_rates": service.spare_parts_rates or [],
            "brands": service.brands or [],
            "seo_title": service.seo_title, "seo_description": service.seo_description,
            "sort_order": service.sort_order,
            "banner_title": service.banner_title, "banner_subtitle": service.banner_subtitle,
            "banner_button_text": service.banner_button_text, "banner_button_link": service.banner_button_link,
            "banner_is_active": service.banner_is_active,
            "main_image": main_img, "banner_image": banner_img,
            "cover_image": service.cover_image_display,
            "landing_thumbnail": service.landing_thumbnail_display,
            "popup_cover_image": service.popup_cover_image_display,
            "popup_content_image": service.popup_content_image_display,
            "list_image": service.list_image_display,
            "images": [{"id": str(i.id), "url": i.cloudinary_url or f"/api/v1/catalog/images/{i.id}/",
                        "alt_text": i.alt_text, "sort_order": i.sort_order}
                       for i in service.images.all() if i.is_active],
            "packages": packages_data}


class CatalogView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        categories = Category.objects.filter(is_active=True).annotate(
            sub_service_count=Count("services", filter=Q(services__is_active=True), distinct=True)
        ).order_by("sort_order", "name")
        services = Service.objects.select_related("category").prefetch_related(
            "packages__prices", "images", "reviews"
        ).filter(is_active=True, category__is_active=True).order_by("sort_order", "name")
        reviews_qs = Review.objects.filter(is_visible=True).select_related(
            "customer", "technician", "booking__address", "service__category"
        ).order_by("-created_at")
        review_agg = reviews_qs.aggregate(average_rating=Avg("rating"), review_count=Count("id"))
        completed_homes = Booking.objects.filter(status__in=["COMPLETED", "CLOSED"]).count()
        banners = HomepageBanner.objects.filter(is_active=True).order_by("sort_order", "created_at")[:6]
        return Response({
            "categories": [serialize_category(c) for c in categories],
            "services": [serialize_service(s) for s in services],
            "reviews": [_serialize_review(r) for r in reviews_qs[:6]],
            "banners": [
                {
                    "id": str(b.id),
                    "title": b.title,
                    "subtitle": b.subtitle,
                    "placement": b.placement,
                    "desktop_image_url": b.desktop_image_url,
                    "mobile_image_url": b.mobile_image_url,
                    "target_url": b.target_url,
                }
                for b in banners
            ],
            "trust_stats": {
                "average_rating": round(review_agg["average_rating"], 1) if review_agg["average_rating"] else None,
                "review_count": review_agg["review_count"],
                "completed_bookings_count": completed_homes,
            },
            "demo": settings.ENVIRONMENT != "production",
        })


class ServiceDetailView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, slug):
        service = Service.objects.select_related("category").prefetch_related("packages__prices", "images", "reviews").filter(
            slug=slug, is_active=True, category__is_active=True
        ).first()
        if not service:
            history = ServiceSlugHistory.objects.select_related("service").filter(
                old_slug=slug, service__is_active=True, service__category__is_active=True
            ).first()
            if history:
                return redirect(f"/api/v1/services/{history.service.slug}/", permanent=True)
            get_object_or_404(Service, slug="__missing__")
        return Response(serialize_service(service))


class CategoryListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        categories = Category.objects.filter(is_active=True).annotate(
            sub_service_count=Count("services", filter=Q(services__is_active=True), distinct=True)
        ).order_by("sort_order", "name")
        return Response({"categories": [serialize_category(c) for c in categories]})


class CategoryDetailPublicView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, slug):
        category = get_object_or_404(Category, slug=slug, is_active=True)
        services = Service.objects.select_related("category").prefetch_related(
            "packages__prices", "images", "reviews"
        ).filter(
            category=category, is_active=True
        ).order_by("sort_order", "name")
        return Response({
            "category": serialize_category(category, sub_service_count=services.count()),
            "services": [serialize_service(s) for s in services],
        })


class SubServiceDetailPublicView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, category_slug, service_slug):
        category = get_object_or_404(Category, slug=category_slug, is_active=True)
        service = (
            Service.objects.select_related("category")
            .prefetch_related("packages__prices", "images", "reviews")
            .filter(
                category=category,
                is_active=True,
                slug__in=[service_slug, f"{category_slug}-{service_slug}"],
            )
            .first()
        )
        if not service:
            get_object_or_404(Service, slug="__missing__")
        siblings = (
            Service.objects.select_related("category")
            .prefetch_related("packages__prices", "images", "reviews")
            .filter(category=category, is_active=True)
            .exclude(id=service.id)
            .order_by("sort_order", "name")[:12]
        )
        return Response({
            "category": serialize_category(category),
            "service": serialize_service(service),
            "related_services": [serialize_service(s) for s in siblings],
        })


class CategoryMediaView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, category_id, slot):
        category = get_object_or_404(Category, id=category_id)
        if slot == "card":
            if category.image_url:
                return redirect(category.image_url)
            field = category.image
        elif slot == "icon":
            if category.icon_url:
                return redirect(category.icon_url)
            field = category.icon
        elif slot == "banner":
            if category.banner_image_url:
                return redirect(category.banner_image_url)
            field = category.banner_image
        else:
            get_object_or_404(Category, slug="__missing__")
            return
        if not field or not getattr(field, "name", ""):
            get_object_or_404(Category, slug="__missing__")
        ctype, _ = mimetypes.guess_type(field.name)
        return FileResponse(field.open("rb"), content_type=ctype or "image/jpeg")


class ServiceSlotMediaView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, service_id, slot):
        slot_map = {
            "main_image": "cover_image",
            "cover_image": "cover_image",
            "banner_image": "landing_thumbnail",
            "landing_thumbnail": "landing_thumbnail",
            "popup_cover_image": "popup_cover_image",
            "popup_content_image": "popup_content_image",
            "list_image": "list_image",
        }
        field_name = slot_map.get(slot)
        if not field_name:
            get_object_or_404(Service, slug="__missing__")
        service = get_object_or_404(Service, id=service_id)
        url_override = getattr(service, f"{field_name}_url", "")
        if url_override:
            return redirect(url_override)
        field = getattr(service, field_name, None)
        if not field or not getattr(field, "name", ""):
            get_object_or_404(Service, slug="__missing__")
        ctype, _ = mimetypes.guess_type(field.name)
        return FileResponse(field.open("rb"), content_type=ctype or "image/jpeg")


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
        image = get_object_or_404(ServiceImage, id=image_id, is_active=True)
        if image.cloudinary_url:
            return redirect(image.cloudinary_url)
        return FileResponse(image.file.open("rb"), content_type=image.content_type)


def serialize_seo_page(page):
    return {
        "id": str(page.id),
        "page_slug": page.page_slug,
        "title": page.title,
        "service_id": str(page.service_id) if page.service_id else None,
        "city_id": str(page.city_id) if page.city_id else None,
        "area_slug": page.area_slug,
        "meta_title": page.meta_title,
        "meta_description": page.meta_description,
        "hero_heading": page.hero_heading,
        "hero_summary": page.hero_summary,
        "content_html": page.content_html,
        "featured_services": [serialize_service(s) for s in page.featured_services.filter(is_active=True)],
        "status": page.status,
    }


def serialize_blog_post(post):
    return {
        "id": str(post.id),
        "slug": post.slug,
        "title": post.title,
        "excerpt": post.excerpt,
        "content": post.content,
        "cover_image_url": post.cover_image_url,
        "author_name": post.author_name,
        "meta_title": post.meta_title,
        "meta_description": post.meta_description,
        "is_published": post.is_published,
        "published_at": post.published_at,
    }


class SEOPageListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        pages = SEOLandingPage.objects.filter(status="PUBLISHED").prefetch_related("featured_services__packages", "featured_services__images", "featured_services__category").order_by("page_slug")
        return Response({"results": [serialize_seo_page(p) for p in pages[:100]]})


class SEOPageDetailView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, page_slug):
        page = get_object_or_404(SEOLandingPage.objects.prefetch_related("featured_services__packages", "featured_services__images", "featured_services__category"), page_slug=page_slug, status="PUBLISHED")
        return Response(serialize_seo_page(page))


class BlogPostListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        posts = BlogPost.objects.filter(is_published=True).order_by("-published_at", "-created_at")
        return Response({"results": [serialize_blog_post(p) for p in posts[:50]]})


class BlogPostDetailView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, slug):
        post = get_object_or_404(BlogPost, slug=slug, is_published=True)
        return Response(serialize_blog_post(post))


class FAQListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        qs = FAQ.objects.filter(is_active=True)
        if request.query_params.get("service_id"):
            qs = qs.filter(service_id=request.query_params["service_id"])
        if request.query_params.get("category_id"):
            qs = qs.filter(category_id=request.query_params["category_id"])
        return Response({"results": [{"id": str(f.id), "question": f.question, "answer": f.answer,
                                      "service_id": str(f.service_id) if f.service_id else None,
                                      "category_id": str(f.category_id) if f.category_id else None} for f in qs]})


class HomepageBannerListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        qs = HomepageBanner.objects.filter(is_active=True)
        if request.query_params.get("placement"):
            qs = qs.filter(placement=request.query_params["placement"])
        return Response({"results": [{"id": str(b.id), "title": b.title, "subtitle": b.subtitle,
                                      "placement": b.placement, "desktop_image_url": b.desktop_image_url,
                                      "mobile_image_url": b.mobile_image_url, "target_url": b.target_url} for b in qs]})


class ServiceReviewListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, service_id):
        try:
            UUID(str(service_id))
            service = get_object_or_404(Service, id=service_id, is_active=True)
        except ValueError:
            service = get_object_or_404(Service, slug=service_id, is_active=True)
        reviews = Review.objects.filter(service=service, is_visible=True).select_related(
            "customer", "technician", "booking__address", "service__category"
        ).order_by("-created_at")
        agg = reviews.aggregate(average_rating=Avg("rating"), review_count=Count("id"))
        breakdown = {str(star): 0 for star in (5, 4, 3, 2, 1)}
        for row in reviews.values("rating").annotate(cnt=Count("id")):
            key = str(row["rating"])
            if key in breakdown:
                breakdown[key] = row["cnt"]
        return Response({
            "average_rating": round(agg["average_rating"], 1) if agg["average_rating"] else None,
            "review_count": agg["review_count"],
            "rating_breakdown": breakdown,
            "results": [_serialize_review(r) for r in reviews[:50]],
        })


class PublicReviewListView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        reviews = Review.objects.filter(is_visible=True).select_related(
            "customer", "technician", "booking__address", "service__category"
        ).order_by("-created_at")
        agg = reviews.aggregate(average_rating=Avg("rating"), review_count=Count("id"))
        return Response({
            "average_rating": round(agg["average_rating"], 1) if agg["average_rating"] else None,
            "review_count": agg["review_count"],
            "results": [_serialize_review(r) for r in reviews[:24]],
        })


class ReviewPhotoView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, review_id):
        review = get_object_or_404(Review, id=review_id, is_visible=True)
        if review.photo_url:
            return redirect(review.photo_url)
        if not review.photo or not getattr(review.photo, "name", ""):
            get_object_or_404(Review, id="00000000-0000-0000-0000-000000000000")
        ctype, _ = mimetypes.guess_type(review.photo.name)
        return FileResponse(review.photo.open("rb"), content_type=ctype or "image/jpeg")


class BookingReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id):
        import json as json_mod
        booking = get_object_or_404(Booking, id=booking_id, user=request.user)
        if hasattr(booking, "review"):
            raise serializers.ValidationError("A review has already been submitted for this booking.")
        completed = (
            booking.status in ("COMPLETED", "CLOSED")
            or (hasattr(booking, "technician_assignment") and booking.technician_assignment.status == "SERVICE_COMPLETED")
        )
        if not completed:
            raise serializers.ValidationError("Reviews can only be submitted after the service is completed.")
        rating = serializers.IntegerField(min_value=1, max_value=5).run_validation(request.data.get("rating"))
        comment = serializers.CharField(max_length=2000, allow_blank=True, required=False).run_validation(request.data.get("comment", ""))
        raw_tags = request.data.get("tags", [])
        if isinstance(raw_tags, str):
            try:
                raw_tags = json_mod.loads(raw_tags)
            except Exception:
                raw_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
        tags = [str(t).strip()[:40] for t in (raw_tags or []) if str(t).strip()][:8]
        photo = request.FILES.get("photo")
        tech = booking.technician_assignment.technician if hasattr(booking, "technician_assignment") else None
        review = Review.objects.create(
            booking=booking,
            service=booking.service,
            customer=request.user,
            technician=tech,
            rating=rating,
            comment=comment,
            tags=tags,
            photo=photo,
        )
        return Response(_serialize_review(review), status=201)
