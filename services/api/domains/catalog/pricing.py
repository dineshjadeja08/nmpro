"""Customer-facing catalogue prices: zone lookup, package price, MRP and discount."""
from uuid import UUID

from django.db.models import Avg, Count, Q

from domains.locations.models import Zone


def resolve_zone(params):
    """Return the active Zone named by ?zone_id= or ?pincode= / ?postal_code=, else None.

    An unknown or malformed value is treated as "no zone" so catalogue pages never fail
    because of a stale location in the browser.
    """
    zone_id = (params.get("zone_id") or "").strip()
    if zone_id:
        try:
            UUID(zone_id)
        except ValueError:
            return None
        return Zone.objects.filter(id=zone_id, is_active=True, city__is_active=True).first()
    pin = (params.get("pincode") or params.get("postal_code") or "").strip()
    if pin.isdigit() and len(pin) == 6:
        return Zone.objects.filter(postal_code=pin, is_active=True, city__is_active=True).order_by("name").first()
    return None


def rule_total_paise(rule):
    return int((rule.base_paise or 0) + (rule.inspection_paise or 0) + (rule.fee_paise or 0) + (rule.tax_paise or 0))


def package_pricing(package, zone=None):
    """Price block for one package.

    With a zone: that zone's active price, or ``None`` when the package is not priced there.
    Without a zone: the lowest active price in any zone, flagged with ``price_is_from``.
    Uses the prefetched ``prices`` relation when available.
    """
    rules = [r for r in package.prices.all() if r.is_active]
    if zone is not None:
        rule = next((r for r in rules if r.zone_id == zone.id), None)
        price = rule_total_paise(rule) if rule else None
        price_is_from = False
        available = rule is not None
    else:
        totals = [rule_total_paise(r) for r in rules]
        price = min(totals) if totals else None
        price_is_from = len(set(totals)) > 1
        available = None
    mrp = package.original_price_paise
    if price is None or not mrp or mrp <= price:
        mrp = None
    discount = round((mrp - price) * 100 / mrp) if mrp else None
    return {
        "price_paise": price,
        "mrp_paise": mrp,
        "discount_percent": discount,
        "price_is_from": price_is_from,
        "is_available_in_zone": available,
    }


def with_ratings(queryset):
    """Annotate a Service queryset with visible-review average and count in one query."""
    visible = Q(reviews__is_visible=True)
    return queryset.annotate(
        _rating_avg=Avg("reviews__rating", filter=visible),
        _review_count=Count("reviews", filter=visible, distinct=True),
    )


def display_name(user):
    """Privacy-safe reviewer name: first name + last initial, e.g. "Priya S."."""
    if user is None:
        return "Customer"
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    if not first and not last:
        return "Customer"
    if not first:
        return f"{last[0].upper()}."
    first = first.split()[0]
    return f"{first} {last[0].upper()}." if last else first
