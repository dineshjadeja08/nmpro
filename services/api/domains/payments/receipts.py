"""Payment receipts (not tax invoices).

NammaPros receives only the online advance. The balance is paid by the customer directly to the
service professional, so the receipt shows it as received by the professional, not by NammaPros.
"""
import io

from django.conf import settings
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from domains.bookings.models import Booking

from .models import Payment


def receipt_lines(booking):
    payments = list(Payment.objects.filter(booking=booking, status="CAPTURED").order_by("verified_at", "created_at"))
    assignment = getattr(booking, "technician_assignment", None)
    pro = assignment.technician.display_name if assignment else "the service professional"
    lines = []
    for p in payments:
        when = timezone.localtime(p.verified_at or p.created_at).strftime("%d %b %Y")
        if p.payment_method == "ONLINE":
            lines.append((f"{when}  Advance paid online - received by NammaPros (ref {p.provider_payment_id[-10:]})",
                          p.amount_paise))
        else:
            label = "Approved extra work" if p.payment_type == "EXTRA_WORK" else "Service balance"
            lines.append((f"{when}  {label} - paid by {p.payment_method} directly to {pro}", p.amount_paise))
    return payments, lines, pro


def receipt_available(booking):
    return Payment.objects.filter(booking=booking, status="CAPTURED").exists()


def build_receipt_pdf(booking):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    payments, lines, pro = receipt_lines(booking)
    if not payments:
        raise Http404
    buf = io.BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 56

    def text(value, size=10, bold=False, right=None):
        nonlocal y
        pdf.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        pdf.drawString(48, y, value)
        if right is not None:
            pdf.drawRightString(width - 48, y, right)
        y -= size + 8

    rupees = lambda p: f"Rs {p / 100:,.2f}"  # noqa: E731
    text("PAYMENT RECEIPT", 16, True)
    text("This is a payment receipt, not a tax invoice.", 9)
    y -= 6
    text(f"Booking: {booking.reference}")
    text(f"Service: {booking.service.name} - {booking.package.name}")
    if booking.slot_id:
        text(f"Visit: {timezone.localtime(booking.slot.start_at).strftime('%d %b %Y, %I:%M %p')}")
    if booking.address_id:
        text(f"Customer area: {booking.address.locality}, {booking.address.city}")
    text(f"Service professional: {pro}")
    y -= 8
    pdf.line(48, y + 8, width - 48, y + 8)
    snapshot = getattr(booking, "price_snapshot", None)
    if snapshot is not None:
        discount = -sum(int(line.get("amount_paise", 0)) for line in (snapshot.lines or [])
                        if isinstance(line, dict) and line.get("code") == "DISCOUNT")
        text("Booked price", 10, False, rupees(snapshot.total_paise + discount))
        if discount:
            text("Referral discount (funded by NammaPros)", 10, False, f"- {rupees(discount)}")
    y -= 4
    text("Payments received", 11, True)
    for label, amount in lines:
        text(label[:95], 9, False, rupees(amount))
    total = sum(p.amount_paise for p in payments)
    y -= 4
    text("Total paid", 11, True, rupees(total))
    y -= 12
    note = ("NammaPros is a booking platform. The service is carried out by the independent professional named above, "
            "who receives the balance directly. For questions about this visit, use 'Report a problem' in your booking.")
    pdf.setFont("Helvetica", 8)
    for i in range(0, len(note), 110):
        pdf.drawString(48, y, note[i:i + 110])
        y -= 12
    legal = getattr(settings, "LEGAL_NAME", "") or "NammaPros"
    pdf.drawString(48, 48, f"{legal} - generated {timezone.localtime().strftime('%d %b %Y %H:%M')}")
    pdf.showPage()
    pdf.save()
    buf.seek(0)
    return buf


def _response(booking):
    return FileResponse(build_receipt_pdf(booking), as_attachment=True,
                        filename=f"{booking.reference}-receipt.pdf", content_type="application/pdf")


class CustomerReceiptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, booking_id):
        booking = get_object_or_404(Booking.objects.select_related("service", "package", "slot", "address"),
                                    id=booking_id, user=request.user)
        return _response(booking)


class TechnicianReceiptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, job_id):
        from domains.technicians.models import JobAssignment
        from domains.technicians.services import profile_for

        profile = profile_for(request.user, verified=True)
        job = get_object_or_404(JobAssignment.objects.select_related("booking"), id=job_id, technician=profile)
        return _response(job.booking)
