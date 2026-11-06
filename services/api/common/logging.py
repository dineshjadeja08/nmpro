import json
import logging
from datetime import datetime, timezone

from .middleware import request_id_context


class JsonFormatter(logging.Formatter):
    def format(self, record):
        data = {"timestamp": datetime.now(timezone.utc).isoformat(), "severity": record.levelname,
                "logger": record.name, "message": record.getMessage(),
                "request_id": request_id_context.get()}
        if record.exc_info and record.exc_info[0]:
            data["error_type"] = record.exc_info[0].__name__
        for key in ("http_path", "http_method", "http_status", "duration_ms", "job_name", "job_result", "count"):
            if hasattr(record, key):
                data[key] = getattr(record, key)
        return json.dumps(data, ensure_ascii=False)
