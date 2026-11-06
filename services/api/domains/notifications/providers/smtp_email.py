from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import EmailMessage
from django.core.validators import validate_email

from .msg91_whatsapp import DeliveryUnavailable

SUBJECTS = {
    "BOOKING_CONFIRMED": "Your NammaPros booking is confirmed",
    "BOOKING_CANCELLED": "Your NammaPros booking was cancelled",
    "BOOKING_RESCHEDULED": "Your NammaPros booking was rescheduled",
    "BOOKING_PAYMENT_PENDING": "Payment needed for your NammaPros booking",
    "BOOKING_PAYMENT_EXPIRED": "Your NammaPros payment window expired",
    "PAYMENT_SUCCESS": "Your NammaPros payment was verified",
    "PAYMENT_FAILED": "Your NammaPros payment attempt failed",
    "REFUND_INITIATED": "Your NammaPros refund is processing",
    "REFUND_COMPLETED": "Your NammaPros refund was processed",
    "TECHNICIAN_APPLICATION_SUBMITTED": "Technician application submitted",
    "TECHNICIAN_VERIFIED": "Your NammaPros technician account is verified",
    "TECHNICIAN_REJECTED": "Your NammaPros technician application update",
    "TECHNICIAN_SUSPENDED": "Your NammaPros technician account update",
    "NEW_JOB_OFFER": "New NammaPros job offer",
    "TECHNICIAN_ASSIGNED": "A technician is assigned to your NammaPros booking",
    "QUOTATION_APPROVAL_REQUIRED": "Approve your NammaPros service quotation",
    "QUOTATION_APPROVED": "Your NammaPros quotation was approved",
    "QUOTATION_REJECTED": "Your NammaPros quotation was declined",
    "JOB_COMPLETED": "Your NammaPros service was completed",
}


class SMTPEmailProvider:
    def send_template(self, email, event, booking_reference):
        try:
            validate_email(email)
        except ValidationError as exc:
            raise DeliveryUnavailable("Recipient email is unavailable") from exc
        if event not in SUBJECTS or len(booking_reference) > 32:
            raise DeliveryUnavailable("Email template is unavailable")
        message = EmailMessage(
            subject=SUBJECTS[event],
            body=f"NammaPros booking reference: {booking_reference}\n\nSign in to your account for the latest status.",
            from_email=settings.EMAIL_FROM_ADDRESS, to=[email],
        )
        try:
            count = message.send(fail_silently=False)
        except Exception as exc:
            raise DeliveryUnavailable("Email provider outcome is uncertain") from exc
        if count != 1:
            raise DeliveryUnavailable("Email provider did not accept the message")
        return "SMTP_ACCEPTED"
