from django.apps import AppConfig


class TechniciansConfig(AppConfig):
    name = "domains.technicians"
    label = "technicians"

    def ready(self):
        # Signal handlers (job alerts, job broadcast, location clean-up) must be connected at start-up,
        # not only once the URL routes happen to be imported.
        from . import field  # noqa: F401
