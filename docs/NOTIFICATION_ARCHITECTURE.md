# Notification architecture

The booking service writes `OutboxEvent` inside the booking transaction. A Celery worker creates one `Notification` per outbox event. It sets a channel from explicit user preferences, a template key and a limited payload. When no opt-in exists the channel is `NONE`. Unconfigured intents remain `BLOCKED_CONFIGURATION`. This prevents a pending record from being mistaken for delivered communication.

`GET|PUT /api/v1/customers/notification-preferences/` lets each signed-in customer manage opt-in flags; the account page exposes these controls. MSG91 WhatsApp and SMS, and SMTP email tasks claim configured intents, call the provider outside the transaction and record `SENT_TO_PROVIDER` with an acceptance reference. An uncertain result stays in operations review (`FAILED_REVIEW`) to avoid a duplicate send. There is no delivery receipt integration or automatic retry after an uncertain submission. The outbox and mocked channel submissions are tested; external delivery is not.

SMS requires `SMS_PROVIDER=MSG91`, an approved `SMS_TEMPLATES_JSON` map and `SMS_VARIABLE_NAME` matching the approved MSG91 flow placeholder. Email requires `EMAIL_PROVIDER=SMTP`, `EMAIL_FROM_ADDRESS`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD`. Provider credentials stay server side. See [MSG91 SMS API](https://docs.msg91.com/sms/send-sms).
