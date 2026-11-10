from rest_framework.exceptions import APIException


class StateConflict(APIException):
    status_code = 409
    default_detail = "This booking transition is not allowed."
    default_code = "INVALID_TRANSITION"

ALLOWED_CUSTOMER_TRANSITIONS = {
    "DRAFT": frozenset({"REQUESTED", "CONFIRMED_UNPAID", "AWAITING_PAYMENT", "PENDING_PAYMENT"}),
    "REQUESTED": frozenset({"CONFIRMED", "CONFIRMED_UNPAID", "CANCELLED"}),
    "AWAITING_PAYMENT": frozenset({"CONFIRMED", "EXPIRED", "CANCELLED"}),
    "PENDING_PAYMENT": frozenset({"CONFIRMED", "EXPIRED", "CANCELLED", "PAYMENT_FAILED"}),
    "PAYMENT_FAILED": frozenset({"AWAITING_PAYMENT", "PENDING_PAYMENT", "CONFIRMED", "CANCELLED"}),
    "CONFIRMED": frozenset({"TECHNICIAN_ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"}),
    "CONFIRMED_UNPAID": frozenset({"CONFIRMED", "CONFIRMED_UNPAID", "TECHNICIAN_ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"}),
    "TECHNICIAN_ASSIGNED": frozenset({"TECHNICIAN_EN_ROUTE", "IN_PROGRESS", "CANCELLED"}),
    "TECHNICIAN_EN_ROUTE": frozenset({"TECHNICIAN_ARRIVED", "IN_PROGRESS", "CANCELLED"}),
    "TECHNICIAN_ARRIVED": frozenset({"IN_PROGRESS", "CANCELLED"}),
    "IN_PROGRESS": frozenset({"COMPLETED", "CANCELLED"}),
    "COMPLETED": frozenset({"CLOSED"}),
    "CLOSED": frozenset(),
    "CANCELLED": frozenset(),
    "EXPIRED": frozenset(),
}


def require_transition(current: str, target: str):
    if target not in ALLOWED_CUSTOMER_TRANSITIONS.get(current, frozenset()):
        raise StateConflict()
