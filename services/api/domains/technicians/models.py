from django.conf import settings
from django.db import models

from common.models import UUIDStampedModel


class TechnicianProfile(UUIDStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    employee_code = models.CharField(max_length=24, unique=True, null=True, blank=True)
    display_name = models.CharField(max_length=120, blank=True)
    city = models.CharField(max_length=80, blank=True)
    alternate_phone = models.CharField(max_length=20, blank=True, default="")
    virtual_mobile_number = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.CharField(max_length=300, blank=True, default="")
    pincode = models.CharField(max_length=10, blank=True, default="")
    service_group = models.CharField(max_length=100, blank=True, default="")
    profile_type = models.CharField(max_length=50, blank=True, default="")
    lead_per_day = models.PositiveSmallIntegerField(default=0)
    job_per_day = models.PositiveSmallIntegerField(default=0)
    no_of_teams = models.PositiveSmallIntegerField(default=1)
    sales_person_assigned_name = models.CharField(max_length=120, blank=True, default="")
    crm_owner_id = models.CharField(max_length=100, blank=True, default="")
    id_proof_number = models.CharField(max_length=20, blank=True, default="")
    technician_type = models.CharField(max_length=20, choices=[(t, t) for t in ("PARTNER", "EMPLOYEE", "CONTRACT")], default="PARTNER")
    joined_at = models.DateField(null=True, blank=True)
    languages = models.JSONField(default=list, blank=True)
    whatsapp_notifications_enabled = models.BooleanField(default=False)
    internal_notes = models.TextField(max_length=2000, blank=True, default="")
    supported_services = models.ManyToManyField("catalog.Service", blank=True, related_name="technicians")
    experience_years = models.PositiveSmallIntegerField(default=0)
    bio = models.CharField(max_length=500, blank=True)
    requested_zone_ids = models.JSONField(default=list)
    verification_status = models.CharField(max_length=24, choices=[(s, s) for s in (
        "REGISTERED", "PENDING_DOCUMENTS", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED")], default="REGISTERED")
    is_active = models.BooleanField(default=False)
    is_online = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.employee_code:
            from common.sequences import next_technician_code
            self.employee_code = next_technician_code()
        return super().save(*args, **kwargs)


class TechnicianSkill(UUIDStampedModel):
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.PROTECT, related_name="skills")
    code = models.CharField(max_length=60)
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["technician", "code"], name="unique_technician_skill")]


class TechnicianServiceZone(UUIDStampedModel):
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.PROTECT, related_name="zones")
    zone = models.ForeignKey("locations.Zone", on_delete=models.PROTECT)
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["technician", "zone"], name="unique_technician_zone")]


class TechnicianAvailability(UUIDStampedModel):
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.PROTECT, related_name="weekly_availability")
    weekday = models.PositiveSmallIntegerField()
    start_minute = models.PositiveSmallIntegerField()
    end_minute = models.PositiveSmallIntegerField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["technician", "weekday", "start_minute"], name="unique_technician_weekday_start"),
                       models.CheckConstraint(condition=models.Q(weekday__lte=6), name="technician_valid_weekday"),
                       models.CheckConstraint(condition=models.Q(end_minute__gt=models.F("start_minute")), name="technician_positive_window")]


class TechnicianTimeOff(UUIDStampedModel):
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.PROTECT, related_name="time_off")
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    reason = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=16, choices=[(s, s) for s in ("PENDING", "APPROVED", "REJECTED")], default="PENDING")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="reviewed_leaves")
    review_note = models.CharField(max_length=240, blank=True, default="")

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(end_at__gt=models.F("start_at")), name="technician_positive_timeoff")]


class TechnicianCompanyMember(UUIDStampedModel):
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.CASCADE, related_name="company_members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="technician_company_memberships")
    role = models.CharField(max_length=20, choices=[(r, r) for r in ("OWNER", "MANAGER", "TECHNICIAN")], default="TECHNICIAN")
    is_active = models.BooleanField(default=True)
    added_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="added_company_members")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["technician", "user"], name="unique_technician_company_member")]


class TechnicianDocument(UUIDStampedModel):
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.PROTECT, related_name="documents")
    assignment = models.ForeignKey("technicians.JobAssignment", on_delete=models.PROTECT, null=True, blank=True,
                                   related_name="photos")
    kind = models.CharField(max_length=24, choices=[(s, s) for s in ("IDENTITY", "ADDRESS", "CERTIFICATION", "PROFILE_PHOTO", "BEFORE", "AFTER", "RECEIPT")])
    file = models.FileField(upload_to="private/technicians/%Y/%m/")
    content_type = models.CharField(max_length=50)
    status = models.CharField(max_length=20, default="PENDING")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)


