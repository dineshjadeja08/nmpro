"""Cloudinary file storage: request signing, and private files saved and read back through the API."""
import pytest
from django.core.files.base import ContentFile

from common import cloudinary_storage
from common.cloudinary_storage import CloudinaryPrivateStorage, sign


def test_signature_matches_cloudinary_documented_example():
    # Example from Cloudinary's "Generating authentication signatures" documentation.
    params = {"eager": "w_400,h_300,c_pad|w_260,h_200,c_crop", "public_id": "sample_image", "timestamp": 1315060510}
    assert sign(params, "abcd") == "bfd09f95f331f558cbd1320e67aa8d488770583e"


class FakeResponse:
    def __init__(self, status=200, content=b"", payload=None):
        self.status_code, self.content, self._payload = status, content, payload or {}

    def json(self):
        return self._payload


@pytest.fixture
def fake_cloudinary(settings, monkeypatch):
    settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET = "demo", "123", "shh"
    settings.CLOUDINARY_FOLDER = "nammapros"
    stored, calls = {}, []

    def post(url, data=None, files=None, timeout=None):
        calls.append(("POST", url, dict(data)))
        assert data["signature"] == sign({k: v for k, v in data.items() if k not in ("api_key", "signature")}, "shh")
        if url.endswith("/raw/upload"):
            stored[data["public_id"]] = files["file"][1].read()
            return FakeResponse(payload={"public_id": data["public_id"]})
        if url.endswith("/raw/destroy"):
            stored.pop(data["public_id"], None)
            return FakeResponse(payload={"result": "ok"})
        return FakeResponse(404)

    def get(url, params=None, timeout=None):
        calls.append(("GET", url, dict(params)))
        assert params["signature"] == sign({k: v for k, v in params.items() if k not in ("api_key", "signature")}, "shh")
        if params["public_id"] not in stored:
            return FakeResponse(404)
        return FakeResponse(content=stored[params["public_id"]])

    monkeypatch.setattr(cloudinary_storage.requests, "post", post)
    monkeypatch.setattr(cloudinary_storage.requests, "get", get)
    return stored, calls


def test_private_file_round_trip(fake_cloudinary):
    stored, calls = fake_cloudinary
    storage = CloudinaryPrivateStorage()
    name = storage.save("private/technicians/2026/11/aadhaar.jpg", ContentFile(b"\xff\xd8\xffKYC", name="aadhaar.jpg"))
    assert name.startswith("private/technicians/2026/11/aadhaar-") and name.endswith(".jpg")
    public_id = f"nammapros/private/{name}"
    assert stored[public_id] == b"\xff\xd8\xffKYC"
    upload = calls[0]
    assert upload[1] == "https://api.cloudinary.com/v1_1/demo/raw/upload"
    assert upload[2]["type"] == "authenticated" and upload[2]["overwrite"] == "false"

    with storage.open(name, "rb") as handle:
        assert handle.read() == b"\xff\xd8\xffKYC"
    assert storage.size(name) == 6
    with pytest.raises(ValueError):
        storage.url(name)  # private files are never linked publicly

    storage.delete(name)
    with pytest.raises(FileNotFoundError):
        storage.open(name, "rb")


def test_two_files_with_the_same_name_do_not_overwrite(fake_cloudinary):
    stored, _ = fake_cloudinary
    storage = CloudinaryPrivateStorage()
    a = storage.save("private/invoices/inv.pdf", ContentFile(b"one"))
    b = storage.save("private/invoices/inv.pdf", ContentFile(b"two"))
    assert a != b and len(stored) == 2


def test_catalogue_images_go_under_the_nammapros_folder(settings, monkeypatch):
    from domains.catalog.providers import cloudinary as provider_mod

    settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET = "demo", "123", "shh"
    settings.CLOUDINARY_FOLDER = "nammapros"
    seen = {}

    class Ok:
        def raise_for_status(self):
            return None

        def json(self):
            return {"secure_url": "https://res.cloudinary.com/demo/image/upload/v1/nammapros/catalog/services/x.jpg",
                    "public_id": "nammapros/catalog/services/x"}

    def post(url, data=None, files=None, timeout=None):
        seen.update(data)
        return Ok()

    monkeypatch.setattr(provider_mod.requests, "post", post)
    result = provider_mod.CloudinaryProvider().upload_image(ContentFile(b"img"), filename="x.jpg")
    assert seen["folder"] == "nammapros/catalog/services"
    assert result["secure_url"].startswith("https://res.cloudinary.com/demo/")
