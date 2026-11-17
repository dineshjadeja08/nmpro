import type { Metadata } from "next";
import Link from "next/link";
import type { FaqItem } from "@nammapros/types";
import { ContentPage } from "@/components/content-page";
import { api } from "@/lib/catalog";
import { site, toParagraphs } from "@/lib/site";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Answers about booking, pricing, payments, cancellations, technicians and warranty at NammaPros.",
  alternates: { canonical: "/faq" },
};

const BUILT_IN: FaqItem[] = [
  { id: "b1", question: "How do I book a service?", answer: "Pick a service, choose a time slot, confirm your address and verify your phone with a one-time code. You see the full price before you confirm.", service_id: null, category_id: null },
  { id: "b2", question: "Do I pay before the visit?", answer: "It depends on the service. Some are paid at the visit, some need a small advance to hold the slot. Checkout always shows what is due now and what is due at the visit.", service_id: null, category_id: null },
  { id: "b3", question: "What if extra parts or repairs are needed?", answer: "The technician sends an itemised quotation to your phone. Nothing extra is done or charged unless you approve it.", service_id: null, category_id: null },
  { id: "b4", question: "Can I reschedule or cancel?", answer: "Yes, from your booking page, free of charge until the cut-off time shown on the booking. See the cancellation policy for details.", service_id: null, category_id: null },
  { id: "b5", question: "Are the technicians verified?", answer: "Every professional's identity, address and skills are checked before they can accept jobs.", service_id: null, category_id: null },
  { id: "b6", question: "What if the problem comes back?", answer: `Rework for the same issue is free within ${site.reworkDays} days of the visit. Contact support with your booking ID.`, service_id: null, category_id: null },
  { id: "b7", question: "How do offer and referral codes work?", answer: "Enter the code at checkout. Referral codes work on your first booking. Only one code can be used per booking.", service_id: null, category_id: null },
];

export default async function FaqPage() {
  const remote = await api.faqs().then((r) => r.results).catch(() => [] as FaqItem[]);
  const general = remote.filter((f) => !f.service_id && !f.category_id);
  const faqs = general.length > 0 ? general : BUILT_IN;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: toParagraphs(f.answer).join(" ") },
    })),
  };
  return (
    <ContentPage eyebrow="Help" title="Frequently asked questions"
      intro={<>Can&apos;t find your answer? <Link href="/support" className="font-semibold text-[#800020] underline">Contact support</Link>.</>}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="space-y-2.5">
        {faqs.map((f) => (
          <details key={f.id} className="group rounded-lg border border-[#EAE3DC] bg-white px-4 py-3 open:shadow-sm">
            <summary className="flex min-h-[32px] cursor-pointer list-none items-center justify-between gap-3 font-semibold text-[#1C1917]">
              {f.question}
              <span aria-hidden="true" className="text-[#800020] transition group-open:rotate-45">+</span>
            </summary>
            <div className="mt-2 space-y-2 text-sm text-[#57534E]">
              {toParagraphs(f.answer).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </details>
        ))}
      </div>
    </ContentPage>
  );
}
