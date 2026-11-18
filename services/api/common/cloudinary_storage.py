"""Cloudinary as the API's file store.

* Public catalogue images (service pictures, category banners, brand logos) are uploaded by
  ``domains.catalog.providers.cloudinary`` and shown straight from Cloudinary's CDN.
* Everything saved through Django file fields (KYC documents, invoices, review photos, ...) goes through
  ``CloudinaryPrivateStorage``: stored as *authenticated* raw files that cannot be opened without a signature.
  The API reads them back server-side and serves them only through its own signed-in views, exactly as it did
  with the private Google Cloud bucket.

Only the standard library and ``requests`` are used, so no extra package is needed.
"""
from __future__ import annotations

import hashlib
import secrets
import time
from pathlib import PurePosixPath

import requests
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible

API = "https://api.cloudinary.com/v1_1"
TIMEOUT = 20


class CloudinaryError(Exception):
    pass


def credentials():
    return settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET


def sign(params: dict, api_secret: str) -> str:
    """Cloudinary request signature: SHA-1 of the sorted parameters followed by the API secret."""
    payload = "&".join(f"{k}={params[k]}" for k in sorted(params) if params[k] not in (None, ""))
    return hashlib.sha1(f"{payload}{api_secret}".encode("utf-8")).hexdigest()


def folder() -> str:
    return (getattr(settings, "CLOUDINARY_FOLDER", "") or "nammapros").strip("/")


@deconstructible
class CloudinaryPrivateStorage(Storage):
    """Private files on Cloudinary (delivery type "authenticated", resource type "raw")."""

    resource_type = "raw"
    delivery_type = "authenticated"

    def _public_id(self, name: str) -> str:
        return f"{folder()}/private/{name.lstrip('/')}"

    def _signed(self, params: dict) -> dict:
        _, api_key, api_secret = credentials()
        params = {**params, "timestamp": int(time.time())}
        return {**params, "api_key": api_key, "signature": sign(params, api_secret)}

    def get_available_name(self, name, max_length=None):
        # A random suffix keeps names unique without asking Cloudinary whether a file exists.
        path = PurePosixPath(name)
        candidate = str(path.with_name(f"{path.stem}-{secrets.token_hex(6)}{path.suffix}"))
        if max_length and len(candidate) > max_length:
            keep = max(1, len(path.stem) - (len(candidate) - max_length))
            candidate = str(path.with_name(f"{path.stem[:keep]}-{secrets.token_hex(6)}{path.suffix}"))
        return candidate

    def _save(self, name, content):
        cloud, _, _ = credentials()
        content.seek(0)
        data = self._signed({"public_id": self._public_id(name), "type": self.delivery_type, "overwrite": "false"})
        try:
            response = requests.post(f"{API}/{cloud}/{self.resource_type}/upload", data=data,
                                     files={"file": (PurePosixPath(name).name, content)}, timeout=TIMEOUT)
        except requests.RequestException as exc:
            raise CloudinaryError(f"Upload to Cloudinary failed: {exc}") from exc
        if response.status_code >= 400:
            raise CloudinaryError(f"Upload to Cloudinary failed ({response.status_code}).")
        return name

    def _download(self, name) -> bytes:
        cloud, _, _ = credentials()
        params = self._signed({"public_id": self._public_id(name), "type": self.delivery_type,
                               "expires_at": int(time.time()) + 120})
        try:
            response = requests.get(f"{API}/{cloud}/{self.resource_type}/download", params=params, timeout=TIMEOUT)
        except requests.RequestException as exc:
            raise CloudinaryError(f"Download from Cloudinary failed: {exc}") from exc
        if response.status_code == 404:
            raise FileNotFoundError(name)
        if response.status_code >= 400:
            raise CloudinaryError(f"Download from Cloudinary failed ({response.status_code}).")
        return response.content

    def _open(self, name, mode="rb"):
        if mode != "rb":
            raise ValueError("Private files are read-only outside the storage save API.")
        return ContentFile(self._download(name), name=name)

    def exists(self, name):
        # Names are made unique on save (get_available_name), so nothing is ever overwritten.
        return False

    def delete(self, name):
        cloud, _, _ = credentials()
        data = self._signed({"public_id": self._public_id(name), "type": self.delivery_type, "invalidate": "true"})
        try:
            requests.post(f"{API}/{cloud}/{self.resource_type}/destroy", data=data, timeout=TIMEOUT)
        except requests.RequestException as exc:
            raise CloudinaryError(f"Delete on Cloudinary failed: {exc}") from exc

    def size(self, name):
        return len(self._download(name))

    def url(self, name):
        raise ValueError("Private files have no public URL; serve them through an authenticated view.")
