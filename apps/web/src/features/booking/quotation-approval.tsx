"use client";

import { Check, MessageSquare, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { bookingApi, type JobQuotation } from "@/lib/booking-api";

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export function QuotationApproval({
  bookingId,
  technicianPhone,
}: {
  bookingId: string;
  technicianPhone?: string;
}) {
  const [quotes, setQuotes] = useState<JobQuotation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [discussingId, setDiscussingId] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      bookingApi
        .quotations(bookingId)
        .then((data) => setQuotes(data.quotations))
        .catch((e) => setError(e instanceof Error ? e.message : "Quotations could not load.")),
    [bookingId]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  async function decide(quoteId: string, action: "approve" | "reject") {
    setBusy(true);
    setError("");
    try {
      await bookingApi.quotationDecision(bookingId, quoteId, action);
      await reload();
      setDiscussingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!quotes.length && !error) return null;

  return (
    <section
      className="rounded-[20px] bg-white p-6 shadow-[0_10px_30px_rgba(28,25,23,0.06)] space-y-4"
      aria-label="Additional work quotations"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f5ebe8] text-[#800020]">
          <Wrench size={18} strokeWidth={1.5} />
        </span>
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1C1917]">Parts &amp; extra work quote</h2>
          <p className="mt-0.5 text-xs text-[#57534E]">
            Review each part added by your technician. Work only starts after you tap Approve.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-4">
        {quotes.map((q) => {
          const isPending = q.status === "SUBMITTED";
          const expired = new Date(q.valid_until) <= new Date();
          return (
            <div key={q.id} className="rounded-2xl bg-[#FBF8F5] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#57534E]">Status</span>
                <span
                  className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                    q.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-800"
                      : q.status === "REJECTED"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {q.status.replaceAll("_", " ")}
                </span>
              </div>

              <div className="space-y-2 border-y border-[#E8E1DB] py-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#57534E]">Additional labour</span>
                  <strong className="text-[#1C1917]">{money(q.labour_paise)}</strong>
                </div>
                {q.items.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-[#1C1917]">
                      {item.description} × {item.quantity}
                    </span>
                    <strong className="text-[#1C1917]">{money(item.total_paise)}</strong>
                  </div>
                ))}
                {q.tax_paise > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#57534E]">Tax</span>
                    <strong className="text-[#1C1917]">{money(q.tax_paise)}</strong>
                  </div>
                )}
              </div>

              <div className="flex items-baseline justify-between text-sm font-bold text-[#1C1917]">
                <span>Additional quote total</span>
                <span className="text-base text-[#800020]">{money(q.total_paise)}</span>
              </div>

              {isPending && (
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      disabled={busy || expired}
                      onClick={() => void decide(q.id, "approve")}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-[#800020] px-5 text-xs font-bold text-white shadow-sm hover:bg-[#5e0017] disabled:opacity-50"
                    >
                      <Check size={15} strokeWidth={1.75} /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscussingId(discussingId === q.id ? null : q.id)}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full border border-[#D6CEC6] bg-white px-5 text-xs font-bold text-[#1C1917] hover:border-[#800020]"
                    >
                      <MessageSquare size={15} strokeWidth={1.5} className="text-[#800020]" /> Discuss
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(q.id, "reject")}
                      aria-label="Decline extra work"
                      className="inline-flex min-h-[48px] items-center justify-center gap-1 rounded-full border border-[#E8E1DB] bg-white px-4 text-xs font-semibold text-[#57534E] hover:text-rose-700"
                    >
                      <X size={15} strokeWidth={1.5} /> Decline
                    </button>
                  </div>

                  {discussingId === q.id && (
                    <div className="rounded-xl border border-[#E8E1DB] bg-white p-3.5 text-xs text-[#57534E] space-y-2">
                      <p>
                        Ask your technician to clarify why this component is needed before approving, or continue with only your booked visit.
                      </p>
                      {technicianPhone && (
                        <a
                          href={`tel:${technicianPhone}`}
                          className="inline-flex font-bold text-[#800020] underline"
                        >
                          Call technician ({technicianPhone})
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
