import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Section } from "@/components/content-page";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What personal data NammaPros collects, why, who we share it with, and your rights.",
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPage() {
  return (
    <ContentPage white eyebrow="Policies" title="Privacy policy" updated={site.policyUpdated}
      intro={<>This policy explains how {site.legalName} handles your personal data when you use NammaPros.</>}>
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        Draft for legal review against the Digital Personal Data Protection Act, 2023. Replace bracketed details before launch.
      </p>
      <Section title="What we collect">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Account:</strong> phone number and, if you add them, name and email.</li>
          <li><strong>Bookings:</strong> service addresses (and map location if you pick one), slots, problem descriptions, photos you upload, reviews.</li>
          <li><strong>Payments:</strong> payment status and references from our payment partner. We do not store card numbers or UPI PINs.</li>
          <li><strong>Visit tracking:</strong> while a professional is on the way, their phone shares its location so you can see the arrival time. Sharing stops when they arrive.</li>
          <li><strong>Device:</strong> basic technical data such as browser type and IP address, used for security.</li>
        </ul>
      </Section>
      <Section title="Why we use it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>To take, schedule and complete your bookings and send updates (SMS, WhatsApp, email or push, as you choose).</li>
          <li>To process payments, refunds and invoices, and meet tax and legal obligations.</li>
          <li>To keep the service safe, prevent fraud and resolve complaints.</li>
        </ul>
      </Section>
      <Section title="Who we share it with">
        <p>
          The professional assigned to your booking sees your name, phone and address for that visit only. We use service providers for payments,
          messaging, maps and hosting, who process data on our instructions. We do not sell your personal data.
        </p>
      </Section>
      <Section title="How long we keep it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Booking, payment and invoice records: as long as tax and accounting law requires. If you delete your account, these are kept without your name, phone or address.</li>
          <li>Partner KYC documents: deleted {process.env.NEXT_PUBLIC_KYC_RETENTION_REJECTED_DAYS ?? "90"} days after an application is rejected, and {process.env.NEXT_PUBLIC_KYC_RETENTION_OFFBOARDED_DAYS ?? "365"} days after a partner leaves.</li>
          <li>Other personal data: only as long as needed for the purposes above, or until you ask us to delete it.</li>
        </ul>
      </Section>
      <Section title="Your choices and rights">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Update addresses and message preferences in your <Link href="/account" className="font-semibold text-[#800020] underline">account</Link>.</li>
          <li>Download a copy of your data, or request deletion of your account, from your <Link href="/account" className="font-semibold text-[#800020] underline">account page</Link>. Deletion is completed within 30 days.</li>
          <li>Ask for a correction, or withdraw consent, by contacting our grievance officer.</li>
          <li>Refer friends only with their permission.</li>
        </ul>
      </Section>
      <Section title="Grievance officer">
        <p>{site.grievanceOfficer}, {site.grievanceEmail}, {site.legalAddress}</p>
      </Section>
    </ContentPage>
  );
}
