# NMPRO Partner

The NammaPros technician app (React Native, Expo SDK 58, TypeScript). Backend: the NammaPros Django API in
`services/api`, signed in with bearer tokens.

This folder is kept outside the npm workspaces (`apps/*`) on purpose, so the websites' installs and the
Netlify build are not affected by React Native.

## What it does today

- **Sign in** with mobile OTP (approved partners with app access).
- **Join** in 4 steps: About you (OTP, services, city, areas) → Documents (Aadhaar front/back, PAN, photo, by
  camera or gallery) → Joining fee (team collects it for now) → Review.
- **Jobs**: Go online / offline, ringing pop-up for each new job in the partner's areas (first to accept gets
  it), job requests list, upcoming jobs, job details with call and navigation.
- English and Tamil.

## Run it

```bash
cd mobile/nmpro-partner
npm install
npx expo start            # scan the QR code with Expo Go, or press a / i for an emulator
npx expo start --web      # quick check in a browser
```

The app talks to `https://nmpro.onrender.com` by default (`app.json` → `expo.extra.apiBaseUrl`). To use a local
API, create `.env.local` (not committed) with:

```
EXPO_PUBLIC_API_BASE_URL=http://<your-computer-ip>:8000
```

A phone cannot reach `localhost` on your computer; use the computer's network IP.

## Ringtone

`assets/sounds/job_alert.wav` rings in the app and is the sound of the Android "Job alerts" notification
channel. Replace that file (same name) to change it. Custom notification sounds need a development or
store build; Expo Go plays the default sound.

## Still to build

- Push notifications from the server to the app (Expo/FCM tokens), so jobs ring with the app closed.
- The job flow after accepting: start OTP, inspection, quotation, completion, collecting payment.
- Earnings, invoices, leave requests and profile.
- Paying the joining fee inside the app.
- App icons, splash screen and store builds (EAS).
