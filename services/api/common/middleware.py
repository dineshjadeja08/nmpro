import logging
import re
import time
from contextvars import ContextVar
from uuid import uuid4

request_id_context = ContextVar("request_id", default="")
log = logging.getLogger("nammapros.request")


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied = request.headers.get("X-Request-ID", "")
        request_id = supplied if re.fullmatch(r"[A-Za-z0-9_-]{8,64}", supplied) else uuid4().hex
        request.request_id = request_id
        token = request_id_context.set(request_id)
        started = time.monotonic()
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request_id
            log.info("http_request", extra={"http_path": request.path, "http_method": request.method,
                     "http_status": response.status_code, "duration_ms": round((time.monotonic() - started) * 1000)})
            return response
        finally:
            request_id_context.reset(token)
