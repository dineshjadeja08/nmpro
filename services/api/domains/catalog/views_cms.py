from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.administration.rbac import require
from domains.administration.services import audit
from domains.locations.models import City
from domains.operations.views import paged

from .models import BlogPost, Category, FAQ, HomepageBanner, Review, SEOLandingPage, Service
from .views import serialize_blog_post, serialize_seo_page


class AdminSEOPagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = SEOLandingPage.objects.prefetch_related("featured_services").order_by("page_slug")
        return paged(request, qs, serialize_seo_page)

    def post(self, request):
        require(request.user, "MANAGE_SERVICES")
        page_slug = serializers.SlugField(max_length=160).run_validation(request.data.get("page_slug"))
        title = serializers.CharField(max_length=160).run_validation(request.data.get("title"))
        service = get_object_or_404(Service, id=request.data["service_id"]) if request.data.get("service_id") else None
        city = get_object_or_404(City, id=request.data["city_id"]) if request.data.get("city_id") else None
        page = SEOLandingPage.objects.create(
            page_slug=page_slug, title=title, service=service, city=city,
            area_slug=request.data.get("area_slug", ""),
            meta_title=request.data.get("meta_title", ""),
            meta_description=request.data.get("meta_description", ""),
            hero_heading=request.data.get("hero_heading", ""),
            hero_summary=request.data.get("hero_summary", ""),
            content_html=request.data.get("content_html", ""),
            status=serializers.ChoiceField(choices=["DRAFT", "PUBLISHED"]).run_validation(request.data.get("status", "DRAFT")),
        )
        if request.data.get("featured_service_ids"):
            page.featured_services.set(Service.objects.filter(id__in=request.data["featured_service_ids"]))
        audit(request.user, "SEO_PAGE_CREATED", "SEOLandingPage", page.id, request=request)
        return Response(serialize_seo_page(page), status=201)


class AdminSEOPageDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, page_id):
        require(request.user, "MANAGE_SERVICES")
        page = get_object_or_404(SEOLandingPage, id=page_id)
        for field in ("title", "area_slug", "meta_title", "meta_description", "hero_heading", "hero_summary", "content_html", "status", "page_slug"):
            if field in request.data:
                setattr(page, field, request.data[field])
        if "service_id" in request.data:
            page.service = get_object_or_404(Service, id=request.data["service_id"]) if request.data["service_id"] else None
        if "city_id" in request.data:
            page.city = get_object_or_404(City, id=request.data["city_id"]) if request.data["city_id"] else None
        page.save()
        if "featured_service_ids" in request.data:
            page.featured_services.set(Service.objects.filter(id__in=request.data["featured_service_ids"]))
        audit(request.user, "SEO_PAGE_UPDATED", "SEOLandingPage", page.id, request=request)
        return Response(serialize_seo_page(page))

    def delete(self, request, page_id):
        require(request.user, "MANAGE_SERVICES")
        page = get_object_or_404(SEOLandingPage, id=page_id)
        pid = page.id
        page.delete()
        audit(request.user, "SEO_PAGE_DELETED", "SEOLandingPage", pid, request=request)
        return Response(status=204)


class AdminBlogPostsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        qs = BlogPost.objects.order_by("-created_at")
        return paged(request, qs, serialize_blog_post)

    def post(self, request):
        require(request.user, "MANAGE_SERVICES")
        slug = serializers.SlugField(max_length=160).run_validation(request.data.get("slug"))
        title = serializers.CharField(max_length=180).run_validation(request.data.get("title"))
        is_pub = bool(request.data.get("is_published", False))
        post = BlogPost.objects.create(
            slug=slug, title=title,
            excerpt=request.data.get("excerpt", ""),
            content=request.data.get("content", ""),
            cover_image_url=request.data.get("cover_image_url", ""),
            author_name=request.data.get("author_name", "NammaPros Team"),
            meta_title=request.data.get("meta_title", ""),
            meta_description=request.data.get("meta_description", ""),
            is_published=is_pub,
            published_at=timezone.now() if is_pub else None,
        )
        audit(request.user, "BLOG_POST_CREATED", "BlogPost", post.id, request=request)
        return Response(serialize_blog_post(post), status=201)


class AdminBlogPostDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, post_id):
        require(request.user, "MANAGE_SERVICES")
        post = get_object_or_404(BlogPost, id=post_id)
        for field in ("slug", "title", "excerpt", "content", "cover_image_url", "author_name", "meta_title", "meta_description"):
            if field in request.data:
                setattr(post, field, request.data[field])
        if "is_published" in request.data:
            post.is_published = bool(request.data["is_published"])
            if post.is_published and not post.published_at:
                post.published_at = timezone.now()
        post.save()
        audit(request.user, "BLOG_POST_UPDATED", "BlogPost", post.id, request=request)
        return Response(serialize_blog_post(post))

    def delete(self, request, post_id):
        require(request.user, "MANAGE_SERVICES")
        post = get_object_or_404(BlogPost, id=post_id)
        pid = post.id
        post.delete()
        audit(request.user, "BLOG_POST_DELETED", "BlogPost", pid, request=request)
        return Response(status=204)


def faq_data(faq):
    return {"id": str(faq.id), "question": faq.question, "answer": faq.answer,
            "service_id": str(faq.service_id) if faq.service_id else None,
            "category_id": str(faq.category_id) if faq.category_id else None,
            "sort_order": faq.sort_order, "is_active": faq.is_active}


class AdminFAQsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        return paged(request, FAQ.objects.all(), faq_data)

    def post(self, request):
        require(request.user, "MANAGE_SERVICES")
        q = serializers.CharField(max_length=300).run_validation(request.data.get("question"))
        a = serializers.CharField().run_validation(request.data.get("answer"))
        service = get_object_or_404(Service, id=request.data["service_id"]) if request.data.get("service_id") else None
        cat = get_object_or_404(Category, id=request.data["category_id"]) if request.data.get("category_id") else None
        faq = FAQ.objects.create(question=q, answer=a, service=service, category=cat,
                                 sort_order=int(request.data.get("sort_order", 0)),
                                 is_active=bool(request.data.get("is_active", True)))
        audit(request.user, "FAQ_CREATED", "FAQ", faq.id, request=request)
        return Response(faq_data(faq), status=201)


class AdminFAQDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, faq_id):
        require(request.user, "MANAGE_SERVICES")
        faq = get_object_or_404(FAQ, id=faq_id)
        for field in ("question", "answer", "sort_order", "is_active"):
            if field in request.data:
                setattr(faq, field, request.data[field])
        faq.save()
        audit(request.user, "FAQ_UPDATED", "FAQ", faq.id, request=request)
        return Response(faq_data(faq))

    def delete(self, request, faq_id):
        require(request.user, "MANAGE_SERVICES")
        faq = get_object_or_404(FAQ, id=faq_id)
        fid = faq.id
        faq.delete()
        audit(request.user, "FAQ_DELETED", "FAQ", fid, request=request)
        return Response(status=204)


def banner_data(b):
    return {"id": str(b.id), "title": b.title, "subtitle": b.subtitle, "placement": b.placement,
            "desktop_image_url": b.desktop_image_url, "mobile_image_url": b.mobile_image_url,
            "target_url": b.target_url, "sort_order": b.sort_order, "is_active": b.is_active}


