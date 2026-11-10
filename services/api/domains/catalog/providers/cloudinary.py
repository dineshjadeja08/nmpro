import hashlib
import time
import requests
from django.conf import settings


class CloudinaryUnavailable(Exception):
    pass


class CloudinaryProvider:
    is_configured = False

    def __init__(self):
        self.cloud_name = getattr(settings, "CLOUDINARY_CLOUD_NAME", "")
        self.api_key = getattr(settings, "CLOUDINARY_API_KEY", "")
        self.api_secret = getattr(settings, "CLOUDINARY_API_SECRET", "")
        if self.cloud_name and self.api_key and self.api_secret:
            self.is_configured = True

    def upload_image(self, file_obj, filename=None, folder="catalog/services"):
        if not self.is_configured:
            return None
        timestamp = int(time.time())
        to_sign = f"folder={folder}&timestamp={timestamp}{self.api_secret}"
        signature = hashlib.sha1(to_sign.encode("utf-8")).hexdigest()

        file_obj.seek(0)
        files = {"file": (filename or "upload.jpg", file_obj)}
        data = {
            "api_key": self.api_key,
            "timestamp": timestamp,
            "folder": folder,
            "signature": signature,
        }
        url = f"https://api.cloudinary.com/v1_1/{self.cloud_name}/image/upload"
        try:
            response = requests.post(url, data=data, files=files, timeout=15)
            response.raise_for_status()
            res_data = response.json()
            return {
                "secure_url": res_data.get("secure_url") or res_data.get("url"),
                "public_id": res_data.get("public_id", ""),
            }
        except Exception as exc:
            raise CloudinaryUnavailable(f"Cloudinary upload failed: {exc}") from exc
