from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from domains.notifications.views import DeviceRegisterView
from domains.users.views import FirebaseAuthView

urlpatterns = [
    path("api/v1/", include("config.v1_urls")),
    path("api/auth/firebase-login/", FirebaseAuthView.as_view()),
    path("api/devices/register/", DeviceRegisterView.as_view()),
    path("api/schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="api-schema"), name="api-docs"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="api-schema"), name="api-redoc"),
]

handler404 = "common.errors.not_found"
handler500 = "common.errors.server_error"
