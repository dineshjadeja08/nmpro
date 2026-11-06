# NammaPros UI/UX specification

Brand tokens: burgundy `#800020`, near black `#111111`, off-white `#F8F8F8`; Poppins or Nunito with system fallback. Premium but friendly: generous space, restrained shadow, clear price and trust copy. No Purple Squad assets, wording or purple visual system. No moodboard was present in the provided workspace or archives; visual reference remains **REQUIRES VALIDATION**.

## Shared system

Hierarchy: `AppShell > header/mobile bottom nav > page heading > step/content > sticky action`; components: Button, Field, SearchBox, ServiceCard, PriceBreakdown, AddressCard, SlotGrid, StatusTimeline, Alert, Drawer, Dialog, DataTable, EmptyState and Skeleton. AA contrast, semantic headings, visible focus, 44px targets, keyboard dialog/step behavior, accessible price/error announcements. 320px–767px single column with sticky action; 768px–1199px two columns; >=1200px centered max-width content. Never encode status by color alone. Reserve image dimensions; font swap; reduced-motion support.

| Screen | Primary content/interactions | Loading, empty, error and responsive behavior |
|---|---|---|
| Public home | Brand header, location, search, five service groups, popular tasks, trust, FAQ; tap service opens Step 1 with selection. | Skeleton service rows; unavailable zone guidance; search no-results suggests diagnostic. Mobile single-column cards and bottom Book CTA. |
| Category/service | Task cards with starting price, duration, inclusions/exclusions, inspection option, reviews and FAQ. Select service/describe fault. | Price unavailable shows request-estimate; media fallback; desktop sidebar category list, mobile chips. |
| Step 1 What service? | Search/popular/category/problem description/“Not sure what's wrong?”; selection summary and Continue. | Empty search and validation explain next action. Do not demand appliance model for diagnostic selection. |
| Step 2 Where/when? | Saved address, add address drawer, serviceability, backend slot grid, optional instructions, auto-select nothing. | Skeleton slots, stale slot refresh, map fallback/manual address; mobile date strip and sticky Continue. |
| Step 3 Review/confirm | Service, address, slot, quote expiry, line items, tax/inspection fee, exclusions, payment method, OTP gate. Confirm is disabled on stale quote/hold; show recovery. | Provider timeout and pending payment use a safe checking state; never infer success from client callback. |
| Success/tracking | Reference, status timeline, assignment and technician details, invoice, cancel/reschedule/support/rebook. | Pending assignment copy and escalation window; show policy reasons for disabled actions. |
| Quick rebook | Recent eligible service/address prefilled, fresh quote and slots, three-step review. | Expired catalogue item routes to service selection; never reuse stale amount. |
| Customer account | Booking list, addresses, support tickets, profile/notifications. | Empty bookings CTA; pagination and accessible filters. |
| Technician onboarding/PWA | Identity, KYC upload, skills/zones, working hours, verification status; offline-safe jobs list and job detail checklist/photos/inspection/quote. | Upload retry; offline banner and queued drafts only for nonfinancial actions; no silent job acceptance offline. |
| Operations console | Queue with SLA/status filters, map/list dispatch, capacity, booking detail, escalation/ticket timeline, assignment confirmation. | Live refresh badge, stale-data timestamp, conflict modal and retry. Mobile read/urgent action view; desktop dense workspace. |
| Admin | Dashboard, catalog/pricing editor, zones/slots, customers/techs, finance/refunds/payout approval, permissions, audit/report pages. | Table skeletons, explicit zero states, export job feedback; destructive finance actions require reason and approval. |

Visual consistency: same status vocabulary and money formatting across portals; primary burgundy reserved for actions; red destructive only; neutral backgrounds and clear borders. Every mutation shows in-flight, success, failure and retry states. Support reduced data and slow connection. Validate with keyboard, screen reader, 320px viewport and actual low-end Android.
