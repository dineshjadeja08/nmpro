"use client";

import { AlertTriangle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { bookingRequest } from "@/lib/booking-api";

type Complaint = { id: string; reference: string; type: string; status: string; subject: string; created_at: string;
  updates: { text: string; status: string; at: string }[] };
type ComplaintList = { results: Complaint[]; types: { code: string; label: string }[] };

const STATUS_TEXT: Record<string, string> = {
  OPEN: "Received", ACKNOWLEDGED: "Being looked at", IN_PROGRESS: "Being looked at", RESOLVED: "Resolved", CLOSED: "Closed",
};

/** "Report a problem" for a booking: overcharging, quality, behaviour, no-show or damage. */
export function ReportProblem({ bookingId, hasProfessional }: { bookingId: string; hasProfessional: boolean }) {
  const [data, setData] = useState<ComplaintList | null>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [paid, setPaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const load = () => bookingRequest<ComplaintList>(`/bookings/${bookingId}/complaints/`).then(setData).catch(() => undefined);
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const active = data?.results.find((c) => !["RESOLVED", "CLOSED"].includes(c.status));
  const types = (data?.types ?? []).filter((t) => hasProfessional || t.code === "NO_SHOW");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const amount = paid.trim() ? Math.round(Number(paid) * 100) : null;
      const created = await bookingRequest<Complaint>(`/bookings/${bookingId}/complaints/`, "POST",
        { type, description, amount_paid_paise: amount });
      setMessage({ text: `Complaint ${created.reference} received. Our team will contact you.`, error: false });
      setOpen(false);
      setDescription("");
      setPaid("");
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Could not send. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  return (
    <section aria-labelledby="problem-heading" className="rounded-lg border border-[#EAE3DC] bg-white p-4">
      <h2 id="problem-heading" className="flex items-center gap-2 text-sm font-bold text-[#1C1917]">
        <AlertTriangle size={16} className="text-[#9A3412]" aria-hidden="true" /> Problem with this visit?
      </h2>
      {data.results.map((c) => (
        <div key={c.id} className="mt-3 rounded-md bg-[#FBF8F5] p-3 text-xs">
          <p className="font-bold text-[#1C1917]">{c.reference} · {STATUS_TEXT[c.status] ?? c.status}</p>
          <p className="text-[#57534E]">{c.subject}</p>
          {c.updates.map((u, i) => <p key={i} className="mt-1 text-[#44403C]">{u.text}</p>)}
        </div>
      ))}
      {message && <p role={message.error ? "alert" : "status"} className={`mt-2 text-xs font-semibold ${message.error ? "text-red-700" : "text-emerald-800"}`}>{message.text}</p>}
      {!active && !open && (
        <button type="button" onClick={() => setOpen(true)}
          className="mt-3 inline-flex min-h-[44px] items-center rounded-md border border-[#D6CEC6] px-4 text-xs font-bold text-[#1C1917]">
          Report a problem
        </button>
      )}
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-3 text-xs">
          <fieldset>
            <legend className="mb-1.5 font-semibold text-[#1C1917]">What went wrong?</legend>
            <div className="space-y-1.5">
              {types.map((t) => (
                <label key={t.code} className="flex min-h-[36px] items-center gap-2">
                  <input type="radio" name="problem-type" value={t.code} checked={type === t.code} onChange={() => setType(t.code)} className="h-4 w-4 accent-[#800020]" />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          {type === "OVERCHARGED" && (
            <label className="block font-semibold text-[#1C1917]">How much did you pay the professional (₹)?
              <input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d.]/g, ""))}
                className="mt-1 min-h-[40px] w-full rounded-md border border-[#D6CEC6] px-3 text-sm" />
            </label>
          )}
          <label className="block font-semibold text-[#1C1917]">Tell us what happened
            <textarea required minLength={10} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}
              className="mt-1 min-h-[90px] w-full rounded-md border border-[#D6CEC6] p-3 text-sm" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !type || description.trim().length < 10}
              className="min-h-[44px] flex-1 rounded-md bg-[#800020] px-4 font-bold text-white disabled:opacity-50">Send</button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] rounded-md border border-[#D6CEC6] px-4 font-bold">Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
