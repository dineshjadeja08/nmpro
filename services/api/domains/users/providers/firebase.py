import base64
import binascii
import json
import logging
import requests
from django.conf import settings

logger = logging.getLogger("nammapros.auth")


class FirebaseUnavailable(Exception):
    pass


class FirebaseTokenInvalid(Exception):
    pass


class FirebaseAuthProvider:
    def __init__(self):
        self.project_id = getattr(settings, "FIREBASE_PROJECT_ID", "")
        self.web_api_key = getattr(settings, "FIREBASE_WEB_API_KEY", "")

    def verify_token(self, id_token: str) -> dict:
        if not id_token or not isinstance(id_token, str):
            raise FirebaseTokenInvalid("Missing ID token")

        # Mock tokens are strictly local/test credentials.
        environment = getattr(settings, "ENVIRONMENT", "")
        if environment in {"development", "test"} and (
            id_token.startswith("dev-token:") or id_token.startswith("mock:") or id_token.startswith("dev_")
        ):
            parts = id_token.split(":")
            phone = parts[1] if len(parts) > 1 else "+919876543210"
            return {"uid": f"dev_{phone}", "phone_number": phone}

        # In testing without live credentials
        if not self.web_api_key and environment in {"development", "test"}:
            # If payload is a JWT, decode payload safely for test/staging inspection
            try:
                segments = id_token.split(".")
                if len(segments) == 3:
                    padded = segments[1] + "=" * ((4 - len(segments[1]) % 4) % 4)
                    payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
                    phone = payload.get("phone_number") or payload.get("sub")
                    if phone:
                        return {"uid": payload.get("sub", f"usr_{phone}"), "phone_number": phone}
            except Exception:
                pass

        # Live verification via Firebase REST API
        if self.web_api_key:
            url = f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={self.web_api_key}"
            try:
                resp = requests.post(url, json={"idToken": id_token}, timeout=10)
                if resp.status_code == 400:
                    raise FirebaseTokenInvalid("Invalid or expired Firebase ID token")
                resp.raise_for_status()
                data = resp.json()
                users = data.get("users", [])
                if not users:
                    raise FirebaseTokenInvalid("Firebase user not found")
                if self.project_id:
                    try:
                        encoded_claims = id_token.split(".")[1]
                        padded_claims = encoded_claims + "=" * (-len(encoded_claims) % 4)
                        token_claims = json.loads(base64.urlsafe_b64decode(padded_claims))
                    except (IndexError, ValueError, TypeError, binascii.Error) as exc:
                        raise FirebaseTokenInvalid("Invalid Firebase ID token") from exc
                    if (not isinstance(token_claims, dict) or
                            token_claims.get("aud") != self.project_id or
                            token_claims.get("iss") != f"https://securetoken.google.com/{self.project_id}"):
                        raise FirebaseTokenInvalid("Firebase token belongs to another project")
                user = users[0]
                phone = user.get("phoneNumber")
                if not phone:
                    raise FirebaseTokenInvalid("Phone number not associated with token")
                return {"uid": user.get("localId"), "phone_number": phone}
            except requests.RequestException as exc:
                logger.error("Firebase Auth service error: %s", exc)
                raise FirebaseUnavailable("Firebase Authentication service unavailable") from exc

        # If project_id is configured without web_api_key, decode unverified in dev or raise error
        if getattr(settings, "ENVIRONMENT", "") == "development":
            try:
                segments = id_token.split(".")
                if len(segments) == 3:
                    padded = segments[1] + "=" * ((4 - len(segments[1]) % 4) % 4)
                    payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
                    phone = payload.get("phone_number")
                    if phone:
                        return {"uid": payload.get("sub"), "phone_number": phone}
            except Exception:
                pass

        raise FirebaseUnavailable("Firebase credentials are not configured")
