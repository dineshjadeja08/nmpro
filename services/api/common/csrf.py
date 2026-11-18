"""CSRF protection that also lets the NMPRO Partner mobile app through.

Browsers keep the usual cookie-based CSRF check. The mobile app sends no cookies and identifies itself with
the ``X-NMPRO-Client: partner-app`` header. A malicious page cannot forge that combination: browsers only send
a custom header cross-site after a CORS preflight, which the API grants to its own sites alone, and a request
with no cookies carries no session to abuse.
"""
from functools import wraps

from django.views.decorators.csrf import csrf_protect

APP_HEADER = "X-NMPRO-Client"
APP_VALUE = "partner-app"


def is_mobile_app(request) -> bool:
    return request.headers.get(APP_HEADER) == APP_VALUE and not request.COOKIES


def csrf_protect_unless_app(view):
    protected = csrf_protect(view)

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if is_mobile_app(request):
            return view(request, *args, **kwargs)
        return protected(request, *args, **kwargs)

    return wrapped
