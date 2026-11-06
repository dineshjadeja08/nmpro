import requests
from django.conf import settings


class MSG91Unavailable(Exception):
    pass


class MSG91OTPProvider:
    base_url = "https://control.msg91.com/api/v5/otp"

    def _headers(self):
        return {"authkey": settings.MSG91_AUTH_KEY, "accept": "application/json"}

    def send(self, phone_e164):
        try:
            response = requests.post(self.base_url,
                                     params={"template_id": settings.MSG91_OTP_TEMPLATE_ID,
                                             "mobile": phone_e164.lstrip("+")},
                                     headers=self._headers(), json={}, timeout=5)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise MSG91Unavailable() from exc
        if not isinstance(data, dict) or data.get("type") != "success":
            raise MSG91Unavailable()

    def verify(self, phone_e164, code):
        try:
            response = requests.get(f"{self.base_url}/verify",
                                    params={"mobile": phone_e164.lstrip("+"), "otp": code},
                                    headers=self._headers(), timeout=5)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise MSG91Unavailable() from exc
        if not isinstance(data, dict) or data.get("type") not in ("success", "error"):
            raise MSG91Unavailable()
        return data["type"] == "success"
