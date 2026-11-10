from django.db import IntegrityError, transaction
from django.utils import timezone

from common.models import SequenceCounter


def next_sequence(prefix: str, start: int = 1) -> int:
    """Atomically allocate the next integer for the given prefix."""
    with transaction.atomic():
        counter = SequenceCounter.objects.select_for_update().filter(prefix=prefix).first()
        if not counter:
            try:
                counter = SequenceCounter.objects.create(prefix=prefix, last_value=start)
                return counter.last_value
            except IntegrityError:
                counter = SequenceCounter.objects.select_for_update().get(prefix=prefix)
        counter.last_value += 1
        counter.save(update_fields=["last_value", "updated_at"])
        return counter.last_value


def next_work_order_reference(dt=None) -> str:
    local_dt = timezone.localtime(dt or timezone.now())
    stamp = local_dt.strftime("%y%m%d")
    seq = next_sequence(f"NPWO-{stamp}", start=1)
    return f"NPWO-{stamp}-{seq:04d}"


def next_booking_reference(dt=None) -> str:
    local_dt = timezone.localtime(dt or timezone.now())
    stamp = local_dt.strftime("%y%m%d")
    seq = next_sequence(f"NPBK-{stamp}", start=1)
    return f"NPBK-{stamp}-{seq:04d}"


def next_customer_code() -> str:
    seq = next_sequence("NPC", start=10001)
    return f"NPC-{seq:05d}"


def next_invoice_number(issue_date=None) -> str:
    local_date = issue_date or timezone.localdate()
    stamp = local_date.strftime("%y%m")
    seq = next_sequence(f"NPINV-{stamp}", start=1)
    return f"NPINV-{stamp}-{seq:04d}"


def next_technician_code() -> str:
    seq = next_sequence("NPT", start=1)
    return f"NPT-{seq:04d}"
