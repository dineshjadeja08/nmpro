from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import NotificationPreference


class PreferenceInput(serializers.Serializer):
    whatsapp_opt_in = serializers.BooleanField()
    sms_opt_in = serializers.BooleanField()
    email_opt_in = serializers.BooleanField()


class NotificationPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        preference, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return Response({"whatsapp_opt_in": preference.whatsapp_opt_in,
                         "sms_opt_in": preference.sms_opt_in, "email_opt_in": preference.email_opt_in})

    def put(self, request):
        data = PreferenceInput(data=request.data)
        data.is_valid(raise_exception=True)
        preference, _ = NotificationPreference.objects.update_or_create(
            user=request.user, defaults=data.validated_data)
        return Response({"whatsapp_opt_in": preference.whatsapp_opt_in,
                         "sms_opt_in": preference.sms_opt_in, "email_opt_in": preference.email_opt_in})
