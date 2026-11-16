from django.apps import AppConfig


class PromotionsConfig(AppConfig):
    name = "domains.promotions"

    def ready(self):
        from . import signals  # noqa: F401
