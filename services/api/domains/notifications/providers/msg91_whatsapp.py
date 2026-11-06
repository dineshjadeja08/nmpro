import re

import requests
from django.conf import settings


class DeliveryUnavailable(Exception):
    pass


class MSG91WhatsAppProvider:
    endpoint = "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk"

    def send_template(self, phone_e164, template_name, booking_reference):
        if (not re.fullmatch(r"\+91[6-9]\d{9}", phone_e164)
                or not re.fullmatch(r"[a-z0-9_]{1,100}", template_name)
                or len(booking_reference) > 32):
            raise DeliveryUnavailable("Invalid template parameters")
        payload = {
            "integrated_number": settings.WHATSAPP_INTEGRATED_NUMBER,
            "content_type": "template",
            "payload": {"messaging_product": "whatsapp", "type": "template",
                        "template": {"name": template_name,
                                     "language": {"code": settings.WHATSAPP_LANGUAGE_CODE,
                                                  "policy": "deterministic"},
                                     "to_and_components": [{"to": [phone_e164.lstrip("+")],
                                                            "components": {"body_1": {"type": "text",
                                                                                      "value": booking_reference}}}]}}}
        try:
            response = requests.post(self.endpoint, json=payload,
                                     headers={"authkey": settings.MSG91_AUTH_KEY,
                                              "accept": "application/json"}, timeout=8)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise DeliveryUnavailable("WhatsApp provider outcome is uncertain") from exc
        if not isinstance(data, dict) or data.get("status") != "success" or not data.get("request_id"):
            raise DeliveryUnavailable("WhatsApp provider rejected the request")
        return str(data["request_id"])
