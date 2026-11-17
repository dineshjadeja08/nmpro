import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Section } from "@/components/content-page";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms that apply when you book home services through NammaPros.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <ContentPage white eyebrow="Policies" title="Terms of service" updated={site.policyUpdated}
      intro={<>These terms apply when you use the NammaPros website or apps to book a service. The platform is operated by {site.legalName}, {site.legalAddress}.</>}>
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        Draft for legal review. Replace bracketed details and confirm the terms with your legal adviser before launch.
      </p>
      <Section title="1. Our role">
        <p>NammaPros lists home services, takes bookings and assigns verified independent professionals or staff to carry out the work.</p>
      </Section>
      <Section title="2. Your account">
        <p>You sign in with a one-time code sent to your phone. Keep your phone secure and do not share codes. You are responsible for bookings made from your account.</p>
      </Section>
      <Section title="3. Bookings and prices">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>The price shown at checkout is the price for the selected package in your area, including the taxes and fees listed.</li>
          <li>Inspection-based services charge the inspection amount; repairs are quoted after inspection and need your approval.</li>
          <li>Offer and referral codes follow the rules shown with each code. One code per booking. Codes have no cash value.</li>
        </ul>
      </Section>
      <Section title="4. Payments">
        <p>You can pay online through our payment partner, or at the visit by cash or UPI where the service allows it. We never ask for your card number, OTP or UPI PIN by phone or WhatsApp.</p>
      </Section>
      <Section title="5. Visits">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Please be available at the address during the slot and share the start code with the professional when work begins.</li>
          <li>Provide safe access, water and electricity where the service needs them.</li>
          <li>Professionals may decline work that is unsafe or outside the booked service.</li>
        </ul>
      </Section>
      <Section title="6. Cancellations, refunds and rework">
        <p>See our <Link href="/cancellation-policy" className="font-semibold text-[#800020] underline">cancellation &amp; refund policy</Link>.</p>
      </Section>
      <Section title="7. Reviews">
        <p>Reviews must be honest and about your own booking. We may hide reviews that are abusive, share personal information or are unrelated to the service. We show your first name and last initial only.</p>
      </Section>
      <Section title="8. Liability">
        <p>[Liability limits, damage claims process and insurance cover to be confirmed with legal counsel.]</p>
      </Section>
      <Section title="9. Changes and governing law">
        <p>We may update these terms and will show the new date at the top of this page. These terms are governed by the laws of India; courts in [city] have jurisdiction.</p>
      </Section>
      <Section title="10. Contact">
        <p>Questions or complaints: <Link href="/support" className="font-semibold text-[#800020] underline">support</Link>, or our grievance officer {site.grievanceOfficer} at {site.grievanceEmail}.</p>
      </Section>
    </ContentPage>
  );
}