def validate_spotlight_fields(data, placement):
    if placement == "APP_DOWNLOAD":
        image = str(data.get("desktop_image_url") or "").strip()
        if not image.startswith(("https://", "/images/")):
            raise serializers.ValidationError({"desktop_image_url": "Upload a banner image or enter an HTTPS image URL."})
        target = str(data.get("target_url") or "").strip()
        if target and not (target.startswith("https://") or target.startswith("/") and not target.startswith("//")):
            raise serializers.ValidationError({"target_url": "Use an HTTPS URL or a site path beginning with /."})
        return
    if placement != "SPOTLIGHT":
        return
    image = str(data.get("desktop_image_url") or "").strip()
    target = str(data.get("target_url") or "").strip()
    if not image.startswith(("https://", "/images/")):
        raise serializers.ValidationError({"desktop_image_url": "Upload an image or enter an HTTPS image URL."})
    if not (target.startswith("/") and not target.startswith("//") or
            target.startswith(("category:", "service:", "popup:"))):
        raise serializers.ValidationError({"target_url": "Use a site path, category:slug, service:slug, or popup:handyman."})


class AdminHomepageBannerImageView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        require(request.user, "MANAGE_SERVICES")
        from domains.administration.views_core import _validate_and_upload_catalog_image

        _, _, uploaded = _validate_and_upload_catalog_image(request)
        if not uploaded or not uploaded.get("secure_url"):
            raise serializers.ValidationError("Cloudinary image storage is unavailable.")
        return Response({"url": uploaded["secure_url"]}, status=201)


class AdminHomepageBannersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        return paged(request, HomepageBanner.objects.all(), banner_data)

    def post(self, request):
        require(request.user, "MANAGE_SERVICES")
        title = serializers.CharField(max_length=160).run_validation(request.data.get("title"))
        placement = serializers.ChoiceField(choices=[c[0] for c in HomepageBanner.PLACEMENT_CHOICES]).run_validation(request.data.get("placement", "HERO"))
        validate_spotlight_fields(request.data, placement)
        banner = HomepageBanner.objects.create(
            title=title,
            subtitle=request.data.get("subtitle", ""),
            placement=placement,
            desktop_image_url=request.data.get("desktop_image_url", ""),
            mobile_image_url=request.data.get("mobile_image_url", ""),
            target_url=request.data.get("target_url", ""),
            sort_order=int(request.data.get("sort_order", 0)),
            is_active=bool(request.data.get("is_active", True)),
        )
        audit(request.user, "BANNER_CREATED", "HomepageBanner", banner.id, request=request)
        return Response(banner_data(banner), status=201)


class AdminHomepageBannerDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, banner_id):
        require(request.user, "MANAGE_SERVICES")
        banner = get_object_or_404(HomepageBanner, id=banner_id)
        merged = {field: request.data.get(field, getattr(banner, field)) for field in ("desktop_image_url", "target_url")}
        placement = serializers.ChoiceField(choices=[c[0] for c in HomepageBanner.PLACEMENT_CHOICES]).run_validation(request.data.get("placement", banner.placement))
        validate_spotlight_fields(merged, placement)
        for field in ("title", "subtitle", "placement", "desktop_image_url", "mobile_image_url", "target_url", "sort_order", "is_active"):
            if field in request.data:
                setattr(banner, field, request.data[field])
        banner.save()
        audit(request.user, "BANNER_UPDATED", "HomepageBanner", banner.id, request=request)
        return Response(banner_data(banner))

    def delete(self, request, banner_id):
        require(request.user, "MANAGE_SERVICES")
        banner = get_object_or_404(HomepageBanner, id=banner_id)
        bid = banner.id
        banner.delete()
        audit(request.user, "BANNER_DELETED", "HomepageBanner", bid, request=request)
        return Response(status=204)


def review_data(r):
    return {"id": str(r.id), "booking_id": str(r.booking_id) if r.booking_id else None,
            "booking_reference": r.booking.reference if r.booking_id else None,
            "service_id": str(r.service_id), "service": r.service.name,
            "technician_id": str(r.technician_id) if r.technician_id else None,
            "reviewer_name": r.manual_reviewer_name if r.source == "MANUAL" else (r.customer.get_full_name() or r.customer.phone_e164),
            "customer_phone": r.customer.phone_e164 if r.customer_id else None,
            "source": r.source, "rating": r.rating, "comment": r.comment,
            "is_visible": r.is_visible, "moderation_note": r.moderation_note, "created_at": r.created_at}


class AdminReviewsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require(request.user, "VIEW_ADMIN")
        from django.db.models import Q
        qs = Review.objects.select_related("booking", "service", "customer").order_by("-created_at")
        vis = request.query_params.get("visible") or request.query_params.get("is_visible")
        if vis in ("true", "false"):
            qs = qs.filter(is_visible=vis == "true")
        if request.query_params.get("technician"):
            qs = qs.filter(technician_id=request.query_params["technician"])
        if request.query_params.get("service_id"):
            service_id = serializers.UUIDField().run_validation(request.query_params["service_id"])
            qs = qs.filter(service_id=service_id)
        if request.query_params.get("rating"):
            qs = qs.filter(rating=serializers.IntegerField(min_value=1, max_value=5).run_validation(request.query_params["rating"]))
        q = (request.query_params.get("q") or request.query_params.get("search") or "").strip()[:80]
        if q:
            qs = qs.filter(Q(comment__icontains=q) | Q(booking__reference__icontains=q) |
                Q(customer__phone_e164__icontains=q) | Q(manual_reviewer_name__icontains=q))
        return paged(request, qs, review_data)

    def post(self, request):
        require(request.user, "MANAGE_SERVICES")
        service_id = serializers.UUIDField().run_validation(request.data.get("service_id"))
        service = get_object_or_404(Service, id=service_id)
        reviewer_name = serializers.CharField(min_length=2, max_length=100).run_validation(request.data.get("reviewer_name"))
        rating = serializers.IntegerField(min_value=1, max_value=5).run_validation(request.data.get("rating"))
        comment = serializers.CharField(min_length=10, max_length=2000).run_validation(request.data.get("comment"))
        visible = serializers.BooleanField().run_validation(request.data.get("is_visible", False))
        review = Review.objects.create(service=service, source="MANUAL", manual_reviewer_name=reviewer_name,
            rating=rating, comment=comment, is_visible=visible, moderated_by=request.user)
        audit(request.user, "REVIEW_MANUALLY_CREATED", "Review", review.id,
            {"service_id": str(service.id), "is_visible": visible}, request=request)
        return Response(review_data(review), status=201)


class AdminReviewDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, review_id):
        require(request.user, "VIEW_ADMIN")
        review = get_object_or_404(Review.objects.select_related("booking", "service", "customer"), id=review_id)
        manual_fields = {"service_id", "reviewer_name", "rating", "comment"} & set(request.data)
        if manual_fields:
            require(request.user, "MANAGE_SERVICES")
            if review.source != "MANUAL":
                raise serializers.ValidationError("Booking reviews cannot be edited by staff.")
            if "service_id" in manual_fields:
                review.service = get_object_or_404(Service, id=serializers.UUIDField().run_validation(request.data["service_id"]))
            if "reviewer_name" in manual_fields:
                review.manual_reviewer_name = serializers.CharField(min_length=2, max_length=100).run_validation(request.data["reviewer_name"])
            if "rating" in manual_fields:
                review.rating = serializers.IntegerField(min_value=1, max_value=5).run_validation(request.data["rating"])
            if "comment" in manual_fields:
                review.comment = serializers.CharField(min_length=10, max_length=2000).run_validation(request.data["comment"])
        if "is_visible" in request.data:
            review.is_visible = serializers.BooleanField().run_validation(request.data["is_visible"])
        if "moderation_note" in request.data:
            review.moderation_note = str(request.data["moderation_note"])[:240]
        review.moderated_by = request.user
        review.save()
        audit(request.user, "REVIEW_MODERATED", "Review", review.id,
            {"is_visible": review.is_visible, "fields": sorted(manual_fields)}, request=request)
        return Response(review_data(review))
