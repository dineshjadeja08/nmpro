"""Browser Web Push (VAPID). Disabled unless both VAPID keys are configured."""
import json
import logging

from django.conf import settings

from .models import WebPushSubscription

log = logging.getLogger(__name__)


def enabled():
    return bool(settings.WEB_PUSH_VAPID_PUBLIC_KEY and settings.WEB_PUSH_VAPID_PRIVATE_KEY)


def send_to_user(user_id, payload):
    """Best-effort push to every active subscription of a user. Returns the number delivered."""
    if not enabled():
        return 0
    from pywebpush import WebPushException, webpush

    delivered = 0
    contact = settings.WEB_PUSH_CONTACT or "mailto:support@nammapros.invalid"
    for sub in WebPushSubscription.objects.filter(user_id=user_id, is_active=True):
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=json.dumps(payload),
                vapid_private_key=settings.WEB_PUSH_VAPID_PRIVATE_KEY,
                vapid_claims={"sub": contact},
                ttl=120,
                headers={"Urgency": "high"},
                timeout=5,
            )
            delivered += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            sub.last_error = str(exc)[:300]
            if status in (404, 410):
                sub.is_active = False
            sub.save(update_fields=["last_error", "is_active", "updated_at"])
        except Exception:  # network errors must never break the caller
            log.exception("Web push failed for subscription %s", sub.id)
    return delivered
