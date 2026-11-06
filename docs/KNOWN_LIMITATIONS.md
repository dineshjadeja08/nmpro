# Known limitations and next work

- No official logo or moodboard file was available; the text lockup and CSS hero art are temporary.
- The local catalog is demonstration data with no price, zone, availability or business claim. Specific Tamil Nadu service coverage is unverified.
- Booking is a session-only draft. It does not check serviceability, reserve a slot, quote a price, authenticate, create a booking or process payment. Step 3 confirmation is disabled.
- Technician/admin/operations apps are placeholders; no privileged data or route is exposed. Auth, role grants, KYC and dispatch will be separate phases.
- Foundational booking/payment/notification models are not yet a complete domain schema. Do not create records through a public endpoint; there is none. The future slot hold, ledger, payout and outbox designs remain planning artifacts.
- Docker was not installed on the implementation host, so PostgreSQL/Redis integration and Compose startup may remain unverified. SQLite fallback is for local development and tests only.
- Server-side catalog fetch can fail when API is down; the UI shows an error, with no silent mock fallback. Exact production domain and SEO canonical URLs remain unconfirmed.
- Performance targets and WCAG 2.2 AA compliance need measured browser testing; no Lighthouse/Core Web Vitals result is claimed.
- Full npm audit still reports 14 moderate advisories in development-only lint dependencies. Production npm dependencies and indexed Python dependencies scanned clean after updating Django REST Framework and pip; see `TEST_RESULTS.md`.
- The popular-services area is a transparent placeholder until real booking data exists. No ranking or demand claim is made.
