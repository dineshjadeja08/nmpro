import re

import requests
from django.conf import settings

from .msg91_whatsapp import DeliveryUnavailable


class MSG91SMSProvider:
    endpoint = "https://control.msg91.com/api/v5/flow"

    def send_template(self, phone_e164, template_id, values):
        """`values` is the ordered list of flow variables (a single string is accepted too)."""
        from ..messages import sms_variable_names

        values = [values] if isinstance(values, str) else list(values)
        if (not re.fullmatch(r"\+91[6-9]\d{9}", phone_e164)
                or not isinstance(template_id, str) or not template_id
                or not values or len(values) > 10
                or any(not isinstance(v, str) or len(v) > 60 for v in values)):
            raise DeliveryUnavailable("Invalid SMS template parameters")
        recipient = {"mobiles": phone_e164.lstrip("+")}
        recipient.update(dict(zip(sms_variable_names(len(values)), values)))
        payload = {"template_id": template_id, "short_url": "0", "recipients": [recipient]}
        try:
            response = requests.post(self.endpoint, json=payload,
                                     headers={"authkey": settings.MSG91_AUTH_KEY,
                                              "accept": "application/json"}, timeout=8)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise DeliveryUnavailable("SMS provider outcome is uncertain") from exc
        if not isinstance(data, dict) or data.get("type") != "success" or not data.get("message"):
            raise DeliveryUnavailable("SMS provider rejected the request")
        return str(data["message"])
