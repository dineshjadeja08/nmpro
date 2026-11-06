from django.conf import settings
from django.db import models

from common.models import UUIDStampedModel

ROLES = ("OPERATIONS_VIEWER", "DISPATCH_OPERATOR", "SUPPORT_AGENT", "OPERATIONS_MANAGER", "SUPER_ADMIN")


class OperationsGrant(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    role = models.CharField(max_length=32, choices=[(r, r) for r in ROLES])

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "role"], name="unique_operations_grant")]


LEAD_STATUSES = ("NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "LOST", "CANCELLED")
LEAD_SOURCES = ("PHONE_CALL", "WHATSAPP", "WEBSITE", "WALK_IN", "REFERRAL", "CAMPAIGN", "OTHER")


class OperationsZoneGrant(UUIDStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="operations_zones")
    zone = models.ForeignKey("locations.Zone", on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "zone"], name="unique_operations_zone_grant")]


class Lead(UUIDStampedModel):
    lead_reference = models.CharField(max_length=28, unique=True)
    customer_name = models.CharField(max_length=120)
    mobile_number = models.CharField(max_length=16, db_index=True)
    alternate_mobile = models.CharField(max_length=16, blank=True)
    email = models.EmailField(blank=True)
    service_category = models.ForeignKey("catalog.Category", on_delete=models.PROTECT)
    service = models.ForeignKey("catalog.Service", on_delete=models.PROTECT)
    zone = models.ForeignKey("locations.Zone", on_delete=models.PROTECT, null=True, blank=True)
    problem_description = models.TextField(max_length=4000, blank=True)
    address = models.CharField(max_length=200, blank=True)
    landmark = models.CharField(max_length=120, blank=True)
    area = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=80, blank=True)
    pincode = models.CharField(max_length=6, blank=True)
    preferred_date = models.DateField(null=True, blank=True)
    preferred_time = models.TimeField(null=True, blank=True)
    urgency = models.CharField(max_length=12, choices=[(s, s) for s in ("NORMAL", "SOON", "URGENT")], default="NORMAL")
    source = models.CharField(max_length=16, choices=[(s, s) for s in LEAD_SOURCES])
    status = models.CharField(max_length=16, choices=[(s, s) for s in LEAD_STATUSES], default="NEW")
    priority = models.CharField(max_length=12, choices=[(s, s) for s in ("LOW", "NORMAL", "HIGH", "URGENT")], default="NORMAL")
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="assigned_leads")
    follow_up_at = models.DateTimeField(null=True, blank=True)
    internal_notes = models.TextField(max_length=4000, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_leads")
    converted_booking = models.OneToOneField("bookings.Booking", on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "-created_at"]), models.Index(fields=["follow_up_at"])]


class LeadActivity(UUIDStampedModel):
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    kind = models.CharField(max_length=24)
    detail = models.JSONField(default=dict)

    class Meta:
        ordering = ["created_at", "id"]


class LeadFollowUp(UUIDStampedModel):
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="follow_ups")
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    due_at = models.DateTimeField()
    notes = models.TextField(max_length=2000, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    reminded_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="completed_lead_follow_ups")

    class Meta:
        indexes = [models.Index(fields=["completed_at", "due_at"])]


class DispatchRule(UUIDStampedModel):
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=False)
    automatic_enabled = models.BooleanField(default=False)
    offer_timeout_minutes = models.PositiveSmallIntegerField(default=15)
    maximum_attempts = models.PositiveSmallIntegerField(default=3)
    travel_buffer_minutes = models.PositiveSmallIntegerField(default=30)
    weight_workload = models.PositiveSmallIntegerField(default=10)
    weight_availability = models.PositiveSmallIntegerField(default=10)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["is_active"], condition=models.Q(is_active=True),
                                               name="unique_active_dispatch_rule")]


