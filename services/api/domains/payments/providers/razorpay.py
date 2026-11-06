import razorpay
from django.conf import settings
from rest_framework.exceptions import APIException


class PaymentUnavailable(APIException):
    status_code = 503
    default_detail = "Online payment is temporarily unavailable. Please try later."
    default_code = "PAYMENT_UNAVAILABLE"


class RazorpayProvider:
    def __init__(self):
        if not settings.RAZORPAY_ENABLED:
            raise PaymentUnavailable()
        self.client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

    def create_order(self, amount_paise: int, receipt: str):
        return self.client.order.create(data={"amount": amount_paise, "currency": "INR", "receipt": receipt,
                                              "partial_payment": False})

    def fetch_order(self, order_id: str):
        return self.client.order.fetch(order_id)

    def fetch_payment(self, payment_id: str):
        return self.client.payment.fetch(payment_id)

    def verify_checkout(self, order_id: str, payment_id: str, signature: str):
        try:
            return bool(self.client.utility.verify_payment_signature({"razorpay_order_id": order_id,
                                                                       "razorpay_payment_id": payment_id,
                                                                       "razorpay_signature": signature}))
        except razorpay.errors.SignatureVerificationError:
            return False

    def verify_webhook(self, raw_body: bytes, signature: str):
        try:
            return bool(self.client.utility.verify_webhook_signature(raw_body.decode("utf-8"), signature,
                                                                      settings.RAZORPAY_WEBHOOK_SECRET))
        except (razorpay.errors.SignatureVerificationError, UnicodeDecodeError):
            return False

    def create_refund(self, payment_id: str, amount_paise: int, receipt: str):
        return self.client.payment.refund(payment_id, {"amount": amount_paise, "speed": "normal",
                                                       "receipt": receipt})

    def fetch_refund(self, refund_id: str):
        return self.client.refund.fetch(refund_id)
