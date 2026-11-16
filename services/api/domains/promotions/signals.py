from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from domains.bookings.models import Booking

from .services import on_booking_status


@receiver(post_save, sender=Booking, dispatch_uid="promotions_booking_status")
def booking_saved(sender, instance, created, **kwargs):
    if created:
        return
    booking_id = instance.pk
    transaction.on_commit(lambda: on_booking_status(Booking.objects.get(pk=booking_id)))
