# NammaPros Operations Console (`apps/operations`)

High-density desktop control room for operations coordinators (1366px–1920px), built with Next.js App Router, TypeScript, Tailwind CSS, TanStack Query, and Recharts.

## Environment Variables

Configure `apps/operations/.env.local` (see `.env.example`):

- `NEXT_PUBLIC_API_BASE_URL` — Django REST API origin (default `http://localhost:8000`)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — Browser-restricted Google Maps JS API key for live map pins

## Pages

1. `/dashboard` — Priority Action Queue cards, today's KPIs, SLA deadlines, urgent escalations, live job pins map, and recent/upcoming jobs.
2. `/leads` — Toggleable CRM Board (`New → Contacted → Interested → Scheduled → Converted / Lost`) & Table views, overdue follow-up highlights, Google Maps lead creation modal, right drawer with call/WhatsApp, contact logging, scheduling, payment links, manual payment capture, follow-ups, activity timeline, and slot-verified / manual work-order conversion.
3. `/bookings` — High-density booking table with saved filter views, URL-synced filters, bulk assign/reassign, 15s background polling banner, and right drawer (`Overview`, `Timeline`, `Notes`, `Quotation`, `Photos`) enforcing state transitions from `domains/bookings/states.py`.
4. `/dispatch` — Split view with SLA-sorted queue on the left, ranked candidate suggestions, live offer attempts, send-offer, and force-assign actions on the right.
5. `/schedule` — 07:00–21:00 IST Gantt-style technician timeline with day picker, zone/skill filters, conflict highlighting, and open slot capacity. *(Phase 2 TODO: drag-to-reschedule.)*
6. `/technicians` — Technician roster with verification/online state, zones, verified skills, weekly availability, time-off, assignments, and internal notes.
7. `/customers` — Customer search with booking history, extracted addresses, payment summary, and linked support tickets.
8. `/support` & `/escalations` — Ticket & escalation inboxes with response SLA timers, status/owner management, communication logs, and required resolution enforcement.
9. `/reports` — Date-range KPIs, Recharts charts (daily trend, zone, service, lead funnel), technician utilization table, and CSV export.
10. `/settings` — Active Dispatch Rule & SLA Policies view (plus Manager edit mode) and personal dark-mode/shortcut preferences.

## Keyboard Shortcuts

- `/` or `Ctrl+K` (`Cmd+K`) — Global command & record search palette
- `J` / `K` — Move selection down / up table rows
- `Enter` — Open highlighted row in right drawer
- `Esc` — Close open drawer or dialog
- `A` — Jump to Assign / Reassign section (inside booking drawer)
- `N` — Focus Add Internal Note input (inside booking drawer)
- `R` — Jump to Reschedule controls (inside booking drawer)
- `?` — Show keyboard shortcut reference

## Backend Endpoint Gaps Observed (No Mock Data Invented)

- **Zone Grants self-lookup:** `GET /api/v1/operations/lead-zone-grants/` requires `MANAGE_STAFF`. Non-admin operators rely on server-side zone filtering without an endpoint returning their own granted zone list.
- **Dashboard GPS Coordinates:** `/api/v1/operations/bookings/` and `/api/v1/operations/technicians/` do not return `latitude`/`longitude` coordinates, and `/api/v1/operations/dashboard/` does not compute `avg_time_to_assign` or paginated day revenue.
- **Dispatch Candidate Telemetry:** `/api/v1/operations/dispatch/candidates/` returns `id`, `name`, `score`, `workload`, and `reasons`, without technician phone, distance, rating, or acceptance rate.
- **Booking Drawer Tabs & Actions:** Operations endpoints (`operations/bookings/<id>/`) do not yet expose technician spare-part quotations (`bookings/<id>/quotations/`), job photos (`admin/bookings/<id>/photos/`), refund request (`admin/finance/refunds/request/`), or notification resend (`admin/notifications/`). Reschedule in `OperationsBookingActionView` currently supports `CONFIRMED_UNPAID` only.
- **Reports & Customer Preferences:** `/operations/reports/` does not aggregate cancellation reasons (`cancel_reason`), and `/operations/customers/<id>/` does not expose a standalone customer saved-addresses list outside bookings.
