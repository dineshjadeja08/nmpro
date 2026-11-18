"""Job broadcast: every eligible technician in the area sees a new job at once, the first to accept gets it,
and technicians who already have a job that day see it only after the wait (or when nobody else can)."""
from datetime import datetime, time, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from domains.bookings.models import AppointmentSlot, Booking
from domains.catalog.models import Category, Service, ServicePackage
from domains.locations.models import Address, City, Zone
from domains.technicians import broadcast
from domains.technicians.models import (JobAssignment, JobOffer, TechnicianAvailability, TechnicianJoiningFee,
                                        TechnicianProfile, TechnicianServiceZone, TechnicianSkill)

User = get_user_model()


@pytest.fixture
def area(db, settings):
    from django.core.cache import cache

    cache.clear()
    settings.JOB_BROADCAST_ENABLED = True
    settings.JOB_BROADCAST_BUSY_DELAY_SECONDS = 240
    settings.TECHNICIAN_LEADS_PER_YEAR = 0
    category = Category.objects.create(slug="ac", name="AC", is_active=True)
    service = Service.objects.create(category=category, slug="ac-service", name="AC Service", is_active=True)
    package = ServicePackage.objects.create(service=service, name="Foam jet", pricing_model="FIXED_PRICE",
                                            duration_minutes=60, skill_code="AC", is_active=True)
    city = City.objects.create(name="Chennai", slug="chennai", is_active=True)
    anna_nagar = Zone.objects.create(city=city, name="Anna Nagar", postal_code="600040", is_active=True)
    adyar = Zone.objects.create(city=city, name="Adyar", postal_code="600020", is_active=True)
    customer = User.objects.create_user(username="+919840070000", phone_e164="+919840070000")
    address = Address.objects.create(user=customer, line_1="2 Second Ave", locality="Anna Nagar", city="Chennai",
                                     postal_code="600040")
    return {"service": service, "package": package, "zone": anna_nagar, "other_zone": adyar,
            "customer": customer, "address": address}


def tech(area, phone, zone=None, online=True, skill="AC"):
    user = User.objects.create_user(username=phone, phone_e164=phone)
    profile = TechnicianProfile.objects.create(user=user, display_name=phone[-4:], verification_status="VERIFIED",
                                               is_active=True, is_online=online, app_login_enabled=True)
    TechnicianSkill.objects.create(technician=profile, code=skill, is_verified=True)
    TechnicianServiceZone.objects.create(technician=profile, zone=zone or area["zone"], assigned_by=user)
    for day in range(7):
        TechnicianAvailability.objects.create(technician=profile, weekday=day, start_minute=0, end_minute=1439)
    now = timezone.now()
    TechnicianJoiningFee.objects.create(technician=profile, amount_paise=1000000, status="PAID",
                                        paid_at=now, valid_until=now + timedelta(days=365))
    client = APIClient()
    client.force_authenticate(user=user)
    profile.client = client
    return profile


def booking(area, hour, ref, minute=0):
    day = timezone.localdate() + timedelta(days=1)
    start = timezone.make_aware(datetime.combine(day, time(hour, minute)))
    slot = AppointmentSlot.objects.create(zone=area["zone"], package=area["package"], start_at=start,
                                          end_at=start + timedelta(hours=1), capacity=5, is_active=True)
    return Booking.objects.create(user=area["customer"], service=area["service"], package=area["package"],
                                  address=area["address"], slot=slot, status="CONFIRMED", reference=ref)


def offered(b):
    return set(JobOffer.objects.filter(booking=b, status="OFFERED").values_list("technician__user__phone_e164", flat=True))


def test_new_booking_goes_to_every_eligible_technician_in_the_area(area, django_capture_on_commit_callbacks):
    a, b = tech(area, "+919840070001"), tech(area, "+919840070002")
    tech(area, "+919840070003", zone=area["other_zone"])    # works in another area
    tech(area, "+919840070004", online=False)              # offline
    tech(area, "+919840070005", skill="PLUMBING")          # does not do this service
    with django_capture_on_commit_callbacks(execute=True):
        job = booking(area, 10, "NP-B-1")
    assert offered(job) == {a.user.phone_e164, b.user.phone_e164}


