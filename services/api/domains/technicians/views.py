
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.audit.models import AuditLog
from domains.bookings.models import Booking
from domains.catalog.models import ServicePackage
from domains.locations.models import Zone
from domains.notifications.models import Notification

from .models import (
    JobAssignment,
    JobOffer,
    JobQuotation,
    TechnicianAdminGrant,
    TechnicianAvailability,
    TechnicianDocument,
    TechnicianProfile,
    TechnicianServiceZone,
    TechnicianSkill,
    TechnicianTimeOff,
)
from .services import (
    JobConflict,
    accept_offer,
    apply,
    complete_job,
    create_offer,
    decide_quotation,
    decline_offer,
    earnings_summary,
    profile_for,
    require_admin,
    review_application,
    submit_application,
    submit_inspection,
    submit_quotation,
    transition,
)


def profile_data(profile):
    return {"id": str(profile.id), "display_name": profile.display_name,
            "phone_e164": profile.user.phone_e164, "city": profile.city,
            "experience_years": profile.experience_years, "bio": profile.bio,
            "requested_zone_ids": profile.requested_zone_ids,
            "verification_status": profile.verification_status, "is_active": profile.is_active,
            "is_online": profile.is_online,
            "skills": [{"id": str(s.id), "code": s.code, "is_verified": s.is_verified} for s in profile.skills.all()],
            "zones": [{"id": str(z.zone_id), "name": z.zone.name,
                       "postal_code": z.zone.postal_code} for z in profile.zones.select_related("zone")],
            "documents": [{"id": str(d.id), "kind": d.kind, "status": d.status}
                          for d in profile.documents.all()]}


def offer_data(offer):
    booking = offer.booking
    return {"id": str(offer.id), "status": offer.status, "expires_at": offer.expires_at,
            "booking_reference": booking.reference, "service": booking.service.name,
            "package": booking.package.name, "start_at": booking.slot.start_at,
            "end_at": booking.slot.end_at, "zone": booking.slot.zone.name,
            "postal_code": booking.slot.zone.postal_code}


def job_data(assignment):
    booking = assignment.booking
    return {"id": str(assignment.id), "status": assignment.status,
            "booking_id": str(booking.id), "booking_reference": booking.reference,
            "booking_status": booking.status, "service": booking.service.name,
            "package": booking.package.name, "start_at": booking.slot.start_at,
            "end_at": booking.slot.end_at, "zone": booking.slot.zone.name,
            "customer": {"name": booking.address.contact_name, "phone": booking.address.contact_phone},
            "address": {"line_1": booking.address.line_1, "locality": booking.address.locality,
                        "city": booking.address.city, "postal_code": booking.address.postal_code,
                        "landmark": booking.address.landmark},
            "events": [{"from_status": e.from_status, "to_status": e.to_status,
                        "created_at": e.created_at} for e in assignment.events.all()],
            "inspection": {"reported_issue": assignment.inspection.reported_issue,
                           "diagnosis": assignment.inspection.diagnosis,
                           "work_recommended": assignment.inspection.work_recommended}
                          if hasattr(assignment, "inspection") else None,
            "quotations": [quotation_data(q) for q in assignment.quotations.all()]}


def quotation_data(quote):
    return {"id": str(quote.id), "status": quote.status, "labour_paise": quote.labour_paise,
            "parts_paise": quote.parts_paise, "tax_paise": quote.tax_paise,
            "total_paise": quote.total_paise, "valid_until": quote.valid_until,
            "items": [{"description": i.description, "quantity": i.quantity,
                       "unit_paise": i.unit_paise, "total_paise": i.total_paise} for i in quote.items.all()]}


class ApplicationInput(serializers.Serializer):
    display_name = serializers.CharField(max_length=120)
    city = serializers.CharField(max_length=80)
    experience_years = serializers.IntegerField(min_value=0, max_value=60)
    bio = serializers.CharField(max_length=500, required=False, allow_blank=True)


class TechnicianApplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = ApplicationInput(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(profile_data(apply(request.user, data.validated_data)), status=201)


class ProfileUpdateInput(serializers.Serializer):
    display_name = serializers.CharField(max_length=120, required=False)
    city = serializers.CharField(max_length=80, required=False)
    experience_years = serializers.IntegerField(min_value=0, max_value=60, required=False)
    bio = serializers.CharField(max_length=500, allow_blank=True, required=False)
    requested_zone_ids = serializers.ListField(child=serializers.UUIDField(), max_length=30, required=False)
    is_online = serializers.BooleanField(required=False)


class TechnicianMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = profile_for(request.user)
        return Response(profile_data(profile))

    def patch(self, request):
        data = ProfileUpdateInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            profile = get_object_or_404(TechnicianProfile.objects.select_for_update(), user=request.user)
            values = data.validated_data
            if values.get("is_online") and (profile.verification_status != "VERIFIED" or not profile.is_active):
                raise JobConflict("Verification is required before going online.")
            if "requested_zone_ids" in values:
                ids = values.pop("requested_zone_ids")
                if Zone.objects.filter(id__in=ids, is_active=True).count() != len(set(ids)):
                    raise serializers.ValidationError("Choose active service zones.")
                profile.requested_zone_ids = [str(value) for value in ids]
            for field, value in values.items():
                setattr(profile, field, value)
            profile.save()
        return Response(profile_data(profile))


class TechnicianSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(profile_data(submit_application(request.user)))


class TechnicianVerificationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = profile_for(request.user)
        return Response({"status": profile.verification_status, "submitted_at": profile.submitted_at,
                         "verified_at": profile.verified_at,
                         "history": [{"from_status": e.from_status, "to_status": e.to_status,
                                      "note": e.note, "created_at": e.created_at}
                                     for e in profile.verification_events.order_by("created_at")]})


class SkillInput(serializers.Serializer):
    codes = serializers.ListField(child=serializers.CharField(max_length=60), max_length=30)


class TechnicianSkillsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = profile_for(request.user)
        available = ServicePackage.objects.filter(is_active=True).values_list("skill_code", flat=True).distinct()
        return Response({"available_codes": list(available),
                         "skills": [{"code": s.code, "is_verified": s.is_verified} for s in profile.skills.all()]})

    def patch(self, request):
        data = SkillInput(data=request.data)
        data.is_valid(raise_exception=True)
        profile = profile_for(request.user)
        codes = set(data.validated_data["codes"])
        if ServicePackage.objects.filter(is_active=True, skill_code__in=codes).values("skill_code").distinct().count() != len(codes):
            raise serializers.ValidationError("Choose known service skills.")
        with transaction.atomic():
            TechnicianProfile.objects.select_for_update().get(id=profile.id)
            profile.skills.exclude(code__in=codes).filter(is_verified=False).delete()
            for code in codes:
                TechnicianSkill.objects.get_or_create(technician=profile, code=code)
        return Response({"skills": [{"code": s.code, "is_verified": s.is_verified} for s in profile.skills.all()]})


class AvailabilityWindow(serializers.Serializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    start_minute = serializers.IntegerField(min_value=0, max_value=1439)
    end_minute = serializers.IntegerField(min_value=1, max_value=1440)


class AvailabilityInput(serializers.Serializer):
    windows = AvailabilityWindow(many=True)

    def validate_windows(self, windows):
        for day in range(7):
            ranges = sorted((w["start_minute"], w["end_minute"]) for w in windows if w["weekday"] == day)
            if any(start >= end for start, end in ranges):
                raise serializers.ValidationError("Availability windows need positive duration.")
            if any(ranges[i][0] < ranges[i - 1][1] for i in range(1, len(ranges))):
                raise serializers.ValidationError("Availability windows cannot overlap.")
        return windows


class TechnicianAvailabilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = profile_for(request.user)
        return Response({"windows": list(profile.weekly_availability.values("weekday", "start_minute", "end_minute")),
                         "time_off": [{"id": str(t.id), "start_at": t.start_at,
                                       "end_at": t.end_at, "reason": t.reason} for t in profile.time_off.all()]})

    def put(self, request):
        data = AvailabilityInput(data=request.data)
        data.is_valid(raise_exception=True)
        profile = profile_for(request.user)
        with transaction.atomic():
            TechnicianProfile.objects.select_for_update().get(id=profile.id)
            profile.weekly_availability.all().delete()
            TechnicianAvailability.objects.bulk_create([TechnicianAvailability(technician=profile, **window)
                for window in data.validated_data["windows"]])
        return self.get(request)


class TimeOffInput(serializers.Serializer):
    start_at = serializers.DateTimeField()
    end_at = serializers.DateTimeField()
    reason = serializers.CharField(max_length=120, allow_blank=True, required=False)


class TechnicianTimeOffView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = TimeOffInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        if values["start_at"] <= timezone.now() or values["end_at"] <= values["start_at"]:
            raise serializers.ValidationError("Choose a future time-off period.")
        profile = profile_for(request.user)
        with transaction.atomic():
            TechnicianProfile.objects.select_for_update().get(id=profile.id)
            if JobAssignment.objects.filter(technician=profile, booking__slot__start_at__lt=values["end_at"],
                booking__slot__end_at__gt=values["start_at"]).exclude(status__in=["SERVICE_COMPLETED", "CANCELLED"]).exists():
                raise JobConflict("Time off overlaps an assigned job.")
            time_off = TechnicianTimeOff.objects.create(technician=profile, **values)
        return Response({"id": str(time_off.id)}, status=201)


class TechnicianDocumentView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        profile = profile_for(request.user)
        kind = request.data.get("kind")
        if kind not in ("IDENTITY", "ADDRESS", "CERTIFICATION", "PROFILE_PHOTO", "BEFORE", "AFTER"):
            raise serializers.ValidationError("Choose a document kind.")
        upload = request.FILES.get("file")
        if not upload or upload.size > 5 * 1024 * 1024 or upload.size < 1:
            raise serializers.ValidationError("Upload a file smaller than 5 MB.")
        head = upload.read(8)
        upload.seek(0)
        content_type = ("application/pdf" if head.startswith(b"%PDF-") else
                        "image/jpeg" if head.startswith(b"\xff\xd8\xff") else
                        "image/png" if head.startswith(b"\x89PNG\r\n\x1a\n") else None)
        if not content_type or (kind == "PROFILE_PHOTO" and content_type == "application/pdf"):
            raise serializers.ValidationError("Use a PDF, JPEG or PNG file.")
        assignment = None
        if kind in ("BEFORE", "AFTER"):
            profile = profile_for(request.user, verified=True)
            job_id = serializers.UUIDField().run_validation(request.data.get("job_id"))
            assignment = JobAssignment.objects.filter(id=job_id, technician=profile).first()
            if not assignment or assignment.status not in ("INSPECTING", "AWAITING_QUOTATION_APPROVAL", "IN_PROGRESS"):
                raise serializers.ValidationError("Select an active assigned job for service photos.")
            if content_type == "application/pdf":
                raise serializers.ValidationError("Service photos must be JPEG or PNG.")
        document = TechnicianDocument.objects.create(technician=profile, kind=kind,
            assignment=assignment, file=upload, content_type=content_type)
        return Response({"id": str(document.id), "kind": kind, "status": document.status}, status=201)


class TechnicianZonesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from domains.administration.rbac import roles_for
        if not (roles_for(request.user).intersection({"SUPER_ADMIN", "TECHNICIAN_VERIFIER"}) or
                TechnicianAdminGrant.objects.filter(user=request.user, role__in=["TECH_REVIEWER", "TECH_ADMIN"]).exists()):
            profile_for(request.user)
        zones = Zone.objects.filter(is_active=True, city__is_active=True).select_related("city").order_by("city__name", "name")
        return Response({"zones": [{"id": str(z.id), "name": z.name, "city": z.city.name,
                                     "postal_code": z.postal_code} for z in zones]})


class TechnicianOffersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = profile_for(request.user)
        offers = JobOffer.objects.filter(technician=profile).select_related(
            "booking__service", "booking__package", "booking__slot__zone").order_by("-created_at")[:50]
        return Response({"offers": [offer_data(o) for o in offers]})


class TechnicianOfferActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, offer_id, action):
        if action == "accept":
            assignment = accept_offer(request.user, offer_id)
            return Response({"assignment_id": str(assignment.id), "status": assignment.status})
        if action == "decline":
            offer = decline_offer(request.user, offer_id)
            return Response({"id": str(offer.id), "status": offer.status})
        raise Http404()


class TechnicianJobsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = profile_for(request.user, verified=True)
        jobs = JobAssignment.objects.filter(technician=profile).select_related(
            "booking__service", "booking__package", "booking__slot__zone", "booking__address")
        return Response({"jobs": [job_data(job) for job in jobs.order_by("-assigned_at")[:50]]})


class TechnicianJobDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, job_id):
        profile = profile_for(request.user, verified=True)
        job = get_object_or_404(JobAssignment.objects.select_related(
            "booking__service", "booking__package", "booking__slot__zone", "booking__address"),
            id=job_id, technician=profile)
        return Response(job_data(job))


class TechnicianJobActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, job_id, action):
        targets = {"en-route": "EN_ROUTE", "arrived": "ARRIVED", "start-inspection": "INSPECTING",
                   "start-work": "IN_PROGRESS"}
        if action not in targets:
            raise Http404()
        job = transition(request.user, job_id, targets[action])
        return Response({"id": str(job.id), "status": job.status})


class InspectionInput(serializers.Serializer):
    reported_issue = serializers.CharField(max_length=4000)
    diagnosis = serializers.CharField(max_length=4000)
    work_recommended = serializers.CharField(max_length=4000)
    parts_required = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    notes = serializers.CharField(max_length=4000, allow_blank=True, required=False)


class TechnicianInspectView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, job_id):
        data = InspectionInput(data=request.data)
        data.is_valid(raise_exception=True)
        inspection = submit_inspection(request.user, job_id, data.validated_data)
        return Response({"id": str(inspection.id), "submitted_at": inspection.submitted_at}, status=201)


class QuotationItemInput(serializers.Serializer):
    description = serializers.CharField(max_length=180)
    quantity = serializers.IntegerField(min_value=1, max_value=100)
    unit_paise = serializers.IntegerField(min_value=0, max_value=10_000_000)


class QuotationInput(serializers.Serializer):
    labour_paise = serializers.IntegerField(min_value=0, max_value=10_000_000)
    items = QuotationItemInput(many=True)
    valid_until = serializers.DateTimeField()


class TechnicianQuotationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, job_id):
        data = QuotationInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        quote = submit_quotation(request.user, job_id, values["labour_paise"], values["items"], values["valid_until"])
        return Response(quotation_data(quote), status=201)


class CompletionInput(serializers.Serializer):
    checklist = serializers.ListField(child=serializers.CharField(max_length=160), min_length=1, max_length=30)
    parts_used = serializers.CharField(max_length=2000, allow_blank=True, required=False)
    work_notes = serializers.CharField(max_length=4000)


class TechnicianCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, job_id):
        data = CompletionInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        job = complete_job(request.user, job_id, values["checklist"], values.get("parts_used", ""), values["work_notes"])
        return Response({"id": str(job.id), "status": job.status, "completed_at": job.completed_at})


class TechnicianEarningsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(earnings_summary(profile_for(request.user)))


class TechnicianNotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_for(request.user)
        rows = Notification.objects.filter(recipient=request.user, event__in=[
            "TECHNICIAN_VERIFIED", "TECHNICIAN_REJECTED", "TECHNICIAN_SUSPENDED",
            "NEW_JOB_OFFER", "QUOTATION_APPROVED", "QUOTATION_REJECTED", "BOOKING_CANCELLED",
        ]).order_by("-created_at")[:20]
        return Response({"notifications": [{"id": str(row.id), "event": row.event,
                                             "booking_reference": row.payload.get("booking_reference", ""),
                                             "created_at": row.created_at} for row in rows]})


class CustomerQuotationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        booking = get_object_or_404(Booking, id=booking_id, user=request.user)
        quotes = JobQuotation.objects.filter(assignment__booking=booking).prefetch_related("items").order_by("-created_at")
        return Response({"quotations": [quotation_data(q) for q in quotes]})


class CustomerQuotationDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, booking_id, quote_id, action):
        if action not in ("approve", "reject"):
            raise Http404()
        return Response(quotation_data(decide_quotation(request.user, booking_id, quote_id,
                                                      action == "approve")))


class AdminApplicationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_admin(request.user, "TECH_REVIEWER", "TECH_ADMIN")
        status = request.query_params.get("status", "UNDER_REVIEW")
        profiles = TechnicianProfile.objects.filter(verification_status=status).select_related("user").order_by("created_at")[:50]
        return Response({"applications": [profile_data(p) for p in profiles]})


class AdminApplicationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, profile_id):
        require_admin(request.user, "TECH_REVIEWER", "TECH_ADMIN")
        return Response(profile_data(get_object_or_404(TechnicianProfile.objects.select_related("user"), id=profile_id)))


class ReviewInput(serializers.Serializer):
    status = serializers.ChoiceField(choices=["VERIFIED", "REJECTED", "SUSPENDED"])
    note = serializers.CharField(max_length=240, allow_blank=True, required=False)


class AdminReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, profile_id):
        data = ReviewInput(data=request.data)
        data.is_valid(raise_exception=True)
        profile = review_application(request.user, profile_id, data.validated_data["status"],
                                     data.validated_data.get("note", ""))
        return Response(profile_data(profile))


class AdminSkillVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, skill_id):
        require_admin(request.user, "TECH_REVIEWER", "TECH_ADMIN")
        with transaction.atomic():
            skill = get_object_or_404(TechnicianSkill.objects.select_for_update(), id=skill_id)
            skill.is_verified = True
            skill.verified_by = request.user
            skill.save(update_fields=["is_verified", "verified_by", "updated_at"])
            AuditLog.objects.create(actor=request.user, action="TECHNICIAN_SKILL_VERIFIED",
                                    resource_type="TechnicianSkill", resource_id=str(skill.id))
        return Response({"id": str(skill.id), "is_verified": True})


class AdminZoneInput(serializers.Serializer):
    zone_id = serializers.UUIDField()


class AdminZoneAssignView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, profile_id):
        require_admin(request.user, "TECH_REVIEWER", "TECH_ADMIN")
        data = AdminZoneInput(data=request.data)
        data.is_valid(raise_exception=True)
        zone = get_object_or_404(Zone, id=data.validated_data["zone_id"], is_active=True)
        profile = get_object_or_404(TechnicianProfile, id=profile_id)
        assigned, _ = TechnicianServiceZone.objects.get_or_create(technician=profile,
            zone=zone, defaults={"assigned_by": request.user})
        AuditLog.objects.create(actor=request.user, action="TECHNICIAN_ZONE_ASSIGNED",
                                resource_type="TechnicianServiceZone", resource_id=str(assigned.id))
        return Response({"id": str(assigned.id), "zone_id": str(zone.id)})


class AdminDocumentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, document_id):
        require_admin(request.user, "TECH_REVIEWER", "TECH_ADMIN")
        document = get_object_or_404(TechnicianDocument, id=document_id)
        return FileResponse(document.file.open("rb"), content_type=document.content_type, as_attachment=True,
                            filename=f"technician-document-{document.id}")


class DocumentReviewInput(serializers.Serializer):
    status = serializers.ChoiceField(choices=["APPROVED", "REJECTED"])


class AdminDocumentReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, document_id):
        require_admin(request.user, "TECH_REVIEWER", "TECH_ADMIN")
        data = DocumentReviewInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            document = get_object_or_404(TechnicianDocument.objects.select_for_update(), id=document_id)
            document.status = data.validated_data["status"]
            document.reviewed_by = request.user
            document.save(update_fields=["status", "reviewed_by", "updated_at"])
            AuditLog.objects.create(actor=request.user, action=f"TECHNICIAN_DOCUMENT_{document.status}",
                                    resource_type="TechnicianDocument", resource_id=str(document.id))
        return Response({"id": str(document.id), "status": document.status})


class AdminOfferInput(serializers.Serializer):
    booking_id = serializers.UUIDField()
    technician_id = serializers.UUIDField()
    expires_at = serializers.DateTimeField()


class AdminCreateOfferView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = AdminOfferInput(data=request.data)
        data.is_valid(raise_exception=True)
        offer = create_offer(request.user, data.validated_data["booking_id"],
                             data.validated_data["technician_id"], data.validated_data["expires_at"])
        return Response(offer_data(offer), status=201)
