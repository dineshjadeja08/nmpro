import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, IndianRupee, MapPin, Wrench } from "lucide-react";
import { ContentPage, Section } from "@/components/content-page";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About NammaPros",
  description: "NammaPros connects homes in Chennai and Tamil Nadu with verified local professionals, with prices shown before you book.",
  alternates: { canonical: "/about" },
};

const promises = [
  { icon: BadgeCheck, title: "Verified professionals", body: "Identity, address and skills are checked before a pro can take jobs." },
  { icon: IndianRupee, title: "Price before you book", body: "Packages show what is included and not included. Extra work needs your approval." },
  { icon: Wrench, title: `${site.reworkDays}-day rework`, body: "If the same problem returns, we send a pro back at no cost." },
  { icon: MapPin, title: "Local first", body: "Starting in Chennai, growing area by area across Tamil Nadu." },
];

export default function AboutPage() {
  return (
    <ContentPage eyebrow="Namma area, namma pros" title="About NammaPros"
      intro="We make it simple to get things fixed at home — from AC service and appliance repair to tank cleaning — with local professionals you can trust.">
      <div className="grid gap-3 sm:grid-cols-2">
        {promises.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg border border-[#EAE3DC] bg-white p-4">
            <Icon size={20} strokeWidth={1.75} className="text-[#800020]" aria-hidden="true" />
            <h2 className="mt-2 text-sm font-bold text-[#1C1917]">{title}</h2>
            <p className="mt-1 text-sm text-[#57534E]">{body}</p>
          </div>
        ))}
      </div>
      <Section title="How it works">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Choose a service and see the price.</li>
          <li>Pick a time slot that suits you and confirm with a one-time code.</li>
          <li>Track your pro, approve any extra work in the app, and pay the way that suits you.</li>
        </ol>
      </Section>
      <Section title="Work with us">
        <p>
          Skilled technician? <Link href="/join-as-technician" className="font-semibold text-[#800020] underline">Join as a professional</Link> for steady jobs in your area.
        </p>
      </Section>
      <Section title="Company details">
        <p>{site.legalName}<br />{site.legalAddress}</p>
      </Section>
    </ContentPage>
  );
}
