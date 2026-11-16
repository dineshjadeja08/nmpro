"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type DataRequestRow = { id: string; phone: string; status: "RECEIVED" | "COMPLETED" | "REJECTED"; reason: string;
  created_at: string; completed_at: string | null; due_by: string; note: string };

/** Account deletion requests (DPDP Act). Completing one removes personal details; bookings and payments are kept. */
export function DataRequestsManager() {
  const [rows, setRows] = useState<DataRequestRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      setRows((await api<{ results: DataRequestRow[] }>("/admin/data-requests/")).results ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load requests.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (row: DataRequestRow, action: "complete" | "reject") => {
    if (action === "complete" && !window.confirm(`Delete personal details for ${row.phone}? This cannot be undone.`)) return;
    setBusy(true);
    setErr("");
    try {
      await api(`/admin/data-requests/${row.id}/${action}/`, "POST", { note: notes[row.id] ?? "" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Account deletion requests</h2>
      <p className="mb-4 text-xs text-slate-500">
        Completing a request removes the person&apos;s name, phone, addresses, reviews and KYC files. Booking, payment and
        invoice records are kept without personal details for tax records. Open bookings must be closed first.
      </p>
      {err && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-left font-bold uppercase text-slate-500">
              <th className="p-3">Phone</th><th className="p-3">Received</th><th className="p-3">Due by</th>
              <th className="p-3">Reason</th><th className="p-3">Status</th><th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">No deletion requests.</td></tr>
            ) : rows.map((r) => {
              const overdue = r.status === "RECEIVED" && new Date(r.due_by) < new Date();
              return (
                <tr key={r.id}>
                  <td className="p-3 font-semibold text-slate-900">{r.phone || "—"}</td>
                  <td className="p-3">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                  <td className={`p-3 ${overdue ? "font-bold text-red-700" : ""}`}>{new Date(r.due_by).toLocaleDateString("en-IN")}{overdue ? " (overdue)" : ""}</td>
                  <td className="max-w-xs p-3 text-slate-600">{r.reason || "—"}</td>
                  <td className="p-3">{r.status === "RECEIVED" ? "Waiting" : r.status === "COMPLETED" ? "Deleted" : `Rejected${r.note ? `: ${r.note}` : ""}`}</td>
                  <td className="p-3">
                    {r.status === "RECEIVED" && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input aria-label="Note" placeholder="Note (optional)" maxLength={300} value={notes[r.id] ?? ""}
                          onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                          className="w-36 rounded border border-slate-300 px-2 py-1" />
                        <button disabled={busy} onClick={() => act(r, "complete")} className="rounded bg-red-700 px-2.5 py-1 font-bold text-white disabled:opacity-50">Delete data</button>
                        <button disabled={busy} onClick={() => act(r, "reject")} className="rounded border border-slate-300 px-2.5 py-1 font-semibold disabled:opacity-50">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
