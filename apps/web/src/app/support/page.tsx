import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Mail, MessageCircle, Phone, ReceiptText, ShieldCheck } from "lucide-react";
import { ContentPage, Section } from "@/components/content-page";
import { site, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Help & support",
  description: "Get help with a NammaPros booking: reschedule, cancel, payments, invoices and service issues.",
  alternates: { canonical: "/support" },
};

const topics = [
  { icon: CalendarClock, title: "Reschedule or cancel", body: "Open the booking and use Reschedule or Cancel. Free before the cut-off shown on your booking.", href: "/bookings" },
  { icon: ReceiptText, title: "Payments & invoices", body: "See what you paid, what is due at the visit, and download invoices.", href: "/payments" },
  { icon: ShieldCheck, title: "Problem came back?", body: `Rework is free within ${site.reworkDays} days of the visit. Reply on WhatsApp with your booking ID.`, href: "/cancellation-policy" },
];

export default function SupportPage() {
  const wa = whatsappLink();
  return (
    <ContentPage
      eyebrow="We're here to help"
      title="Help & support"
      intro={<>Most questions are answered from your booking page. For anything else, message us — we reply within working hours ({site.supportHours}).</>}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {topics.map(({ icon: Icon, title, body, href }) => (
          <Link key={title} href={href} className="rounded-lg border border-[#EAE3DC] bg-white p-4 transition hover:border-[#800020]/40">
            <Icon size={20} strokeWidth={1.75} className="text-[#800020]" aria-hidden="true" />
            <h2 className="mt-2 text-sm font-bold text-[#1C1917]">{title}</h2>
            <p className="mt-1 text-xs text-[#57534E]">{body}</p>
          </Link>
        ))}
      </div>

      <Section title="Contact us">
        <ul className="space-y-2">
          {wa && (
            <li>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#1F7A4D] px-4 text-sm font-bold text-white">
                <MessageCircle size={16} aria-hidden="true" /> Chat on WhatsApp <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          )}
          {site.supportPhone && (
            <li className="flex items-center gap-2">
              <Phone size={16} className="text-[#800020]" aria-hidden="true" />
              <a href={`tel:${site.supportPhone.replace(/\s/g, "")}`} className="font-semibold text-[#800020] underline">{site.supportPhone}</a>
            </li>
          )}
          {site.supportEmail && (
            <li className="flex items-center gap-2">
              <Mail size={16} className="text-[#800020]" aria-hidden="true" />
              <a href={`mailto:${site.supportEmail}`} className="font-semibold text-[#800020] underline">{site.supportEmail}</a>
            </li>
          )}
          {!wa && !site.supportPhone && !site.supportEmail && (
            <li className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">[Support phone, email and WhatsApp number to be added]</li>
          )}
        </ul>
        <p className="text-sm text-[#57534E]">Please keep your booking ID (for example NP-…) ready. We never ask for your OTP, card number or UPI PIN.</p>
      </Section>

      <Section title="Common questions">
        <p>
          See the <Link href="/faq" className="font-semibold text-[#800020] underline">FAQs</Link>, the{" "}
          <Link href="/cancellation-policy" className="font-semibold text-[#800020] underline">cancellation &amp; refund policy</Link>, or{" "}
          <Link href="/terms" className="font-semibold text-[#800020] underline">terms of service</Link>.
        </p>
      </Section>

      <Section title="Grievance officer">
        <p>
          If your issue is not resolved, write to our grievance officer, {site.grievanceOfficer}, at {site.grievanceEmail}.
          We acknowledge complaints within 48 hours and aim to resolve them within 30 days.
        </p>
      </Section>
    </ContentPage>
  );
}