class DispatchAttempt(UUIDStampedModel):
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, related_name="dispatch_attempts")
    technician = models.ForeignKey("technicians.TechnicianProfile", on_delete=models.PROTECT)
    offer = models.OneToOneField("technicians.JobOffer", on_delete=models.PROTECT, null=True)
    status = models.CharField(max_length=24, choices=[(s, s) for s in ("OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN", "SKIPPED")])
    mode = models.CharField(max_length=12, choices=[("MANUAL", "Manual"), ("AUTOMATIC", "Automatic")])
    reason = models.CharField(max_length=240, blank=True)

    class Meta:
        indexes = [models.Index(fields=["booking", "created_at"])]


class OperatorNote(UUIDStampedModel):
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, null=True, blank=True, related_name="operator_notes")
    technician = models.ForeignKey("technicians.TechnicianProfile", on_delete=models.PROTECT, null=True, blank=True, related_name="operator_notes")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="operator_notes_received")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="operator_notes_written")
    text = models.TextField(max_length=2000)


class SLAPolicy(UUIDStampedModel):
    code = models.CharField(max_length=40, unique=True, choices=[(s, s) for s in ("ASSIGNMENT", "ACKNOWLEDGEMENT", "ARRIVAL", "SUPPORT_RESPONSE")])
    duration_minutes = models.PositiveIntegerField()
    warning_minutes = models.PositiveIntegerField(default=15)
    is_active = models.BooleanField(default=False)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)


class SLATracker(UUIDStampedModel):
    policy = models.ForeignKey(SLAPolicy, on_delete=models.PROTECT)
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, null=True, blank=True)
    ticket = models.ForeignKey("operations.SupportTicket", on_delete=models.PROTECT, null=True, blank=True)
    start_at = models.DateTimeField()
    deadline_at = models.DateTimeField()
    state = models.CharField(max_length=16, choices=[(s, s) for s in ("OPEN", "BREACHED", "RESOLVED")], default="OPEN")
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["state", "deadline_at"])]
        constraints = [
            models.UniqueConstraint(fields=["policy", "booking"], condition=models.Q(booking__isnull=False), name="unique_booking_sla_policy"),
            models.UniqueConstraint(fields=["policy", "ticket"], condition=models.Q(ticket__isnull=False), name="unique_ticket_sla_policy"),
        ]


class SLABreach(UUIDStampedModel):
    tracker = models.OneToOneField(SLATracker, on_delete=models.PROTECT)
    breached_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)


class SupportTicket(UUIDStampedModel):
    reference = models.CharField(max_length=24, unique=True)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, null=True, blank=True)
    category = models.CharField(max_length=40)
    priority = models.CharField(max_length=12, choices=[(s, s) for s in ("LOW", "NORMAL", "HIGH", "URGENT")], default="NORMAL")
    subject = models.CharField(max_length=180)
    description = models.TextField(max_length=4000)
    status = models.CharField(max_length=20, choices=[(s, s) for s in ("OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED")], default="OPEN")
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="assigned_support_tickets")
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "created_at"]), models.Index(fields=["customer", "created_at"])]


class SupportTicketEvent(UUIDStampedModel):
    ticket = models.ForeignKey(SupportTicket, on_delete=models.PROTECT, related_name="events")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    kind = models.CharField(max_length=20, choices=[(s, s) for s in ("STATUS", "NOTE", "COMMUNICATION", "ASSIGNMENT")])
    text = models.TextField(max_length=2000, blank=True)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)


class OperationalEscalation(UUIDStampedModel):
    booking = models.ForeignKey("bookings.Booking", on_delete=models.PROTECT, null=True, blank=True)
    ticket = models.ForeignKey(SupportTicket, on_delete=models.PROTECT, null=True, blank=True)
    category = models.CharField(max_length=40)
    priority = models.CharField(max_length=12, choices=[(s, s) for s in ("NORMAL", "HIGH", "URGENT")], default="NORMAL")
    status = models.CharField(max_length=20, choices=[(s, s) for s in ("OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED")], default="OPEN")
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="assigned_escalations")
    notes = models.TextField(max_length=2000, blank=True)
    resolution = models.TextField(max_length=2000, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "priority", "created_at"])]
