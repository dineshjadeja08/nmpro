from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from google.cloud import storage


class PrivateGCSStorage(Storage):
    """Private media. Access to files stays behind authenticated Django views."""

    def __init__(self):
        self.bucket = storage.Client().bucket(settings.PRIVATE_MEDIA_BUCKET)

    def _open(self, name, mode="rb"):
        if mode != "rb":
            raise ValueError("Private media is read-only outside the storage save API.")
        return ContentFile(self.bucket.blob(name).download_as_bytes(), name=name)

    def _save(self, name, content):
        blob = self.bucket.blob(name)
        content.seek(0)
        blob.upload_from_file(content, rewind=True, content_type=getattr(content, "content_type", None))
        return name

    def exists(self, name):
        return self.bucket.blob(name).exists()

    def delete(self, name):
        self.bucket.blob(name).delete()

    def size(self, name):
        blob = self.bucket.get_blob(name)
        if blob is None:
            raise FileNotFoundError(name)
        return blob.size

    def url(self, name):
        raise ValueError("Private media has no unrestricted URL.")

    def signed_download_url(self, name, seconds=300):
        if not 1 <= seconds <= 600 or not self.exists(name):
            raise ValueError("Invalid private file or expiry.")
        return self.bucket.blob(name).generate_signed_url(
            version="v4", expiration=timedelta(seconds=seconds), method="GET")
