"use client";

import { Download, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { bookingRequest } from "@/lib/booking-api";

type DataRequests = { results: { id: string; kind: string; status: string; created_at: string; note: string }[]; deletion_days: number };

/** "Your data" controls on the account page: download a copy, or ask for the account to be deleted. */
export function DataRightsCard() {
  const [requests, setRequests] = useState<DataRequests | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    bookingRequest<DataRequests>("/account/data-requests/").then((r) => active && setRequests(r)).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const pending = requests?.results.find((r) => r.kind === "DELETE" && r.status === "RECEIVED");

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await bookingRequest<unknown>("/account/my-data/");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "nammapros-my-data.json";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Could not download your data.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    setBusy(true);
    setMessage(null);
    try {
      await bookingRequest("/account/data-requests/", "POST", { reason });
      setRequests(await bookingRequest<DataRequests>("/account/data-requests/"));
      setConfirming(false);
      setMessage({ text: "Request received. We will delete your account and let you know.", error: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Could not send the request.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="data-heading" className="overflow-hidden rounded-lg border border-[#EAE3DC] bg-white shadow-[0_6px_22px_rgba(28,25,23,0.05)]">
      <div className="flex items-center gap-2 border-b border-[#F4EFE9] bg-[#FCF9F6] px-5 py-3.5">
        <ShieldCheck size={16} strokeWidth={1.75} className="text-[#800020]" aria-hidden="true" />
        <h2 id="data-heading" className="text-sm font-bold text-[#1C1917]">Your data</h2>
      </div>
      <div className="space-y-3 p-5 text-xs text-[#57534E]">
        <button type="button" onClick={download} disabled={busy}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-[#D6CEC6] px-4 font-bold text-[#1C1917] disabled:opacity-50">
          <Download size={14} aria-hidden="true" /> Download a copy of my data
        </button>
        {pending ? (
          <p className="rounded-md bg-amber-50 p-3 text-amber-900" role="status">
            Account deletion requested on {new Date(pending.created_at).toLocaleDateString("en-IN")}. We complete it within{" "}
            {requests?.deletion_days ?? 30} days.
          </p>
        ) : confirming ? (
          <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-red-900">
              This removes your name, phone, addresses and reviews. Past booking and payment records are kept without your
              personal details, as tax law requires. Open bookings must be completed or cancelled first.
            </p>
            <label className="block font-semibold text-[#1C1917]" htmlFor="delete-reason">Reason (optional)</label>
            <input id="delete-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)}
              className="min-h-[40px] w-full rounded-md border border-[#D6CEC6] px-3 text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={requestDeletion} disabled={busy}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-red-700 px-4 font-bold text-white disabled:opacity-50">
                Yes, delete my account
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="min-h-[44px] rounded-md border border-[#D6CEC6] px-4 font-bold">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md px-4 font-bold text-red-700 hover:bg-red-50">
            <Trash2 size={14} aria-hidden="true" /> Delete my account
          </button>
        )}
        {message && <p role={message.error ? "alert" : "status"} className={message.error ? "font-semibold text-red-700" : "font-semibold text-emerald-800"}>{message.text}</p>}
        <p>See our <Link href="/privacy-policy" className="font-semibold text-[#800020] underline">privacy policy</Link>.</p>
      </div>
    </section>
  );
}

