# WhatsApp templates

Template intent keys are defined for `BOOKING_CONFIRMED`, `BOOKING_CANCELLED`, `BOOKING_RESCHEDULED`, `BOOKING_PAYMENT_PENDING`, `BOOKING_PAYMENT_EXPIRED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `REFUND_INITIATED`, and `REFUND_COMPLETED`. The currently available variable is `booking_reference`.

Configure `WHATSAPP_PROVIDER=MSG91`, `WHATSAPP_INTEGRATED_NUMBER`, `WHATSAPP_LANGUAGE_CODE`, `WHATSAPP_TEMPLATES_JSON` (event key to approved MSG91 template name), and `MSG91_AUTH_KEY`. An opted-in customer's blocked intent can then be submitted through MSG91's [template API](https://docs.msg91.com/en/whatsapp/template-bulk). Provider acceptance is `SENT_TO_PROVIDER`; it does not mean delivered. An uncertain send is `FAILED_REVIEW` and is not resent automatically.

No MSG91 WhatsApp account, approved template identifiers, opt-in copy or delivery status callback was supplied. Thus no real WhatsApp send was attempted. Later technician events are not sent by this phase.
