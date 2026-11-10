import csv

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from domains.notifications.models import Notification

from .models import LeadActivity
from .services import log
from .views_leads import lead_access, lead_data, scoped_leads


class LeadExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        contact = lead_access(request.user)
        qs = scoped_leads(request.user).order_by("-created_at")
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="leads-export.csv"'
        writer = csv.writer(response)
        writer.writerow(["lead_reference", "customer_name", "mobile_number", "service", "city", "area", "status", "priority", "created_at"])
        for lead in qs[:2000]:
            writer.writerow([
                lead.lead_reference,
                lead.customer_name,
                lead.mobile_number if contact else f"******{lead.mobile_number[-4:]}",
                lead.service.name,
                lead.city,
                lead.area,
                lead.status,
                lead.priority,
                lead.created_at.isoformat(),
            ])
        return response


class LeadActivitiesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, lead_id):
        lead_access(request.user)
        lead = get_object_or_404(scoped_leads(request.user), id=lead_id)
        rows = LeadActivity.objects.filter(lead=lead).select_related("actor").order_by("-created_at")
        return Response({"results": [
            {"id": str(a.id), "kind": a.kind, "detail": a.detail,
             "actor": a.actor.phone_e164 if a.actor else None, "created_at": a.created_at}
            for a in rows[:100]
        ]})


class LeadScheduleView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lead_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user).select_for_update(), id=lead_id)
        preferred_date = serializers.DateField().run_validation(request.data.get("preferred_date"))
        preferred_time = serializers.TimeField(required=False, allow_null=True).run_validation(request.data.get("preferred_time"))
        lead.preferred_date = preferred_date
        lead.preferred_time = preferred_time
        lead.last_activity_at = timezone.now()
        lead.save(update_fields=["preferred_date", "preferred_time", "last_activity_at", "updated_at"])
        LeadActivity.objects.create(lead=lead, actor=request.user, kind="SCHEDULED",
            detail={"preferred_date": preferred_date.isoformat(),
                    "preferred_time": preferred_time.isoformat() if preferred_time else None})
        log(request.user, "LEAD_SCHEDULED", "Lead", lead.id)
        return Response(lead_data(lead, True, True))


class LeadReminderView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lead_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user).select_for_update(), id=lead_id)
        channel = serializers.ChoiceField(choices=["SMS", "WHATSAPP", "EMAIL"]).run_validation(request.data.get("channel", "SMS"))
        note = serializers.CharField(max_length=500, allow_blank=True, required=False).run_validation(request.data.get("note", ""))
        lead.last_activity_at = timezone.now()
        lead.save(update_fields=["last_activity_at", "updated_at"])
        LeadActivity.objects.create(lead=lead, actor=request.user, kind="REMINDER_SENT",
            detail={"channel": channel, "note": note})
        log(request.user, "LEAD_REMINDER_SENT", "Lead", lead.id, {"channel": channel})
        return Response({"id": str(lead.id), "channel": channel, "status": "RECORDED"})


class LeadPaymentLinkView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lead_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user).select_for_update(), id=lead_id)
        channel = serializers.ChoiceField(choices=["SMS", "WHATSAPP"]).run_validation(request.data.get("channel", "SMS"))
        payment_scope = serializers.ChoiceField(choices=["FULL", "ADVANCE"]).run_validation(request.data.get("payment_scope", "FULL"))
        base_total = lead.quoted_amount_paise or lead.service.starting_price_paise or 100
        default_amount = (lead.advance_amount_paise or round(base_total * 0.25)) if payment_scope == "ADVANCE" else base_total
        amount_paise = serializers.IntegerField(min_value=1, required=False).run_validation(
            request.data.get("amount_paise") or default_amount or 100
        )
        if payment_scope == "ADVANCE":
            lead.advance_amount_paise = amount_paise
        lead.payment_status = "LINK_SENT" if settings.RAZORPAY_ENABLED else "PENDING"
        lead.payment_link_url = f"https://rzp.io/i/{lead.id.hex[:10]}" if settings.RAZORPAY_ENABLED else ""
        lead.last_activity_at = timezone.now()
        lead.save(update_fields=["advance_amount_paise", "payment_status", "payment_link_url", "last_activity_at", "updated_at"])
        LeadActivity.objects.create(lead=lead, actor=request.user, kind="PAYMENT_LINK_ATTEMPTED",
            detail={"channel": channel, "payment_scope": payment_scope, "amount_paise": amount_paise, "payments_enabled": settings.RAZORPAY_ENABLED})
        log(request.user, "LEAD_PAYMENT_LINK_SENT", "Lead", lead.id, {"channel": channel, "payment_scope": payment_scope})
        return Response({
            "id": str(lead.id),
            "payment_status": lead.payment_status,
            "payment_link_url": lead.payment_link_url,
            "payment_delivery_status": "DISPATCHED" if settings.RAZORPAY_ENABLED else "BLOCKED_CONFIGURATION",
        })


class LeadRecordContactView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lead_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user).select_for_update(), id=lead_id)
        channel = serializers.ChoiceField(choices=["PHONE", "WHATSAPP", "SMS", "EMAIL"]).run_validation(request.data.get("channel", "PHONE"))
        outcome = serializers.CharField(max_length=200, allow_blank=True, required=False).run_validation(request.data.get("outcome", ""))
        notes = serializers.CharField(max_length=2000, allow_blank=True, required=False).run_validation(request.data.get("notes", ""))
        now = timezone.now()
        if lead.status == "NEW":
            lead.status = "CONTACTED"
        lead.last_contacted_at = now
        lead.last_activity_at = now
        lead.save(update_fields=["status", "last_contacted_at", "last_activity_at", "updated_at"])
        LeadActivity.objects.create(lead=lead, actor=request.user, kind="CONTACT_RECORDED",
            detail={"channel": channel, "outcome": outcome, "notes": notes})
        log(request.user, "LEAD_CONTACT_RECORDED", "Lead", lead.id, {"channel": channel})
        return Response(lead_data(lead, True, True))


class LeadRecordManualPaymentView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, lead_id):
        lead_access(request.user, edit=True)
        lead = get_object_or_404(scoped_leads(request.user).select_for_update(), id=lead_id)
        amount_paise = serializers.IntegerField(min_value=1).run_validation(request.data.get("amount_paise"))
        method = serializers.ChoiceField(choices=["CASH", "UPI", "BANK_TRANSFER", "OTHER"]).run_validation(request.data.get("method", "UPI"))
        reference = serializers.CharField(max_length=120, allow_blank=True, required=False).run_validation(request.data.get("reference", ""))
        lead.manual_paid_paise += amount_paise
        lead.payment_status = "PAID"
        lead.last_activity_at = timezone.now()
        lead.save(update_fields=["manual_paid_paise", "payment_status", "last_activity_at", "updated_at"])
        LeadActivity.objects.create(lead=lead, actor=request.user, kind="MANUAL_PAYMENT_RECORDED",
            detail={"amount_paise": amount_paise, "method": method, "reference": reference})
        log(request.user, "LEAD_MANUAL_PAYMENT_RECORDED", "Lead", lead.id, {"amount_paise": amount_paise, "method": method})
        return Response({
            "id": str(lead.id),
            "payment_status": lead.payment_status,
            "manual_paid_paise": lead.manual_paid_paise,
        })
