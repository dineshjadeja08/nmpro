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