def test_first_to_accept_gets_it_and_it_disappears_for_others(area, django_capture_on_commit_callbacks):
    a, b = tech(area, "+919840070011"), tech(area, "+919840070012")
    with django_capture_on_commit_callbacks(execute=True):
        job = booking(area, 10, "NP-B-2")
    offer_a = JobOffer.objects.get(booking=job, technician=a)
    offer_b = JobOffer.objects.get(booking=job, technician=b)
    assert a.client.post(f"/api/v1/technicians/job-offers/{offer_a.id}/accept/").status_code == 200
    offer_b.refresh_from_db()
    assert offer_b.status == "WITHDRAWN"
    assert b.client.post(f"/api/v1/technicians/job-offers/{offer_b.id}/accept/").status_code == 409
    assert JobAssignment.objects.get(booking=job).technician == a


def test_busy_technician_sees_second_job_only_after_the_wait(area, django_capture_on_commit_callbacks):
    a, b = tech(area, "+919840070021"), tech(area, "+919840070022")
    with django_capture_on_commit_callbacks(execute=True):
        first = booking(area, 9, "NP-B-3")
    offer = JobOffer.objects.get(booking=first, technician=a)
    assert a.client.post(f"/api/v1/technicians/job-offers/{offer.id}/accept/").status_code == 200

    # Same day, same area: the technician without a job that day gets it first.
    with django_capture_on_commit_callbacks(execute=True):
        second = booking(area, 15, "NP-B-4")
    assert offered(second) == {b.user.phone_e164}

    # Nobody accepted within 4 minutes: the busy technician sees it too (checked when an app asks for offers).
    JobOffer.objects.filter(booking=second).update(created_at=timezone.now() - timedelta(minutes=5))
    from django.core.cache import cache

    cache.clear()
    response = a.client.get("/api/v1/technicians/job-offers/")
    assert response.status_code == 200
    assert offered(second) == {a.user.phone_e164, b.user.phone_e164}
    assert any(o["id"] == str(JobOffer.objects.get(booking=second, technician=a).id) for o in response.json()["offers"])


def test_busy_technician_gets_it_at_once_when_nobody_else_can(area, django_capture_on_commit_callbacks):
    a = tech(area, "+919840070031")
    with django_capture_on_commit_callbacks(execute=True):
        first = booking(area, 9, "NP-B-5")
    offer = JobOffer.objects.get(booking=first, technician=a)
    assert a.client.post(f"/api/v1/technicians/job-offers/{offer.id}/accept/").status_code == 200
    with django_capture_on_commit_callbacks(execute=True):
        second = booking(area, 15, "NP-B-6")
    assert offered(second) == {a.user.phone_e164}


def test_no_offer_to_technicians_without_membership_or_with_a_clash(area, django_capture_on_commit_callbacks):
    a, b = tech(area, "+919840070041"), tech(area, "+919840070042")
    TechnicianJoiningFee.objects.filter(technician=b).update(valid_until=timezone.now() - timedelta(days=1))
    with django_capture_on_commit_callbacks(execute=True):
        first = booking(area, 10, "NP-B-7")
    assert offered(first) == {a.user.phone_e164}
    offer = JobOffer.objects.get(booking=first, technician=a)
    assert a.client.post(f"/api/v1/technicians/job-offers/{offer.id}/accept/").status_code == 200
    # 10:30 overlaps the 10:00 job (with travel time), so the only technician is not offered it, even later.
    with django_capture_on_commit_callbacks(execute=True):
        clash = booking(area, 10, "NP-B-8", minute=30)
    assert offered(clash) == set()


def test_broadcast_can_be_switched_off(area, settings, django_capture_on_commit_callbacks):
    settings.JOB_BROADCAST_ENABLED = False
    tech(area, "+919840070051")
    with django_capture_on_commit_callbacks(execute=True):
        job = booking(area, 10, "NP-B-9")
    assert offered(job) == set() and broadcast.sweep() == 0
