"use client";

import { Copy, Gift, Share2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { bookingApi, type ReferralSummary } from "@/lib/booking-api";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** "Refer a friend" card for the signed-in customer's account page. */
export function ReferralCard() {
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    bookingApi.referral().then((res) => active && setData(res)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!data || data.referee_discount_paise <= 0) return null;
  const shareText = `Book home services on NammaPros and get ${rupees(data.referee_discount_paise)} off your first booking with my code ${data.code}.`;
  const shareUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: "NammaPros", text: shareText, url: shareUrl }).catch(() => undefined);
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, "_blank", "noopener");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(data!.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const unused = data.rewards.filter((r) => !r.used);

  return (
    <section aria-labelledby="referral-heading" className="overflow-hidden rounded-lg border border-[#EAE3DC] bg-white shadow-[0_6px_22px_rgba(28,25,23,0.05)]">
      <div className="flex items-center gap-2 border-b border-[#F4EFE9] bg-[#FCF9F6] px-5 py-3.5">
        <Gift size={16} strokeWidth={1.75} className="text-[#800020]" aria-hidden="true" />
        <h2 id="referral-heading" className="text-sm font-bold text-[#1C1917]">Refer a friend</h2>
      </div>
      <div className="space-y-3 p-5 text-xs text-[#57534E]">
        <p>
          Friends get <strong className="text-[#1C1917]">{rupees(data.referee_discount_paise)} off</strong> the advance on their first booking.
          {data.reward_paise > 0 && (
            <> You get a <strong className="text-[#1C1917]">{rupees(data.reward_paise)}</strong> code when their visit is completed.</>
          )}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border border-dashed border-[#800020]/40 bg-[#FBF1F3] px-3 py-2.5 text-center text-base font-bold tracking-[0.2em] text-[#800020]">
            {data.code}
          </code>
          <button type="button" onClick={copy} className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-[#D6CEC6] px-3 font-bold text-[#1C1917]">
            <Copy size={14} aria-hidden="true" /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <button type="button" onClick={share} className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md bg-[#800020] px-4 font-bold text-white">
          <Share2 size={14} aria-hidden="true" /> Share with friends
        </button>
        <p>
          {data.pending_count} friend{data.pending_count === 1 ? "" : "s"} waiting for their first visit ·{" "}
          {data.rewarded_count} reward{data.rewarded_count === 1 ? "" : "s"} earned
        </p>
        {unused.length > 0 && (
          <ul className="space-y-1.5" aria-label="Your reward codes">
            {unused.map((r) => (
              <li key={r.code} className="flex justify-between rounded-md bg-[#E7F3EC] px-3 py-2 font-semibold text-[#1F6B44]">
                <span>{r.code}</span>
                <span>
                  {rupees(r.amount_paise)} off
                  {r.valid_until && ` · until ${new Date(r.valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
