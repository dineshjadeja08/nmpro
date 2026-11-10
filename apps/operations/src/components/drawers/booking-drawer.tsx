"use client";

import type { OpsBooking, OpsCandidate } from "@nammapros/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  Image as ImageIcon,
  Send,
  ShieldAlert,
  UserCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { ActionDialog } from "@/components/ops/ops-action-dialog";
import { PhoneActions } from "@/components/ops/ops-contact-actions";
import { DetailDrawer } from "@/components/ops/ops-detail-drawer";
import { MapPanel } from "@/components/ops/ops-map-panel";
import { useOpsUi } from "@/components/ops/ops-providers";
import { ErrorState, Timeline } from "@/components/ops/ops-states";
import { SlaChip, StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime, formatMoneyPaise } from "@/lib/format";
import { formatStatusLabel, getBookingAllowedActions, getEffectiveSlaDeadline } from "@/lib/status";

type TabId = "overview" | "timeline" | "notes" | "quotation" | "photos";

type PendingAction =
  | { kind: "assign" | "reassign" | "offer"; candidate: OpsCandidate }
  | { kind: "reschedule"; slotId: string; slotLabel: string }
  | { kind: "cancel" | "confirm" | "start" | "complete" }
  | { kind: "record-balance" }
  | null;

export function BookingDrawer({
  bookingId,
  slaDeadlineOverride,
  focusActionSignal,
  onClose,
}: {
  bookingId: string | null;
  slaDeadlineOverride?: string | null;
  focusActionSignal?: { type: "assign" | "note" | "reschedule"; seq: number } | null;
  onClose: () => void;
}) {
  const { toast } = useOpsUi();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("overview");
  const [noteText, setNoteText] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [balanceRupees, setBalanceRupees] = useState("");
  const [balanceMethod, setBalanceMethod] = useState("UPI");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const assignSectionRef = useRef<HTMLDivElement | null>(null);

  const bookingQuery = useQuery({
    queryKey: ["ops", "booking", bookingId],
    queryFn: () => api.booking(bookingId as string),
    enabled: Boolean(bookingId),
  });

  const candidatesQuery = useQuery({
    queryKey: ["ops", "candidates", bookingId],
    queryFn: () => api.candidates(bookingId as string),
    enabled: Boolean(bookingId),
  });

  const slotsQuery = useQuery({
    queryKey: ["ops", "booking-slots", bookingId],
    queryFn: () => api.bookingSlots(bookingId as string),
    enabled: Boolean(bookingId && bookingQuery.data?.status === "CONFIRMED_UNPAID"),
  });

  useEffect(() => {
    if (!focusActionSignal || !bookingId) return;
    const id = window.setTimeout(() => {
      if (focusActionSignal.type === "note") {
        setTab("notes");
        window.setTimeout(() => noteInputRef.current?.focus(), 40);
      } else if (focusActionSignal.type === "assign") {
        setTab("overview");
        window.setTimeout(() => assignSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
      } else if (focusActionSignal.type === "reschedule") {
        setTab("overview");
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [focusActionSignal, bookingId]);

  const invalidateBooking = () => {
    void queryClient.invalidateQueries({ queryKey: ["ops", "booking", bookingId] });
    void queryClient.invalidateQueries({ queryKey: ["ops", "bookings"] });
    void queryClient.invalidateQueries({ queryKey: ["ops", "dispatch"] });
    void queryClient.invalidateQueries({ queryKey: ["ops", "dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["ops", "schedule"] });
  };

  const actionMutation = useMutation({
    mutationFn: async ({ action, body }: { action: string; body: unknown }) =>
      api.bookingAction(bookingId as string, action, body),
    onMutate: async ({ action }) => {
      await queryClient.cancelQueries({ queryKey: ["ops", "booking", bookingId] });
      const prev = queryClient.getQueryData<OpsBooking>(["ops", "booking", bookingId]);
      if (prev && action === "cancel") {
        queryClient.setQueryData<OpsBooking>(["ops", "booking", bookingId], { ...prev, status: "CANCELLED" });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["ops", "booking", bookingId], ctx.prev);
      }
      toast("error", "Action failed", err instanceof Error ? err.message : "Could not update booking.");
    },
    onSuccess: () => {
      toast("success", "Booking updated");
      setPendingAction(null);
      setSelectedSlotId("");
      invalidateBooking();
    },
  });

  const noteMutation = useMutation({
    mutationFn: (text: string) => api.bookingNote(bookingId as string, text),
    onSuccess: () => {
      toast("success", "Operator note saved");
      setNoteText("");
      void queryClient.invalidateQueries({ queryKey: ["ops", "booking", bookingId] });
    },
    onError: (err) => {
      toast("error", "Could not add note", err instanceof Error ? err.message : "Failed to save note.");
    },
  });

  const booking = bookingQuery.data;
  const actions = booking ? getBookingAllowedActions(booking) : null;
  const slaDeadline = booking ? getEffectiveSlaDeadline(booking, slaDeadlineOverride) : null;

  async function runConfirmedAction(reason: string) {
    if (!booking || !pendingAction) return;
    if (pendingAction.kind === "assign" || pendingAction.kind === "reassign" || pendingAction.kind === "offer") {
      await actionMutation.mutateAsync({
        action: pendingAction.kind,
        body: {
          technician_id: pendingAction.candidate.id,
          expected_version: booking.version,
          ...(reason ? { reason } : {}),
        },
      });
    } else if (pendingAction.kind === "reschedule") {
      await actionMutation.mutateAsync({
        action: "reschedule",
        body: {
          slot_id: pendingAction.slotId,
          expected_version: booking.version,
        },
      });
    } else if (pendingAction.kind === "cancel") {
      await actionMutation.mutateAsync({
        action: "cancel",
        body: {
          expected_version: booking.version,
          reason,
        },
      });
    } else if (pendingAction.kind === "confirm" || pendingAction.kind === "start" || pendingAction.kind === "complete") {
      await actionMutation.mutateAsync({
        action: pendingAction.kind,
        body: { expected_version: booking.version, ...(reason ? { reason } : {}) },
      });
    } else if (pendingAction.kind === "record-balance") {
      const amountPaise = Math.round(Number(balanceRupees || 0) * 100);
      if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
        toast("error", "Enter a valid balance amount in ₹.");
        return;
      }
      await actionMutation.mutateAsync({
        action: "record-balance",
        body: { amount_paise: amountPaise, method: balanceMethod, ...(reason ? { notes: reason } : {}) },
      });
    }
  }

  return (
    <>
      <DetailDrawer
        open={Boolean(bookingId)}
        onClose={onClose}
        title={
          booking ? (
            <>
              <span className="font-mono">{booking.reference}</span>
              <StatusBadge status={booking.status} />
              <SlaChip deadlineAt={slaDeadline} />
            </>
          ) : (
            "Loading booking..."
          )
        }
        subtitle={
          booking ? `${booking.service} · ${booking.package} · v${booking.version}` : bookingId ?? undefined
        }
      >
        {bookingQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded bg-[var(--op-border)]" />
            <div className="h-32 animate-pulse rounded bg-[var(--op-border)]" />
          </div>
        ) : bookingQuery.isError ? (
          <ErrorState
            message={
              bookingQuery.error instanceof Error
                ? bookingQuery.error.message
                : "Could not load booking details."
            }
            onRetry={() => void bookingQuery.refetch()}
          />
        ) : booking && actions ? (
          <div className="space-y-4">
            {/* Tabs */}
            <div role="tablist" className="flex border-b border-[var(--op-border)]">
              {(
                [
                  ["overview", "Overview"],
                  ["timeline", `Timeline (${booking.timeline?.length ?? 0})`],
                  ["notes", `Notes (${booking.notes?.length ?? 0})`],
                  ["quotation", "Quotation"],
                  ["photos", "Photos"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`border-b-2 px-3 py-2 text-[12px] font-semibold transition ${
                    tab === id
                      ? "border-[var(--op-brand)] text-[var(--op-brand)]"
                      : "border-transparent text-[var(--op-muted)] hover:text-[var(--op-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="space-y-4">
                {/* Quick operational links & badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--op-border)] bg-[var(--op-surface-alt)] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={booking.payment_status} />
                    {booking.priority === "URGENT" && <StatusBadge status="URGENT" />}
                    {booking.invoice_number && (
                      <span className="font-mono text-[11px] text-[var(--op-muted)]">
                        Inv: {booking.invoice_number}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[12px]">
                    <Link
                      href={`/support?booking=${booking.id}&customer=${booking.customer_id}`}
                      className="font-medium text-[var(--op-brand)] hover:underline"
                    >
                      + Ticket
                    </Link>
                    <Link
                      href={`/escalations?booking=${booking.id}`}
                      className="font-medium text-red-600 hover:underline"
                    >
                      + Escalate
                    </Link>
                  </div>
                </div>

                {/* Customer card */}
                <section className="rounded border border-[var(--op-border)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                      Customer
                    </h3>
                    <Link
                      href={`/customers?customer=${booking.customer_id}`}
                      className="text-[12px] font-semibold text-[var(--op-brand)] hover:underline"
                    >
                      Customer profile →
                    </Link>
                  </div>
                  <p className="mt-1 text-[13px] font-semibold text-[var(--op-text)]">
                    {booking.customer_name || `Customer #${booking.customer_id}`}
                  </p>
                  <div className="mt-1">
                    <PhoneActions
                      phone={booking.customer_phone}
                      whatsappMessage={`Hi ${booking.customer_name || ""}, update regarding your NammaPros booking ${booking.reference}:`}
                    />
                  </div>
                </section>

                {/* Visit & Address + mini map */}
                <section className="rounded border border-[var(--op-border)] p-3 space-y-2">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                    Appointment & Address
                  </h3>
                  <div className="grid gap-1 text-[12px]">
                    <p>
                      <strong className="text-[var(--op-text)]">Slot (IST):</strong>{" "}
                      {formatIstDateTime(booking.start_at)}
                    </p>
                    <p>
                      <strong className="text-[var(--op-text)]">Zone:</strong> {booking.zone || "—"}
                    </p>
                    {booking.address && (
                      <p className="text-[var(--op-muted)]">
                        {booking.address.line_1}, {booking.address.locality}, {booking.address.city}{" "}
                        {booking.address.postal_code}
                      </p>
                    )}
                    {booking.problem_description && (
                      <p className="mt-1 rounded bg-[var(--op-surface-alt)] p-2 text-[12px] text-[var(--op-text)]">
                        {booking.problem_description}
                      </p>
                    )}
                  </div>
                  {booking.address && (
                    <MapPanel
                      title="Job Location"
                      heightClass="h-36"
                      pins={[
                        {
                          id: booking.id,
                          label: booking.reference,
                          status: booking.status,
                          addressText: `${booking.address.line_1}, ${booking.address.locality}, ${booking.address.city} ${booking.address.postal_code}`,
                        },
                      ]}
                    />
                  )}
                </section>

                {/* Pricing & Balance */}
                <section className="rounded border border-[var(--op-border)] p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                      Payment & Breakdown
                    </h3>
                    <StatusBadge status={booking.payment_status} />
                  </div>
                  <div className="mt-2 space-y-1 text-[12px]">
                    {booking.price_lines.map((line, idx) => (
                      <div key={idx} className="flex justify-between text-[var(--op-muted)]">
                        <span>{line.name || formatStatusLabel(line.code || "ITEM")}</span>
                        <span className="font-mono text-[var(--op-text)]">
                          {formatMoneyPaise(line.amount_paise)}
                        </span>
                      </div>
                    ))}
                    <div className="mt-1.5 flex justify-between border-t border-[var(--op-border)] pt-1.5 font-semibold text-[var(--op-text)]">
                      <span>Total</span>
                      <span className="font-mono">{formatMoneyPaise(booking.price_paise)}</span>
                    </div>
                    {(booking.advance_paise ?? 0) > 0 && (
                      <div className="flex justify-between text-[var(--op-muted)]">
                        <span>Advance required</span>
                        <span className="font-mono">{formatMoneyPaise(booking.advance_paise)}</span>
                      </div>
                    )}
                    {(booking.offline_collected_paise ?? 0) > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Collected offline</span>
                        <span className="font-mono">{formatMoneyPaise(booking.offline_collected_paise)}</span>
                      </div>
                    )}
                    {(booking.balance_due_paise ?? 0) > 0 && (
                      <div className="flex justify-between font-semibold text-amber-700">
                        <span>Balance due</span>
                        <span className="font-mono">{formatMoneyPaise(booking.balance_due_paise)}</span>
                      </div>
                    )}
                  </div>
                </section>

                {/* Assigned Technician & Ranked Dispatch Candidates */}
                <section ref={assignSectionRef} className="rounded border border-[var(--op-border)] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                      Technician & Dispatch
                    </h3>
                    {booking.technician && <StatusBadge status={booking.technician.status} />}
                  </div>

                  {booking.technician ? (
                    <div className="rounded bg-[var(--op-surface-alt)] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/technicians?technician=${booking.technician.id}`}
                          className="text-[13px] font-semibold text-[var(--op-brand)] hover:underline"
                        >
                          {booking.technician.name}
                        </Link>
                      </div>
                      {booking.technician.phone && (
                        <div className="mt-1">
                          <PhoneActions phone={booking.technician.phone} compact />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[var(--op-muted)]">No technician assigned yet.</p>
                  )}

                  {(actions.canAssign || actions.canReassign) && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                        Ranked Candidates
                      </p>
                      {candidatesQuery.isLoading ? (
                        <p className="text-[12px] text-[var(--op-muted)]">Finding eligible technicians...</p>
                      ) : (candidatesQuery.data?.candidates.length ?? 0) === 0 ? (
                        <p className="text-[12px] text-[var(--op-muted)]">
                          No eligible online verified technicians found for this slot/zone.
                        </p>
                      ) : (
                        <div className="divide-y divide-[var(--op-border)] rounded border border-[var(--op-border)]">
                          {candidatesQuery.data?.candidates.map((cand) => (
                            <div key={cand.id} className="flex items-center justify-between gap-2 p-2">
                              <div className="min-w-0">
                                <p className="truncate text-[12px] font-semibold text-[var(--op-text)]">
                                  {cand.name} <span className="font-mono text-[11px] text-[var(--op-muted)]">· Score {cand.score}</span>
                                </p>
                                <p className="truncate text-[11px] text-[var(--op-muted)]">
                                  {cand.workload} active jobs · {cand.reasons.join(", ")}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {!booking.technician && (
                                  <button
                                    type="button"
                                    disabled={!actions.canOffer}
                                    title={actions.reasons.offer}
                                    onClick={() => setPendingAction({ kind: "offer", candidate: cand })}
                                    className="rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)] disabled:opacity-45"
                                  >
                                    Offer
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={booking.technician ? !actions.canReassign : !actions.canAssign}
                                  onClick={() =>
                                    setPendingAction({
                                      kind: booking.technician ? "reassign" : "assign",
                                      candidate: cand,
                                    })
                                  }
                                  className="rounded bg-[var(--op-brand)] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-45"
                                >
                                  {booking.technician ? "Reassign" : "Assign"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* State Actions */}
                <section className="rounded border border-[var(--op-border)] p-3 space-y-3">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                    Operations Actions
                  </h3>

                  {actions.canReschedule && (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Choose new slot for reschedule"
                        value={selectedSlotId}
                        onChange={(e) => setSelectedSlotId(e.target.value)}
                        className="h-8 flex-1 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                      >
                        <option value="">Choose available slot...</option>
                        {(slotsQuery.data?.slots ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {formatIstDateTime(s.start_at)} · {s.remaining} left
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedSlotId}
                        onClick={() => {
                          const found = slotsQuery.data?.slots.find((s) => s.id === selectedSlotId);
                          if (!found) return;
                          setPendingAction({
                            kind: "reschedule",
                            slotId: found.id,
                            slotLabel: formatIstDateTime(found.start_at),
                          });
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)] disabled:opacity-45"
                      >
                        <CalendarClock className="h-3.5 w-3.5" /> Reschedule
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!actions.canConfirm}
                      title={actions.reasons.confirm}
                      onClick={() => setPendingAction({ kind: "confirm" })}
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" /> Confirm
                    </button>
                    <button
                      type="button"
                      disabled={!actions.canStart}
                      title={actions.reasons.start}
                      onClick={() => setPendingAction({ kind: "start" })}
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <UserCheck className="h-3.5 w-3.5 text-orange-600" /> Mark Started
                    </button>
                    <button
                      type="button"
                      disabled={!actions.canComplete}
                      title={actions.reasons.complete}
                      onClick={() => setPendingAction({ kind: "complete" })}
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Complete
                    </button>
                    <button
                      type="button"
                      disabled={!actions.canRecordBalance}
                      title={actions.reasons.recordBalance}
                      onClick={() => {
                        setBalanceRupees(String(((booking.balance_due_paise ?? 0) / 100).toFixed(0)));
                        setPendingAction({ kind: "record-balance" });
                      }}
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CreditCard className="h-3.5 w-3.5 text-[var(--op-brand)]" /> Record Balance
                    </button>
                    <button
                      type="button"
                      disabled={!actions.canCancel}
                      title={actions.reasons.cancel}
                      onClick={() => setPendingAction({ kind: "cancel" })}
                      className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Refund requests are handled via /admin/finance/refunds/request/ (no operations refund endpoint)"
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface-alt)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--op-muted)] opacity-50 cursor-not-allowed"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" /> Request Refund
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Resend notification is only exposed via /admin/notifications/ (no operations resend endpoint)"
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface-alt)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--op-muted)] opacity-50 cursor-not-allowed"
                    >
                      <Send className="h-3.5 w-3.5" /> Resend Notification
                    </button>
                  </div>
                </section>
              </div>
            )}

            {tab === "timeline" && (
              <Timeline
                items={(booking.timeline ?? []).map((ev, idx) => ({
                  id: `${ev.status}-${idx}`,
                  title: formatStatusLabel(ev.status),
                  subtitle: ev.reason || undefined,
                  timestamp: formatIstDateTime(ev.at),
                  badge: <StatusBadge status={ev.status} />,
                }))}
              />
            )}

            {tab === "notes" && (
              <div className="space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!noteText.trim()) return;
                    noteMutation.mutate(noteText.trim());
                  }}
                  className="space-y-2 rounded border border-[var(--op-border)] p-3"
                >
                  <label className="block text-[12px] font-semibold text-[var(--op-text)]">
                    Add internal note
                  </label>
                  <textarea
                    ref={noteInputRef}
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Internal note for dispatch & support coordinators..."
                    className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] p-2 text-[13px] text-[var(--op-text)]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={noteMutation.isPending || !noteText.trim()}
                      className="rounded bg-[var(--op-brand)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-45"
                    >
                      {noteMutation.isPending ? "Saving..." : "Save note"}
                    </button>
                  </div>
                </form>

                <Timeline
                  emptyText="No operator notes on this booking yet."
                  items={(booking.notes ?? []).map((n, i) => ({
                    id: n.id ?? String(i),
                    title: n.text,
                    timestamp: formatIstDateTime(n.at),
                  }))}
                />

                {(booking.support?.length ?? 0) > 0 && (
                  <div className="border-t border-[var(--op-border)] pt-3">
                    <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                      Linked Support Tickets
                    </h4>
                    <div className="space-y-1.5">
                      {booking.support?.map((t) => (
                        <Link
                          key={t.id}
                          href={`/support?ticket=${t.id}`}
                          className="flex items-center justify-between rounded border border-[var(--op-border)] px-2.5 py-2 hover:border-[var(--op-brand)]"
                        >
                          <span className="text-[12px] font-medium text-[var(--op-text)]">
                            {t.reference} · {t.subject}
                          </span>
                          <StatusBadge status={t.status} />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "quotation" && (
              <div className="space-y-3 rounded border border-[var(--op-border)] p-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--op-text)]">
                  <FileText className="h-4 w-4 text-[var(--op-brand)]" />
                  <span>Price Snapshot & Line Items</span>
                </div>
                <div className="space-y-1 text-[12px]">
                  {booking.price_lines.map((l, idx) => (
                    <div key={idx} className="flex justify-between py-1 border-b border-[var(--op-border)] last:border-0">
                      <span>{l.name || formatStatusLabel(l.code || "ITEM")}</span>
                      <span className="font-mono font-semibold">{formatMoneyPaise(l.amount_paise)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-2 rounded bg-[var(--op-surface-alt)] p-2.5 text-[12px] text-[var(--op-muted)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    Additional spare-part quotations added by technicians are currently exposed on{" "}
                    <code className="font-mono">/api/v1/bookings/&lt;id&gt;/quotations/</code> (customer portal) rather than{" "}
                    <code className="font-mono">/api/v1/operations/bookings/&lt;id&gt;/</code>.
                  </span>
                </div>
              </div>
            )}

            {tab === "photos" && (
              <div className="flex items-start gap-2 rounded border border-[var(--op-border)] bg-[var(--op-surface-alt)] p-3 text-[12px] text-[var(--op-muted)]">
                <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--op-brand)]" />
                <span>
                  Job before/after photos are currently served by the Admin endpoint{" "}
                  <code className="font-mono">/api/v1/admin/bookings/&lt;id&gt;/photos/</code> and are not yet exposed
                  under <code className="font-mono">/api/v1/operations/bookings/</code>.
                </span>
              </div>
            )}
          </div>
        ) : null}
      </DetailDrawer>

      <ActionDialog
        open={Boolean(pendingAction)}
        busy={actionMutation.isPending}
        title={
          pendingAction?.kind === "cancel"
            ? `Cancel ${booking?.reference}`
            : pendingAction?.kind === "reassign"
              ? `Reassign ${booking?.reference} to ${pendingAction.candidate.name}`
              : pendingAction?.kind === "assign"
                ? `Assign ${pendingAction.candidate.name} to ${booking?.reference}`
                : pendingAction?.kind === "offer"
                  ? `Send job offer to ${pendingAction.candidate.name}`
                  : pendingAction?.kind === "reschedule"
                    ? `Reschedule ${booking?.reference}`
                    : pendingAction?.kind === "record-balance"
                      ? `Record offline balance for ${booking?.reference}`
                      : `Confirm ${pendingAction?.kind ?? ""} action`
        }
        description={
          pendingAction?.kind === "reschedule"
            ? `Move slot to ${pendingAction.slotLabel}?`
            : pendingAction?.kind === "cancel"
              ? "This cancels the booking and notifies any active offers/assignments."
              : undefined
        }
        confirmVariant={pendingAction?.kind === "cancel" ? "danger" : "primary"}
        confirmLabel={
          pendingAction?.kind === "cancel"
            ? "Cancel Booking"
            : pendingAction?.kind === "record-balance"
              ? "Record Payment"
              : "Confirm"
        }
        requireReason={
          pendingAction?.kind === "cancel" ||
          pendingAction?.kind === "reassign" ||
          pendingAction?.kind === "assign"
        }
        reasonLabel={pendingAction?.kind === "cancel" ? "Cancellation reason" : "Operational reason"}
        onClose={() => setPendingAction(null)}
        onConfirm={runConfirmedAction}
      >
        {pendingAction?.kind === "record-balance" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-[12px] font-semibold">
              Amount (₹)
              <input
                type="number"
                min="1"
                step="1"
                value={balanceRupees}
                onChange={(e) => setBalanceRupees(e.target.value)}
                className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
              />
            </label>
            <label className="block text-[12px] font-semibold">
              Method
              <select
                value={balanceMethod}
                onChange={(e) => setBalanceMethod(e.target.value)}
                className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
              >
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="CARD_OFFLINE">Card (Offline)</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
          </div>
        )}
      </ActionDialog>
    </>
  );
}