class TechnicianVerification(UUIDStampedModel):
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.PROTECT, related_name="verification_events")
    from_status = models.CharField(max_length=24)
    to_status = models.CharField(max_length=24)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    note = models.CharField(max_length=240, blank=True)


class TechnicianAdminGrant(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    role = models.CharField(max_length=24, choices=[("TECH_REVIEWER", "Technician reviewer"), ("TECH_ADMIN", "Technician administrator")])

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "role"], name="unique_technician_admin_grant")]


class JobOffer(UUIDStampedModel):
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, related_name="technician_offers")
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.PROTECT, related_name="offers")
    status = models.CharField(max_length=16, choices=[(s, s) for s in ("OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN")], default="OFFERED")
    expires_at = models.DateTimeField()
    offered_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["booking", "technician"], name="unique_booking_technician_offer")]
        indexes = [models.Index(fields=["technician", "status", "expires_at"])]


class JobAssignment(UUIDStampedModel):
    booking = models.OneToOneField("bookings.Booking", on_delete=models.PROTECT, related_name="technician_assignment")
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.PROTECT, related_name="assignments")
    offer = models.OneToOneField(JobOffer, on_delete=models.PROTECT)
    status = models.CharField(max_length=36, default="ASSIGNED")
    assigned_at = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["technician", "status"])]


class JobStatusEvent(UUIDStampedModel):
    assignment = models.ForeignKey(JobAssignment, on_delete=models.PROTECT, related_name="events")
    from_status = models.CharField(max_length=36)
    to_status = models.CharField(max_length=36)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)

    class Meta:
        ordering = ["created_at"]


class JobInspection(UUIDStampedModel):
    assignment = models.OneToOneField(JobAssignment, on_delete=models.PROTECT, related_name="inspection")
    reported_issue = models.TextField()
    diagnosis = models.TextField()
    work_recommended = models.TextField()
    parts_required = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    submitted_at = models.DateTimeField()


class JobQuotation(UUIDStampedModel):
    assignment = models.ForeignKey(JobAssignment, on_delete=models.PROTECT, related_name="quotations")
    status = models.CharField(max_length=16, choices=[(s, s) for s in ("DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "EXPIRED")], default="SUBMITTED")
    labour_paise = models.PositiveBigIntegerField(default=0)
    parts_paise = models.PositiveBigIntegerField(default=0)
    tax_paise = models.PositiveBigIntegerField(default=0)
    total_paise = models.PositiveBigIntegerField()
    valid_until = models.DateTimeField()
    decided_at = models.DateTimeField(null=True, blank=True)


class QuotationItem(UUIDStampedModel):
    quotation = models.ForeignKey(JobQuotation, on_delete=models.PROTECT, related_name="items")
    description = models.CharField(max_length=180)
    quantity = models.PositiveSmallIntegerField()
    unit_paise = models.PositiveBigIntegerField()
    total_paise = models.PositiveBigIntegerField()


class JobCompletion(UUIDStampedModel):
    assignment = models.OneToOneField(JobAssignment, on_delete=models.PROTECT, related_name="completion")
    checklist = models.JSONField(default=list)
    parts_used = models.TextField(blank=True)
    work_notes = models.TextField()
    completed_at = models.DateTimeField()


class TechnicianCompensationRule(UUIDStampedModel):
    package = models.ForeignKey("catalog.ServicePackage", on_delete=models.PROTECT)
    amount_paise = models.PositiveBigIntegerField()
    is_active = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["package"], condition=models.Q(is_active=True), name="unique_active_tech_comp_rule")]


class TechnicianEarning(UUIDStampedModel):
    assignment = models.OneToOneField(JobAssignment, on_delete=models.PROTECT, related_name="earning")
    technician = models.ForeignKey(TechnicianProfile, on_delete=models.PROTECT)
    amount_paise = models.PositiveBigIntegerField()
    status = models.CharField(max_length=16, choices=[(s, s) for s in ("PENDING", "APPROVED", "PAID")], default="PENDING")
    compensation_rule = models.ForeignKey(TechnicianCompensationRule, on_delete=models.PROTECT, null=True, blank=True)
    commission_rule = models.ForeignKey("administration.CommissionRule", on_delete=models.PROTECT, null=True, blank=True)
    calculation_snapshot = models.JSONField(default=dict)
