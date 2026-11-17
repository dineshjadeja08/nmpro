import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage, Section } from "@/components/content-page";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cancellation & refund policy",
  description: "How to reschedule or cancel a NammaPros booking, when it is free, and how refunds and rework work.",
  alternates: { canonical: "/cancellation-policy" },
};

export default function CancellationPolicyPage() {
  return (
    <ContentPage white eyebrow="Policies" title="Cancellation & refund policy" updated={site.policyUpdated}
      intro="We keep this simple: change your plans for free before the cut-off, and get your money back if we can't serve you.">
      <Section title="Rescheduling">
        <p>
          You can move your visit to another available slot from your{" "}
          <Link href="/bookings" className="font-semibold text-[#800020] underline">booking page</Link> at no cost until the
          reschedule cut-off shown on that booking (it depends on the service). After the cut-off, contact support and we will try to help.
        </p>
      </Section>
      <Section title="Cancelling">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Bookings not yet paid online can be cancelled from the booking page free of charge until the cancellation cut-off shown on the booking.</li>
          <li>For bookings with an advance or full online payment, contact support to cancel. If you cancel before the cut-off, the amount paid is refunded in full.</li>
          <li>If you cancel after the cut-off or the professional has already started travelling, a visit charge may apply. We will tell you the amount before you confirm the cancellation.</li>
          <li>If we cancel, cannot find an available professional, or the professional does not arrive, you get a full refund.</li>
        </ul>
      </Section>
      <Section title="Refunds">
        <p>
          Approved refunds go back to the original payment method. The bank or UPI app usually shows the refund within 5–7 working days after approval.
          Cash or direct UPI payments made at the visit are refunded by bank transfer or UPI to an account you choose.
        </p>
      </Section>
      <Section title="Extra work and spare parts">
        <p>
          Extra repairs or parts are charged only after you approve the technician&apos;s itemised quotation in the app. If you decline, you pay only
          for the booked service or inspection.
        </p>
      </Section>
      <Section title={`${site.reworkDays}-day rework`}>
        <p>
          If the same problem returns within {site.reworkDays} days of the visit, we send a professional back to fix it at no labour cost.
          New parts needed because of a different fault are quoted separately. Physical damage, misuse or work by someone else is not covered.
        </p>
      </Section>
      <Section title="Offers and referral codes">
        <p>If a booking that used an offer or referral code is cancelled, the code becomes available to use again where its rules allow.</p>
      </Section>
      <Section title="Need help?">
        <p>
          <Link href="/support" className="font-semibold text-[#800020] underline">Contact support</Link> with your booking ID.
        </p>
      </Section>
    </ContentPage>
  );
}
