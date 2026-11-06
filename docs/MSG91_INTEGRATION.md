# MSG91 OTP integration

Production requires `MSG91_AUTH_KEY` and `MSG91_OTP_TEMPLATE_ID` at startup. `OTP_CODE_LENGTH` is 4 or 6 and must match the approved template. Phone numbers must be Indian E.164 (`+91` and ten mobile digits). The server sends via MSG91 SendOTP and verifies via the OTP verify API. It checks the response `type`, since HTTP success alone is not verification. The existing five minute challenge, 60 second resend cooldown, hourly request limit, five attempt limit, scoped throttling and CSRF remain.

Production responses never include a code; local nonproduction responses retain `development_code`. No real MSG91 account or approved template was available, so production delivery was not verified. See [MSG91 SendOTP](https://docs.msg91.com/otp/sendotp) and [MSG91's OTP verification example](https://msg91.com/help/hello-contact-center/chatbots-in-hello/msg91-bot/utility/script-use-cases).
