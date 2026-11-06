from django.http import JsonResponse
from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    detail = response.data
    fields = {}
    if isinstance(detail, dict):
        for key, value in detail.items():
            if key != "detail":
                fields[key] = [str(item) for item in value] if isinstance(value, list) else [str(value)]
        message = str(detail.get("detail", "Please check the submitted information."))
    else:
        message = str(detail)
    response.data = {"error": {"code": getattr(exc, "default_code", "API_ERROR").upper(),
                               "message": message, "fields": fields,
                               "request_id": getattr(context["request"]._request, "request_id", "")}}
    return response


def not_found(request, exception=None):
    return JsonResponse({"error": {"code": "NOT_FOUND", "message": "Resource not found.",
                                   "fields": {}, "request_id": getattr(request, "request_id", "")}}, status=404)


def server_error(request):
    return JsonResponse({"error": {"code": "INTERNAL_ERROR", "message": "The service is temporarily unavailable.",
                                   "fields": {}, "request_id": getattr(request, "request_id", "")}}, status=500)
