import type { Metadata } from "next";
import { BadgeCheck, CalendarClock, IndianRupee, Smartphone } from "lucide-react";
import { ContentPage, Section } from "@/components/content-page";

export const metadata: Metadata = {
  title: "Join NammaPros as a professional",
  description: "Skilled technician in Chennai or Tamil Nadu? Request to join NammaPros for steady home-service jobs.",
  alternates: { canonical: "/join-as-technician" },
};

const PARTNER_APP_URL = process.env.NEXT_PUBLIC_PARTNER_APP_URL ?? "http://localhost:3001";

const steps = [
  { icon: Smartphone, title: "1. Request to join", body: "Open the NammaPros Partner app and fill in your skills, areas and ID proof." },
  { icon: BadgeCheck, title: "2. KYC check", body: "Our team verifies your identity, address and skills and calls you." },
  { icon: CalendarClock, title: "3. Start getting jobs", body: "Once approved, sign in with your mobile number (OTP) to see assigned jobs." },
  { icon: IndianRupee, title: "4. Track earnings", body: "See earnings by day, month or custom dates and download statements and invoices." },
];

export default function JoinAsTechnicianPage() {
  return (
    <ContentPage eyebrow="For professionals" title="Join NammaPros as a pro"
      intro="Steady home-service jobs in your area, clear earnings, and support when you need it.">
      <div className="grid gap-3 sm:grid-cols-2">
        {steps.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg border border-[#EAE3DC] bg-white p-4">
            <Icon size={20} strokeWidth={1.75} className="text-[#800020]" aria-hidden="true" />
            <h2 className="mt-2 text-sm font-bold text-[#1C1917]">{title}</h2>
            <p className="mt-1 text-sm text-[#57534E]">{body}</p>
          </div>
        ))}
      </div>
      <Section title="Ready to apply?">
        <a href={`${PARTNER_APP_URL}/join`} className="inline-flex min-h-[48px] items-center rounded-md bg-[#800020] px-6 text-sm font-bold text-white">
          Request to join
        </a>
        <p className="text-sm text-[#57534E]">Already approved? <a href={`${PARTNER_APP_URL}/login`} className="font-semibold text-[#800020] underline">Log in to the partner app</a>.</p>
      </Section>
    </ContentPage>
  );
}
