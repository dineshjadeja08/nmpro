# Design system implementation

The customer UI uses a text-only temporary brand lockup because no official logo or moodboard asset was available. Colors: burgundy `#800020`, near-black `#111111`, off-white `#F8F8F8`, white cards, muted rose surfaces. Poppins headings and Nunito body are loaded with `next/font` and swap display. CSS tokens and responsive rules are in `apps/web/src/app/globals.css`; reusable Button, Input, Card, Badge, Skeleton, MessageState, native Dialog and Drawer are in `packages/ui/src/`.

Current components include header/mobile navigation, service cards, problem suggestions, status/empty states, form fields and booking step navigation. Minimum action height is 48px; focus outlines, labels, `aria-live` for step/status changes, pressed state for selected services, reduced motion and responsive 320px layouts are present. The service icon set is Lucide inside rose tiles. Hero artwork is an original CSS illustration, not an official brand asset.

The UX strategy PDF informed the three-step path, colloquial symptom suggestions, warm cards, and Poppins/Nunito typography. Its specific price, warranty, technician-verification and performance claims were not adopted because they are not authoritative business data. Color contrast and keyboard/browser behavior still need automated and human accessibility review.
