"use client";

import React, { useCallback, useEffect, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { api, base, Row } from "../lib/api";
import { AdminStatusBadge } from "./admin/admin-status-badge";

type CandidateTech = {
  id: string;
  name: string;
  phone?: string;
  status?: string;
  workload?: number;
  reasons?: string[];
};

type ActivityItem = {
  id: string;
  kind: string;
  title: string;
  description: string;
  actor: string;
  created_at: string;
};

type PhotoItem = {
  id: string;
  kind: string;
  url: string;
  created_at: string;
};

function formatAddress(addr: unknown): string {
  if (!addr) return "Standard residential address on record";
  if (typeof addr === "string") return addr;
  if (typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    return [a.line_1, a.locality, a.city, a.postal_code].filter(Boolean).join(", ") || "Address on record";
  }
  return String(addr);
}

function formatMoney(paise: unknown): string {
  const num = Number(paise ?? 0);
  if (Number.isNaN(num)) return "₹0";
  return `₹${(num / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function AdminBookingDrawer({
  booking,
  onClose,
  onChanged,
}: {
  booking: Row;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [liveBooking, setLiveBooking] = useState<Row>(booking);
  const [tab, setTab] = useState<"overview" | "operations" | "proof" | "slots">("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [slots, setSlots] = useState<{ id: string; start_at: string; remaining: number }[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [selectedTechId, setSelectedTechId] = useState("");
  const [balanceRupees, setBalanceRupees] = useState("");
  const [balanceMethod, setBalanceMethod] = useState<"CASH" | "UPI" | "CARD_OFFLINE" | "OTHER">("CASH");
  const [balanceNote, setBalanceNote] = useState("");
  const [closureNote, setClosureNote] = useState("");
  const [candidates, setCandidates] = useState<CandidateTech[]>([]);
  const [technicians, setTechnicians] = useState<CandidateTech[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  useEffect(() => {
    setLiveBooking(booking);
  }, [booking]);

  const refreshBooking = useCallback(async () => {
    try {
      const fresh = await api<Row>(`/operations/bookings/${booking.id}/`);
      setLiveBooking(fresh);
    } catch {
      // Fall back to parent state
    }
  }, [booking.id]);

  const loadCandidatesAndRoster = useCallback(async () => {
    try {
      const c = await api<{ candidates?: CandidateTech[] }>(`/operations/dispatch/candidates/?booking_id=${booking.id}`);
      setCandidates(c.candidates ?? []);
    } catch {
      setCandidates([]);
    }
    try {
      const t = await api<{ results?: CandidateTech[] }>("/admin/technicians/");
      setTechnicians(t.results ?? []);
    } catch {
      setTechnicians([]);
    }
  }, [booking.id]);

  const loadProofAndTimeline = useCallback(async () => {
    try {
      const [actRes, photoRes] = await Promise.all([
        api<{ results?: ActivityItem[] }>(`/admin/bookings/${booking.id}/activities/`),
        api<{ results?: PhotoItem[] }>(`/admin/bookings/${booking.id}/photos/`),
      ]);
      setActivities(actRes.results ?? []);
      setPhotos(photoRes.results ?? []);
    } catch {
      // Ignore if activities/photos fail
    }
  }, [booking.id]);

  useEffect(() => {
    void loadCandidatesAndRoster();
  }, [loadCandidatesAndRoster]);

  const loadSlots = async () => {
    try {
      const res = await api<{ slots: typeof slots }>(`/operations/bookings/${booking.id}/slots/`);
      setSlots(res.slots || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load slots.");
    }
  };

  const handleOperation = async (url: string, body: unknown = {}, successText = "Updated.") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(url, "POST", body);
      setNotice(successText);
      await refreshBooking();
      await loadCandidatesAndRoster();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedSlotId) return;
    setBusy(true);
    setError("");
    try {
      await api(`/operations/bookings/${booking.id}/reschedule/`, "POST", {
        slot_id: selectedSlotId,
        expected_version: Number(liveBooking.version ?? 1),
      });
      setNotice("Booking rescheduled successfully.");
      await refreshBooking();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reschedule.");
    } finally {
      setBusy(false);
    }
  };

  const status = String(liveBooking.status ?? "");
  const paymentStatus = String(liveBooking.payment_status ?? "UNPAID");
  const techObj =
    liveBooking.technician && typeof liveBooking.technician === "object"
      ? (liveBooking.technician as { id?: string; name?: string; phone?: string; status?: string })
      : null;
  const canConfirmRequest = ["REQUESTED", "AWAITING_PAYMENT", "PENDING_PAYMENT", "PAYMENT_FAILED", "CONFIRMED_UNPAID"].includes(status);
  const isFinal = ["CANCELLED", "EXPIRED", "CLOSED"].includes(status);
  const rosterToDisplay = candidates.length > 0 ? candidates : technicians;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity">
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Drawer Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">
                {String(liveBooking.work_order_number || liveBooking.reference || liveBooking.booking_number || "")}
              </h2>
              <AdminStatusBadge status={status} />
              <AdminStatusBadge status={paymentStatus} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Service: <span className="font-semibold text-slate-700">{String(liveBooking.service_name ?? liveBooking.service ?? "Service")}</span>
              {liveBooking.customer_code ? ` · Customer ${String(liveBooking.customer_code)}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto border-b border-slate-200 px-6 bg-slate-50/60">
          <button
            onClick={() => setTab("overview")}
            className={`border-b-2 py-3 px-4 text-xs font-bold whitespace-nowrap transition ${
              tab === "overview" ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Booking Overview
          </button>
          <button
            onClick={() => setTab("operations")}
            className={`border-b-2 py-3 px-4 text-xs font-bold whitespace-nowrap transition ${
              tab === "operations" ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Confirm, Dispatch & Actions
          </button>
          <button
            onClick={() => {
              setTab("proof");
              void loadProofAndTimeline();
            }}
            className={`border-b-2 py-3 px-4 text-xs font-bold whitespace-nowrap transition ${
              tab === "proof" ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Timeline & Proof
          </button>
          <button
            onClick={() => {
              setTab("slots");
              void loadSlots();
            }}
            className={`border-b-2 py-3 px-4 text-xs font-bold whitespace-nowrap transition ${
              tab === "slots" ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Reschedule Slot
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800 border border-red-200">{error}</div>}
          {notice && <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">{notice}</div>}

          {/* TAB 1: OVERVIEW */}
          {tab === "overview" && (
            <div className="space-y-6">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Customer & Location</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Customer</span>
                    <strong className="text-slate-900 text-sm mt-0.5 block">
                      {String(liveBooking.customer_name || "Customer")}
                    </strong>
                    <span className="text-slate-600">{String(liveBooking.customer_phone || "—")}</span>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Zone / Area</span>
                    <strong className="text-slate-900 text-sm mt-0.5 block">{String(liveBooking.zone_name ?? liveBooking.zone ?? "—")}</strong>
                  </div>
                  <div className="col-span-2 rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Address Details</span>
                    <p className="text-slate-800 mt-1">{formatAddress(liveBooking.address_text ?? liveBooking.address)}</p>
                  </div>
                  {liveBooking.problem_description ? (
                    <div className="col-span-2 rounded-lg bg-amber-50/60 p-3 border border-amber-100">
                      <span className="text-amber-800 block text-[10px] uppercase font-bold">Problem Notes</span>
                      <p className="text-slate-800 mt-1">{String(liveBooking.problem_description)}</p>
                    </div>
                  ) : null}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Service, Schedule & Money</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Package Name</span>
                    <strong className="text-slate-900 text-sm mt-0.5 block">{String(liveBooking.package_name ?? liveBooking.package ?? "Standard Service")}</strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Scheduled Time</span>
                    <strong className="text-slate-900 text-sm mt-0.5 block">
                      {liveBooking.start_at || liveBooking.slot_start
                        ? new Date(String(liveBooking.start_at ?? liveBooking.slot_start)).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                        : "Assigned Window"}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Total / Collected</span>
                    <strong className="text-slate-900 text-sm mt-0.5 block">
                      {formatMoney(liveBooking.price_paise)} · Collected {formatMoney(liveBooking.offline_collected_paise)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Balance Due</span>
                    <strong className="text-emerald-700 text-sm mt-0.5 block">
                      {paymentStatus === "PAID" ? "Paid in full" : formatMoney(liveBooking.balance_due_paise ?? liveBooking.price_paise)}
                    </strong>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Assigned Partner</h3>
                <div className="rounded-lg bg-slate-50 p-4 border border-slate-100 flex items-center justify-between">
                  <div>
                    <strong className="text-slate-900 text-sm block">
                      {techObj?.name || (typeof liveBooking.technician === "string" ? liveBooking.technician : "Unassigned")}
                    </strong>
                    <span className="text-slate-500 text-xs">
                      {techObj?.phone ? `${techObj.phone} · ${techObj.status}` : "Awaiting eligible partner assignment"}
                    </span>
                  </div>
                  <AdminStatusBadge status={techObj?.status || (techObj ? "ASSIGNED" : "UNASSIGNED")} />
                </div>
              </section>
            </div>
          )}

          {/* TAB 2: OPERATIONS & ACTIONS */}
          {tab === "operations" && (
            <div className="space-y-6">
              {/* Purple Squad Admin Request Approval / Confirmation */}
              {canConfirmRequest && (
                <section className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-700" />
                    <h3 className="text-xs font-bold uppercase tracking-wide text-teal-900">
                      Operations Approval (Make Assignable)
                    </h3>
                  </div>
                  <p className="text-xs text-teal-800">
                    Confirm this request so it moves to CONFIRMED and becomes eligible for partner dispatch.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void handleOperation(
                        `/admin/bookings/${booking.id}/confirm/`,
                        { reason: "Confirmed by operations" },
                        "Booking approved & confirmed for dispatch."
                      )
                    }
                    className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50 transition"
                  >
                    Approve & Confirm Booking
                  </button>
                </section>
              )}

              {/* Assign / Reassign Eligible Technician */}
              {!isFinal && (
                <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-1">
                    {techObj ? "Reassign Partner" : "Assign Eligible Partner"}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    {candidates.length > 0
                      ? `${candidates.length} eligible technician(s) matched by skill, service area, availability & buffer.`
                      : "Select a verified partner to assign this job."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={selectedTechId}
                      onChange={(e) => setSelectedTechId(e.target.value)}
                      className="flex-1 min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                    >
                      <option value="">Choose eligible partner...</option>
                      {rosterToDisplay.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.workload !== undefined ? `· ${t.workload} active jobs` : t.status ? `· ${t.status}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={busy || !selectedTechId}
                      onClick={() =>
                        void handleOperation(
                          `/operations/bookings/${booking.id}/${techObj ? "reassign" : "assign"}/`,
                          {
                            technician_id: selectedTechId,
                            expected_version: Number(liveBooking.version ?? 1),
                          },
                          techObj ? "Partner reassigned." : "Partner assigned."
                        )
                      }
                      className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50 transition"
                    >
                      {techObj ? "Reassign" : "Assign Partner"}
                    </button>
                  </div>
                </section>
              )}

              {/* Record Offline Balance */}
              <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Record Offline Payment / Balance</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="number"
                    min="1"
                    placeholder="Amount in ₹ INR"
                    value={balanceRupees}
                    onChange={(e) => setBalanceRupees(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                  <select
                    value={balanceMethod}
                    onChange={(e) => setBalanceMethod(e.target.value as typeof balanceMethod)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">Direct UPI</option>
                    <option value="CARD_OFFLINE">Offline Card</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    placeholder="Payment reference / receipt note"
                    value={balanceNote}
                    onChange={(e) => setBalanceNote(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                  <button
                    disabled={busy || !balanceRupees || Number(balanceRupees) <= 0}
                    onClick={() =>
                      void handleOperation(
                        `/admin/bookings/${booking.id}/record-balance/`,
                        {
                          amount_paise: Math.round(Number(balanceRupees) * 100),
                          method: balanceMethod,
                          note: balanceNote,
                        },
                        "Offline payment recorded."
                      )
                    }
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition"
                  >
                    Record Payment
                  </button>
                </div>
              </section>

              {/* Lifecycle Operations & Close Work Order */}
              {!isFinal && (
                <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Lifecycle Overrides & Close</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      disabled={busy || status === "IN_PROGRESS" || status === "COMPLETED"}
                      onClick={() =>
                        void handleOperation(
                          `/admin/bookings/${booking.id}/start/`,
                          { notes: "Started by operations" },
                          "Booking marked In-Progress."
                        )
                      }
                      className="rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50 transition"
                    >
                      Mark In-Progress
                    </button>
                    <button
                      disabled={busy || status === "COMPLETED"}
                      onClick={() =>
                        void handleOperation(
                          `/admin/bookings/${booking.id}/complete/`,
                          { notes: "Completed by operations" },
                          "Job marked Completed."
                        )
                      }
                      className="rounded-lg bg-emerald-700 p-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50 transition"
                    >
                      Mark Job Completed
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex gap-2">
                    <input
                      placeholder="Work order closure note (optional)"
                      value={closureNote}
                      onChange={(e) => setClosureNote(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    />
                    <button
                      disabled={busy}
                      onClick={() =>
                        void handleOperation(
                          `/admin/work-orders/${booking.id}/close/`,
                          { note: closureNote },
                          "Work order operationally closed."
                        )
                      }
                      className="rounded-lg bg-teal-800 px-4 py-2 text-xs font-bold text-white hover:bg-teal-900 disabled:opacity-50 transition"
                    >
                      Close Work Order
                    </button>
                  </div>
                </section>
              )}

              {/* Cancel Booking */}
              {!isFinal && status !== "COMPLETED" && (
                <section className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-red-800">Cancel Booking</h3>
                  <textarea
                    rows={2}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation..."
                    className="w-full rounded-lg border border-red-200 bg-white p-2 text-xs text-slate-900"
                  />
                  <button
                    disabled={busy || !cancelReason}
                    onClick={() =>
                      void handleOperation(
                        `/admin/bookings/${booking.id}/cancel/`,
                        { reason: cancelReason },
                        "Booking cancelled."
                      )
                    }
                    className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50 transition"
                  >
                    Confirm Cancellation
                  </button>
                </section>
              )}
            </div>
          )}

          {/* TAB 3: TIMELINE & PROOF PHOTOS */}
          {tab === "proof" && (
            <div className="space-y-6">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Completion Proof & Job Photos ({photos.length})
                </h3>
                {photos.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-400">
                    No before/after/receipt photos uploaded by the partner yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photos.map((p) => (
                      <a
                        key={p.id}
                        href={`${base}${p.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${base}${p.url}`} alt={p.kind} className="h-28 w-full object-cover" />
                        <div className="p-2 text-[11px] font-bold text-slate-700">{p.kind}</div>
                      </a>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Operational & Partner Activity Timeline
                </h3>
                {activities.length === 0 ? (
                  <p className="text-xs text-slate-400">No timeline entries recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {activities.map((act) => (
                      <div key={act.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-slate-900">{act.title}</strong>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(act.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                          </span>
                        </div>
                        {act.description ? <p className="mt-1 text-slate-600">{act.description}</p> : null}
                        <p className="mt-1 text-[11px] text-slate-500">By {act.actor}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 4: RESCHEDULE */}
          {tab === "slots" && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Available Appointment Slots</h3>
              <p className="text-xs text-slate-500">Select an open slot within the customer&apos;s service zone.</p>
              {slots.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No alternative slots available.</div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {slots.map((s) => (
                    <label
                      key={s.id}
                      className={`flex items-center justify-between p-3 rounded-lg border text-xs cursor-pointer transition ${
                        selectedSlotId === s.id
                          ? "border-teal-700 bg-teal-50/70"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="slotRadio"
                          checked={selectedSlotId === s.id}
                          onChange={() => setSelectedSlotId(s.id)}
                          className="text-teal-600 focus:ring-teal-500"
                        />
                        <span className="font-semibold text-slate-800">
                          {new Date(s.start_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        {s.remaining} capacity
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <button
                disabled={busy || !selectedSlotId}
                onClick={handleReschedule}
                className="w-full rounded-lg bg-teal-700 py-2.5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50 transition"
              >
                Confirm Reschedule
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
