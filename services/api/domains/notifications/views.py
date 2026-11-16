from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DeviceToken, NotificationPreference


class PreferenceInput(serializers.Serializer):
    whatsapp_opt_in = serializers.BooleanField()
    sms_opt_in = serializers.BooleanField()
    email_opt_in = serializers.BooleanField()
    push_opt_in = serializers.BooleanField(required=False)


class NotificationPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preference, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return Response({"whatsapp_opt_in": preference.whatsapp_opt_in,
                         "sms_opt_in": preference.sms_opt_in, "email_opt_in": preference.email_opt_in,
                         "push_opt_in": preference.push_opt_in})

    def put(self, request):
        data = PreferenceInput(data=request.data)
        data.is_valid(raise_exception=True)
        preference, _ = NotificationPreference.objects.update_or_create(
            user=request.user, defaults=data.validated_data)
        return Response({"whatsapp_opt_in": preference.whatsapp_opt_in,
                         "sms_opt_in": preference.sms_opt_in, "email_opt_in": preference.email_opt_in,
                         "push_opt_in": preference.push_opt_in})


class DeviceRegisterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        platform = serializers.ChoiceField(choices=["WEB", "ANDROID", "IOS"]).run_validation(
            str(request.data.get("platform", "ANDROID")).upper()
        )
        token = serializers.CharField(max_length=512).run_validation(request.data.get("token"))
        device, _ = DeviceToken.objects.update_or_create(
            token=token,
            defaults={"user": request.user, "platform": platform, "is_active": True, "last_seen_at": timezone.now()},
        )
        return Response({"id": str(device.id), "platform": device.platform, "is_active": device.is_active}, status=201)

    def delete(self, request):
        token = (request.data.get("token") or "").strip()
        if token:
            DeviceToken.objects.filter(user=request.user, token=token).update(is_active=False)
        return Response(status=204)


class WebPushConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings

        from .webpush import enabled
        return Response({"enabled": enabled(), "public_key": settings.WEB_PUSH_VAPID_PUBLIC_KEY if enabled() else ""})


class WebPushSubscribeInput(serializers.Serializer):
    endpoint = serializers.URLField(max_length=1000)
    keys = serializers.DictField(child=serializers.CharField(max_length=200))

    def validate_endpoint(self, value):
        if not value.startswith("https://"):
            raise serializers.ValidationError("Push endpoint must use https.")
        return value

    def validate_keys(self, value):
        if not value.get("p256dh") or not value.get("auth"):
            raise serializers.ValidationError("Subscription keys are missing.")
        return value


class WebPushSubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from .models import WebPushSubscription

        data = WebPushSubscribeInput(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        WebPushSubscription.objects.update_or_create(
            endpoint=values["endpoint"],
            defaults={"user": request.user, "p256dh": values["keys"]["p256dh"], "auth": values["keys"]["auth"],
                      "user_agent": request.headers.get("User-Agent", "")[:300], "is_active": True, "last_error": ""})
        return Response({"subscribed": True}, status=201)

    def delete(self, request):
        from .models import WebPushSubscription

        endpoint = str(request.data.get("endpoint", ""))[:1000] if isinstance(request.data, dict) else ""
        WebPushSubscription.objects.filter(user=request.user, endpoint=endpoint).update(is_active=False)
        return Response(status=204)
