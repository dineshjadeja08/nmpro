from io import BytesIO

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


def render_invoice_pdf(invoice):
    """Render an already issued invoice. Issuance policy lives outside this function."""
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    burgundy = HexColor("#800020")
    black = HexColor("#111111")
    pdf.setFillColor(burgundy)
    pdf.rect(0, height - 112, width, 112, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#FFFFFF"))
    pdf.setFont("Helvetica-Bold", 22)
    pdf.drawString(48, height - 68, "NammaPros")
    pdf.setFont("Helvetica", 10)
    pdf.drawRightString(width - 48, height - 68, "TAX INVOICE")
    pdf.setFillColor(black)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(48, height - 154, str(invoice.seller_name)[:80])
    pdf.setFont("Helvetica", 10)
    y = height - 173
    for line in str(invoice.seller_address).splitlines()[:4]:
        pdf.drawString(48, y, line[:95])
        y -= 14
    if invoice.tax_registration:
        pdf.drawString(48, y - 3, f"Tax registration: {invoice.tax_registration[:40]}")
    pdf.drawRightString(width - 48, height - 155, f"Invoice: {invoice.invoice_number[:40]}")
    pdf.drawRightString(width - 48, height - 173, f"Issued: {invoice.issue_date.isoformat()}")
    booking = invoice.booking
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(48, height - 268, "Bill to")
    pdf.drawString(315, height - 268, "Service details")
    pdf.setFont("Helvetica", 10)
    pdf.drawString(48, height - 286, str(booking.user.get_full_name() or booking.user.username)[:50])
    pdf.drawString(48, height - 303, str(booking.address.line_1)[:75])
    pdf.drawString(48, height - 320, f"{booking.address.city} {booking.address.postal_code}"[:75])
    pdf.drawString(315, height - 286, f"Booking: {booking.reference}"[:48])
    pdf.drawString(315, height - 303, f"Service: {booking.service.name}"[:48])
    pdf.setStrokeColor(burgundy)
    pdf.line(48, height - 356, width - 48, height - 356)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(48, height - 375, "Description")
    pdf.drawRightString(width - 48, height - 375, "Amount (INR)")
    pdf.setFont("Helvetica", 10)
    y = height - 399
    for line in booking.price_snapshot.lines[:15]:
        if line.get("amount_paise", 0) <= 0:
            continue
        pdf.drawString(48, y, str(line.get("code", "Service"))[:60].replace("_", " "))
        pdf.drawRightString(width - 48, y, f"{line['amount_paise'] / 100:,.2f}")
        y -= 22
    pdf.line(48, y - 5, width - 48, y - 5)
    y -= 26
    pdf.drawString(48, y, "Subtotal")
    pdf.drawRightString(width - 48, y, f"{invoice.subtotal_paise / 100:,.2f}")
    y -= 20
    pdf.drawString(48, y, "Tax")
    pdf.drawRightString(width - 48, y, f"{invoice.tax_paise / 100:,.2f}")
    y -= 22
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(48, y, "Total")
    pdf.drawRightString(width - 48, y, f"INR {invoice.total_paise / 100:,.2f}")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(48, 56, "NammaPros | Your Home. Our Expertise.")
    pdf.showPage()
    pdf.save()
    return output.getvalue()
