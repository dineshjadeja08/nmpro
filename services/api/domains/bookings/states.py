from rest_framework.exceptions import APIException


class StateConflict(APIException):
    status_code = 409
    default_detail = "This booking transition is not allowed."
    default_code = "INVALID_TRANSITION"

ALLOWED_CUSTOMER_TRANSITIONS = {
    "DRAFT": frozenset({"CONFIRMED_UNPAID", "AWAITING_PAYMENT"}),
    "AWAITING_PAYMENT": frozenset({"CONFIRMED", "EXPIRED"}),
    "CONFIRMED": frozenset(),
    "CONFIRMED_UNPAID": frozenset({"CONFIRMED_UNPAID", "CANCELLED"}),
    "CANCELLED": frozenset(),
    "EXPIRED": frozenset(),
}


def require_transition(current: str, target: str):
    if target not in ALLOWED_CUSTOMER_TRANSITIONS.get(current, frozenset()):
        raise StateConflict()
