from django.urls import include, path

urlpatterns = [path("api/v1/", include("config.v1_urls"))]

handler404 = "common.errors.not_found"
handler500 = "common.errors.server_error"
