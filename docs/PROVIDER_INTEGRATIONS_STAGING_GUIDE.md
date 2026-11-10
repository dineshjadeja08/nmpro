# Provider Integrations and Staging Verification Guide

This guide details the setup and verification steps for customer Firebase phone authentication, advance payment with Razorpay, Cloudinary service image hosting, and controlled pilot gating.

---

## 1. Customer Authentication: Firebase Phone Authentication

### Architectural Separation
- **Customer Sign-In:** Customers sign in via Firebase Phone Authentication on `apps/web`. The client retrieves a Firebase ID token and authenticates with `/api/v1/auth/firebase/` to establish a secure HTTP-only Django session.
- **Staff / Admin / Operations / Technician Authentication:** Back-office personnel authenticate via the dedicated internal OTP workflow (`/api/v1/auth/otp/request/` and `/api/v1/auth/otp/verify/`). Staff accounts do not require Firebase tokens.

### Configuration
1. **Google Cloud / Firebase Project:**
   - Enable Phone Authentication under **Firebase Console > Build > Authentication > Sign-in method**.
   - Add your staging and production web domains (e.g., `nammapros.in`, `staging.nammapros.in`, `localhost`) to **Authorized domains**.
   - Configure invisible reCAPTCHA in Firebase.
2. **Web Client (`apps/web`):**
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=nammapros.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=nammapros
   ```
   *Note:* If Firebase variables are unset in local development, `apps/web` falls back to dev mode with mock verification code `123456`.
3. **API Server (`services/api`):**
   - Store credentials in Secret Manager or environment:
   ```env
   FIREBASE_PROJECT_ID=nammapros
   FIREBASE_WEB_API_KEY=AIzaSy...
   ```
   - In development/test environments (`ENVIRONMENT=development`), `dev-token:<phone>` tokens are accepted. In staging and production, tokens are strictly verified against Google Identity Toolkit.

---

## 2. Advance Payments & Remaining Balance Flow

### Pricing Configuration in Admin Portal
- Admin can configure advance payment rules on any service package via the Admin Portal (`/pricing`):
  - **Payment Policy:** `ADVANCE` (alongside `PREPAID` and `PAY_AT_VISIT`).
  - **Advance Type:** `PERCENTAGE` or `FIXED`.
  - **Advance Percentage:** e.g., `20` for 20% advance (must be between 1% and 100%).
  - **Advance Amount (Paise):** e.g., `50000` for ₹500.00 fixed advance (cannot exceed package base price).

### Checkout & Payment Lifecycle
1. **Quote Calculation:**
   - When a hold is created, `/checkout/quote/` calculates:
     - `advance_paise`: Amount required upfront to confirm the appointment.
     - `remaining_balance_paise`: Total price minus advance.
2. **Initial Booking Confirmation:**
   - Customer confirms the booking; booking status becomes `AWAITING_PAYMENT`.
   - Razorpay payment order (`/bookings/<id>/payment-order/`) is generated specifically for `advance_paise`.
   - Upon verification (`/bookings/<id>/payment-verify/` or webhook `order.paid` / `payment.captured`), booking transitions to:
     - `status`: `CONFIRMED`
     - `payment_status`: `ADVANCE_PAID`
     - Price snapshot immutably stores advance and remaining balance.
3. **Remaining Balance Settlement:**
   - **Online Payment:** Customer can pay the remaining balance anytime before or after the visit via `/bookings/<id>/balance-order/` and `/bookings/<id>/balance-verify/`.
   - **At-Visit Collection:** Technician or operations can record balance collection via `/bookings/<id>/balance-collect/` specifying `payment_method`: `UPI` or `CASH`.
   - Upon balance collection, `payment_status` moves to `PAID`.
4. **Refund Safety Invariant:**
   - Refunds on advance bookings are strictly capped at the collected amount (`payment.amount_paise`), preserving financial soundness and preventing negative balances.

---

## 3. Cloudinary Service Images

### Secure Server-Side Uploads
- Service image uploads are managed strictly via the Django API (`/api/v1/admin/services/<id>/images/`).
- **Secret Manager Credentials:**
  ```env
  CLOUDINARY_CLOUD_NAME=nammapros
  CLOUDINARY_API_KEY=123456789012345
  CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz
  ```
- Uploads are signed using SHA-1 digests directly on the server. Cloudinary API secrets are **never** exposed to client browsers or Next.js code.
- Successfully uploaded images store `cloudinary_url` and `cloudinary_public_id` on the `ServiceImage` model.
- If Cloudinary credentials are not configured, the server gracefully falls back to local storage (`/api/v1/catalog/images/<id>/`).

### Catalog Image Display
- The public catalog API (`/api/v1/catalog/` and `/api/v1/catalog/services/<slug>/`) returns image URLs pointing to Cloudinary CDN.
- Customer website (`apps/web`) displays Cloudinary thumbnails on service cards and high-resolution banners on service detail pages.

---

## 4. Google Maps & Places API (Location Autocomplete & Geocoding)

### Architectural Setup (Mirroring Purple Squad)
- **Zero Client Key Exposure:** `GOOGLE_MAPS_API_KEY` is kept strictly on the backend in Secret Manager / environment. Browsers never receive the raw Google Maps API key.
- **Backend Provider (`domains/locations/providers/google_maps.py`):**
  - **Autocomplete:** `/api/v1/location/autocomplete/?input=...` queries Google Places API (`/places:autocomplete`), biased to India (`regionCode: "in"`). Cached in Redis (`location:auto:...`).
  - **Place Geocode:** `/api/v1/location/geocode/?place_id=...` fetches place details, normalising `house_flat`, `street`, `locality`, `city`, `state`, `postal_code`, `latitude`, `longitude`. If an area-level result lacks a postal code, it reverse-geocodes the coordinates automatically. Cached in Redis (`location:place:...`).
  - **Reverse Geocode (GPS):** `/api/v1/location/reverse-geocode/?lat=...&lng=...` queries Google Maps Geocoding API (`/geocode/json?latlng=...`). Cached in Redis (`location:reverse:...`).
  - **Development Fallback:** Gracefully falls back to realistic Tamil Nadu mock addresses when `GOOGLE_MAPS_API_KEY` is not set, preventing local dev or CI blocks.
- **Customer UI (`apps/web`):**
  - Instant Google Maps search box with debounced suggestions dropdown.
  - "Use current location" button utilizing browser `navigator.geolocation` and reverse geocoding to auto-fill address details.

---

## 5. Staging Verification Checklist

Execute these checks in the staging environment before approving the release:

| Verification Item | Command / Step | Success Criteria |
|---|---|---|
| **Google Maps Places** | Search area name (e.g., "Anna Nagar") in address search | Dropdown shows Google Maps suggestions; selecting one auto-fills street, locality, city, and postal code. |
| **GPS Geolocation** | Click "Use current location" in customer address form | Geolocation coordinates resolved; address fields populate with current locality, city, and PIN code. |
| **PostgreSQL Concurrency** | Run Django check & migrations against Cloud SQL | `python manage.py check --database default` passes with 0 warnings. |
| **Firebase Sign-In** | Attempt customer login with real phone number on staging domain | Firebase SMS arrives; ID token verified; Django session cookie set with `HttpOnly; Secure; SameSite=Lax`. |
| **Admin Advance Setup** | Set 25% advance on a test package in Admin Portal | Price rule saved; `/checkout/quote/` returns exact 25% `advance_paise`. |
| **Razorpay Test Advance** | Complete advance checkout using Razorpay test card | Booking status transitions to `CONFIRMED` and `ADVANCE_PAID`. |
| **Razorpay Balance Order** | Pay balance via `/bookings/<id>/balance-order/` | Razorpay order created for remaining balance; booking status transitions to `PAID`. |
| **At-Visit Balance Collection** | Record cash/UPI collection via `/bookings/<id>/balance-collect/` | Second `Payment` record created; ledger balanced; booking marked `PAID`. |
| **Refund Cap Test** | Initiate refund on advance booking | System allows refund up to advance amount; rejects refund amounts exceeding collected advance. |
| **Cloudinary Upload** | Upload service banner in Admin Portal | Cloudinary signed upload succeeds; image displays on customer service page via Cloudinary CDN. |
| **Technician Roster & KYC** | Verify technician document review flow in Operations Portal | Status updates to `VERIFIED`; technician can be assigned to pilot zone orders. |
| **Disaster Recovery** | Restore staging PostgreSQL snapshot to a recovery test instance | Recovery instance boots and database tables match source. |

---

## 6. Controlled Pilot Launch Parameters

Public booking must remain gated (`PUBLIC_BOOKING_ENABLED=false`) until staging verification is complete.

Configure the pilot in `services/api/.env`:
```env
# Enable pilot controls
PILOT_ENABLED=true

# Restrict to verified zone(s)
PILOT_ZONE_IDS=zone-uuid-chennai-central

# Restrict to verified services
PILOT_SERVICE_SLUGS=ac-deep-clean,washing-machine-checkup

# Capacity ceiling per day
PILOT_DAILY_BOOKING_LIMIT=20

# Open gate only after Go/No-Go approval
PUBLIC_BOOKING_ENABLED=true
```

When `PUBLIC_BOOKING_ENABLED=true` with `PILOT_ENABLED=true`, bookings are accepted only for the specified zones and services up to the configured daily limit, ensuring operational capacity and technician coverage.
