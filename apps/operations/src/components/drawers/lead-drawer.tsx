"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  Link2,
  PhoneCall,
} from "lucide-react";
import React, { useState } from "react";
import { ActionDialog } from "@/components/ops/ops-action-dialog";
import { PhoneActions } from "@/components/ops/ops-contact-actions";
import { DetailDrawer } from "@/components/ops/ops-detail-drawer";
import { useOpsUi } from "@/components/ops/ops-providers";
import { useBookingDrawer } from "@/components/ops/ops-shell";
import { ErrorState, Timeline } from "@/components/ops/ops-states";
import { StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime, formatMoneyPaise } from "@/lib/format";
import { useNowTick } from "@/lib/hooks";
import { formatStatusLabel } from "@/lib/status";

type TabId = "overview" | "followups" | "activity" | "convert";

export function LeadDrawer({
  leadId,
  onClose,
}: {
  leadId: string | null;
  onClose: () => void;
}) {
  const { toast } = useOpsUi();
  const { openBookingDrawer } = useBookingDrawer();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabId>("overview");
  const [contactChannel, setContactChannel] = useState("PHONE");
  const [contactOutcome, setContactOutcome] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [followDueAt, setFollowDueAt] = useState("");
  const [followNotes, setFollowNotes] = useState("");
  const [manualRupees, setManualRupees] = useState("");
  const [manualMethod, setManualMethod] = useState("UPI");
  const [manualRef, setManualRef] = useState("");
  const [reminderChannel, setReminderChannel] = useState<"WHATSAPP" | "SMS" | "EMAIL">("WHATSAPP");
  const [payLinkScope, setPayLinkScope] = useState<"ADVANCE" | "FULL">("ADVANCE");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [convertNotes, setConvertNotes] = useState("");
  const [lossDialogOpen, setLossDialogOpen] = useState(false);

  const leadQuery = useQuery({
    queryKey: ["ops", "lead", leadId],
    queryFn: () => api.lead(leadId as string),
    enabled: Boolean(leadId),
  });

  const activitiesQuery = useQuery({
    queryKey: ["ops", "lead-activities", leadId],
    queryFn: () => api.leadActivities(leadId as string),
    enabled: Boolean(leadId && tab === "activity"),
  });

  const conversionQuery = useQuery({
    queryKey: ["ops", "lead-conversion", leadId],
    queryFn: () => api.conversionOptions(leadId as string),
    enabled: Boolean(leadId && leadQuery.data?.status === "QUALIFIED"),
  });

  const invalidateLead = () => {
    void queryClient.invalidateQueries({ queryKey: ["ops", "lead", leadId] });
    void queryClient.invalidateQueries({ queryKey: ["ops", "lead-activities", leadId] });
    void queryClient.invalidateQueries({ queryKey: ["ops", "leads"] });
    void queryClient.invalidateQueries({ queryKey: ["ops", "lead-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["ops", "lead-followups"] });
    void queryClient.invalidateQueries({ queryKey: ["ops", "lead-conversion", leadId] });
  };

  const runMutation = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      toast("success", "Lead updated");
      invalidateLead();
    },
    onError: (err) => {
      toast("error", "Lead update failed", err instanceof Error ? err.message : undefined);
    },
  });

  const lead = leadQuery.data;
  const nowMs = useNowTick(30_000);
  const isOverdue = Boolean(
    lead?.follow_up_at &&
      !["CONVERTED", "LOST", "CANCELLED"].includes(lead.status) &&
      new Date(lead.follow_up_at).getTime() < nowMs
  );

  const packages = conversionQuery.data?.packages ?? [];
  const chosenPkg = packages.find((p) => p.id === selectedPackageId);

  return (
    <>
      <DetailDrawer
        open={Boolean(leadId)}
        onClose={onClose}
        title={
          lead ? (
            <>
              <span className="font-mono">{lead.lead_reference}</span>
              <StatusBadge status={lead.status} />
              <StatusBadge status={lead.priority} />
            </>
          ) : (
            "Loading lead..."
          )
        }
        subtitle={lead ? `${lead.customer_name} · ${lead.service} · ${formatStatusLabel(lead.source)}` : undefined}
      >
        {leadQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded bg-[var(--op-border)]" />
            <div className="h-32 animate-pulse rounded bg-[var(--op-border)]" />
          </div>
        ) : leadQuery.isError ? (
          <ErrorState
            message={leadQuery.error instanceof Error ? leadQuery.error.message : "Could not load lead."}
            onRetry={() => void leadQuery.refetch()}
          />
        ) : lead ? (
          <div className="space-y-4">
            {/* Tabs */}
            <div role="tablist" className="flex border-b border-[var(--op-border)]">
              {(
                [
                  ["overview", "Overview"],
                  ["followups", `Follow-ups (${lead.follow_ups?.length ?? 0})`],
                  ["activity", "Timeline"],
                  ["convert", "Convert"],
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

            {isOverdue && (
              <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>Follow-up overdue since {formatIstDateTime(lead.follow_up_at)}</span>
              </div>
            )}

            {lead.converted_booking_id && (
              <div className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900">
                <span className="font-semibold">Converted to Booking</span>
                <button
                  type="button"
                  onClick={() => openBookingDrawer(lead.converted_booking_id!)}
                  className="font-semibold text-[var(--op-brand)] hover:underline"
                >
                  Open Booking Drawer →
                </button>
              </div>
            )}

            {tab === "overview" && (
              <div className="space-y-4">
                <section className="rounded border border-[var(--op-border)] p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                      Contact & Address
                    </h3>
                    {lead.zone_name && (
                      <span className="text-[11px] font-medium text-[var(--op-muted)]">{lead.zone_name}</span>
                    )}
                  </div>
                  <p className="text-[13px] font-semibold text-[var(--op-text)]">{lead.customer_name}</p>
                  <PhoneActions
                    phone={lead.mobile_number}
                    whatsappMessage={`Hi ${lead.customer_name}, following up on your NammaPros inquiry (${lead.lead_reference}) for ${lead.service}.`}
                  />
                  {lead.email && <p className="text-[12px] text-[var(--op-muted)]">{lead.email}</p>}
                  <p className="text-[12px] text-[var(--op-muted)]">
                    {[lead.address, lead.area, lead.city, lead.pincode].filter(Boolean).join(", ") || "Address incomplete"}
                  </p>
                  {lead.problem_description && (
                    <p className="rounded bg-[var(--op-surface-alt)] p-2 text-[12px] text-[var(--op-text)]">
                      {lead.problem_description}
                    </p>
                  )}
                </section>

                {/* Status quick transition */}
                {lead.status !== "CONVERTED" && (
                  <section className="rounded border border-[var(--op-border)] p-3">
                    <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                      Pipeline Stage
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {(["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={runMutation.isPending || lead.status === st}
                          onClick={() => runMutation.mutate(() => api.updateLead(lead.id, { status: st }))}
                          className={`rounded border px-2.5 py-1 text-[11px] font-semibold transition ${
                            lead.status === st
                              ? "border-[var(--op-brand)] bg-[var(--op-brand)] text-white"
                              : "border-[var(--op-border)] bg-[var(--op-surface)] text-[var(--op-text)] hover:border-[var(--op-brand)]"
                          }`}
                        >
                          {formatStatusLabel(st)}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={runMutation.isPending || lead.status === "LOST"}
                        onClick={() => setLossDialogOpen(true)}
                        className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                      >
                        Mark Lost
                      </button>
                    </div>
                  </section>
                )}

                {/* Record Contact Outcome */}
                <section className="rounded border border-[var(--op-border)] p-3 space-y-2">
                  <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                    <PhoneCall className="h-3.5 w-3.5 text-[var(--op-brand)]" /> Record Contact Outcome
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      aria-label="Contact channel"
                      value={contactChannel}
                      onChange={(e) => setContactChannel(e.target.value)}
                      className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    >
                      <option value="PHONE">Phone Call</option>
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="SMS">SMS</option>
                      <option value="EMAIL">Email</option>
                    </select>
                    <input
                      value={contactOutcome}
                      onChange={(e) => setContactOutcome(e.target.value)}
                      placeholder="Outcome (e.g. Answered, Callback requested)"
                      className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    />
                  </div>
                  <input
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    placeholder="Call notes..."
                    className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                  />
                  <button
                    type="button"
                    disabled={runMutation.isPending}
                    onClick={() =>
                      runMutation.mutate(async () => {
                        await api.recordLeadContact(lead.id, {
                          channel: contactChannel,
                          outcome: contactOutcome,
                          notes: contactNotes,
                        });
                        setContactOutcome("");
                        setContactNotes("");
                      })
                    }
                    className="rounded bg-[var(--op-brand)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
                  >
                    Save contact log
                  </button>
                </section>

                {/* Schedule + Reminder */}
                <section className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-[var(--op-border)] p-3 space-y-2">
                    <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--op-text)]">
                      <CalendarCheck className="h-3.5 w-3.5 text-[var(--op-brand)]" /> Schedule Visit Window
                    </h4>
                    <input
                      type="date"
                      value={schedDate || lead.preferred_date || ""}
                      onChange={(e) => setSchedDate(e.target.value)}
                      className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    />
                    <input
                      type="time"
                      value={schedTime || (lead.preferred_time ? lead.preferred_time.slice(0, 5) : "")}
                      onChange={(e) => setSchedTime(e.target.value)}
                      className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    />
                    <button
                      type="button"
                      disabled={runMutation.isPending || !(schedDate || lead.preferred_date)}
                      onClick={() =>
                        runMutation.mutate(() =>
                          api.scheduleLead(lead.id, {
                            preferred_date: schedDate || (lead.preferred_date as string),
                            preferred_time: schedTime ? `${schedTime}:00` : lead.preferred_time,
                          })
                        )
                      }
                      className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] py-1.5 text-[12px] font-semibold hover:border-[var(--op-brand)]"
                    >
                      Save preferred slot
                    </button>
                  </div>

                  <div className="rounded border border-[var(--op-border)] p-3 space-y-2">
                    <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--op-text)]">
                      <Bell className="h-3.5 w-3.5 text-[var(--op-brand)]" /> Send Reminder
                    </h4>
                    <select
                      value={reminderChannel}
                      onChange={(e) => setReminderChannel(e.target.value as "WHATSAPP" | "SMS" | "EMAIL")}
                      className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    >
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="SMS">SMS</option>
                      <option value="EMAIL">Email</option>
                    </select>
                    <button
                      type="button"
                      disabled={runMutation.isPending}
                      onClick={() => runMutation.mutate(() => api.sendLeadReminder(lead.id, { channel: reminderChannel }))}
                      className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] py-1.5 text-[12px] font-semibold hover:border-[var(--op-brand)]"
                    >
                      Log / Send Reminder
                    </button>
                  </div>
                </section>

                {/* Payment link & manual payment */}
                <section className="rounded border border-[var(--op-border)] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                      <CreditCard className="h-3.5 w-3.5 text-[var(--op-brand)]" /> Quote & Payment
                    </h3>
                    <StatusBadge status={lead.payment_status ?? "NOT_REQUIRED"} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[12px]">
                    <div className="rounded bg-[var(--op-surface-alt)] p-2">
                      <span className="block text-[10px] text-[var(--op-muted)]">Quoted</span>
                      <strong className="font-mono">{formatMoneyPaise(lead.quoted_amount_paise ?? lead.service_price_paise)}</strong>
                    </div>
                    <div className="rounded bg-[var(--op-surface-alt)] p-2">
                      <span className="block text-[10px] text-[var(--op-muted)]">Advance</span>
                      <strong className="font-mono">{formatMoneyPaise(lead.advance_amount_paise)}</strong>
                    </div>
                    <div className="rounded bg-[var(--op-surface-alt)] p-2">
                      <span className="block text-[10px] text-[var(--op-muted)]">Manual Paid</span>
                      <strong className="font-mono">{formatMoneyPaise(lead.manual_paid_paise)}</strong>
                    </div>
                  </div>
                  {lead.payment_link_url && (
                    <p className="truncate font-mono text-[11px] text-blue-700">{lead.payment_link_url}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Payment link scope"
                      value={payLinkScope}
                      onChange={(e) => setPayLinkScope(e.target.value as "ADVANCE" | "FULL")}
                      className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    >
                      <option value="ADVANCE">Advance link</option>
                      <option value="FULL">Full link</option>
                    </select>
                    <button
                      type="button"
                      disabled={runMutation.isPending}
                      onClick={() =>
                        runMutation.mutate(async () => {
                          const res = await api.sendLeadPaymentLink(lead.id, {
                            channel: "WHATSAPP",
                            payment_scope: payLinkScope,
                          });
                          if (res.payment_delivery_status === "BLOCKED_CONFIGURATION") {
                            toast("info", "Payment link recorded (Razorpay disabled in env)");
                          }
                        })
                      }
                      className="inline-flex h-8 items-center gap-1 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[12px] font-semibold hover:border-[var(--op-brand)]"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Send Payment Link
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--op-border)] pt-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="₹ Amount"
                      value={manualRupees}
                      onChange={(e) => setManualRupees(e.target.value)}
                      className="h-8 w-24 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    />
                    <select
                      aria-label="Manual payment method"
                      value={manualMethod}
                      onChange={(e) => setManualMethod(e.target.value)}
                      className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    >
                      <option value="UPI">UPI</option>
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input
                      placeholder="Txn Ref"
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      className="h-8 min-w-[100px] flex-1 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    />
                    <button
                      type="button"
                      disabled={runMutation.isPending || !Number(manualRupees)}
                      onClick={() =>
                        runMutation.mutate(async () => {
                          await api.recordLeadManualPayment(lead.id, {
                            amount_paise: Math.round(Number(manualRupees) * 100),
                            method: manualMethod,
                            reference: manualRef,
                          });
                          setManualRupees("");
                          setManualRef("");
                        })
                      }
                      className="h-8 rounded bg-[var(--op-brand)] px-2.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-45"
                    >
                      Record Paid
                    </button>
                  </div>
                </section>
              </div>
            )}

            {tab === "followups" && (
              <div className="space-y-4">
                {lead.status !== "CONVERTED" && (
                  <div className="rounded border border-[var(--op-border)] p-3 space-y-2">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                      Schedule Follow-up
                    </h3>
                    <input
                      type="datetime-local"
                      value={followDueAt}
                      onChange={(e) => setFollowDueAt(e.target.value)}
                      className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    />
                    <input
                      value={followNotes}
                      onChange={(e) => setFollowNotes(e.target.value)}
                      placeholder="Follow-up note..."
                      className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                    />
                    <button
                      type="button"
                      disabled={runMutation.isPending || !followDueAt}
                      onClick={() =>
                        runMutation.mutate(async () => {
                          await api.addLeadFollowUp(lead.id, {
                            due_at: new Date(followDueAt).toISOString(),
                            notes: followNotes,
                          });
                          setFollowDueAt("");
                          setFollowNotes("");
                        })
                      }
                      className="rounded bg-[var(--op-brand)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-45"
                    >
                      Add follow-up
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {(lead.follow_ups ?? []).length === 0 ? (
                    <p className="text-[12px] text-[var(--op-muted)]">No follow-ups scheduled for this lead.</p>
                  ) : (
                    lead.follow_ups?.map((f) => {
                      const fuOverdue = !f.completed_at && new Date(f.due_at).getTime() < nowMs;
                      return (
                        <div
                          key={f.id}
                          className={`flex items-center justify-between gap-2 rounded border p-2.5 text-[12px] ${
                            fuOverdue
                              ? "border-red-300 bg-red-50/70"
                              : "border-[var(--op-border)] bg-[var(--op-surface)]"
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-[var(--op-text)]">
                              {formatIstDateTime(f.due_at)}{" "}
                              {fuOverdue && <span className="text-red-700">· Overdue</span>}
                            </p>
                            {f.notes && <p className="text-[var(--op-muted)]">{f.notes}</p>}
                          </div>
                          {f.completed_at ? (
                            <StatusBadge status="COMPLETED" />
                          ) : (
                            <button
                              type="button"
                              disabled={runMutation.isPending}
                              onClick={() => runMutation.mutate(() => api.completeLeadFollowUp(lead.id, f.id))}
                              className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Complete
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {tab === "activity" && (
              <Timeline
                items={(activitiesQuery.data?.results ?? lead.activities ?? []).map((a, idx) => ({
                  id: String(idx),
                  title: formatStatusLabel(a.kind),
                  subtitle: Object.entries(a.detail ?? {})
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(" · "),
                  timestamp: formatIstDateTime(a.created_at),
                }))}
              />
            )}

            {tab === "convert" && (
              <div className="space-y-4">
                {lead.converted_booking_id ? (
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-900">
                    Lead already converted.{" "}
                    <button
                      type="button"
                      onClick={() => openBookingDrawer(lead.converted_booking_id!)}
                      className="font-semibold text-[var(--op-brand)] underline"
                    >
                      View Booking
                    </button>
                  </div>
                ) : (
                  <>
                    <section className="rounded border border-[var(--op-border)] p-3 space-y-2.5">
                      <h3 className="text-[13px] font-semibold text-[var(--op-text)]">
                        Slot-Verified Booking Conversion
                      </h3>
                      <p className="text-[12px] text-[var(--op-muted)]">
                        Requires stage <strong className="text-[var(--op-text)]">Scheduled / Qualified</strong> and full
                        service address + active zone coverage.
                      </p>

                      {lead.status !== "QUALIFIED" && (
                        <button
                          type="button"
                          onClick={() => runMutation.mutate(() => api.updateLead(lead.id, { status: "QUALIFIED" }))}
                          className="rounded border border-[var(--op-brand)] px-2.5 py-1 text-[12px] font-semibold text-[var(--op-brand)] hover:bg-[var(--op-brand-soft)]"
                        >
                          Move lead to Qualified now
                        </button>
                      )}

                      {conversionQuery.data?.detail && (
                        <p className="text-[12px] text-amber-700">{conversionQuery.data.detail}</p>
                      )}

                      {packages.length > 0 && (
                        <div className="space-y-2">
                          <select
                            aria-label="Conversion package"
                            value={selectedPackageId}
                            onChange={(e) => {
                              setSelectedPackageId(e.target.value);
                              setSelectedSlotId("");
                            }}
                            className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                          >
                            <option value="">Select package...</option>
                            {packages.map((pkg) => (
                              <option key={pkg.id} value={pkg.id}>
                                {pkg.name} · {formatMoneyPaise(pkg.total_paise)} ({pkg.payment_policy})
                              </option>
                            ))}
                          </select>

                          {chosenPkg && (
                            <select
                              aria-label="Conversion slot"
                              value={selectedSlotId}
                              onChange={(e) => setSelectedSlotId(e.target.value)}
                              className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                            >
                              <option value="">Select live slot...</option>
                              {chosenPkg.slots.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {formatIstDateTime(s.start_at)} · {s.remaining} left
                                </option>
                              ))}
                            </select>
                          )}

                          <button
                            type="button"
                            disabled={runMutation.isPending || !chosenPkg || !selectedSlotId}
                            onClick={() =>
                              runMutation.mutate(() =>
                                api.convertLead(lead.id, {
                                  package_id: selectedPackageId,
                                  slot_id: selectedSlotId,
                                  accepted_total_paise: chosenPkg?.total_paise,
                                })
                              )
                            }
                            className="w-full rounded bg-[var(--op-brand)] py-2 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-45"
                          >
                            Confirm Slot Conversion
                          </button>
                        </div>
                      )}
                    </section>

                    <section className="rounded border border-[var(--op-border)] p-3 space-y-2">
                      <h3 className="text-[13px] font-semibold text-[var(--op-text)]">
                        Direct Manual Work-Order Conversion
                      </h3>
                      <p className="text-[12px] text-[var(--op-muted)]">
                        Creates a confirmed work order immediately without pre-configured slot rules.
                      </p>
                      <textarea
                        rows={2}
                        value={convertNotes}
                        onChange={(e) => setConvertNotes(e.target.value)}
                        placeholder="Work order instructions..."
                        className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] p-2 text-[12px]"
                      />
                      <button
                        type="button"
                        disabled={runMutation.isPending}
                        onClick={() =>
                          runMutation.mutate(() =>
                            api.convertLead(lead.id, { notes: convertNotes })
                          )
                        }
                        className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] py-1.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)]"
                      >
                        Convert as Manual Work Order
                      </button>
                    </section>
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}
      </DetailDrawer>

      <ActionDialog
        open={lossDialogOpen}
        busy={runMutation.isPending}
        title="Mark lead as Lost"
        description="A loss reason is required for pipeline analytics."
        confirmLabel="Mark Lost"
        confirmVariant="danger"
        requireReason
        reasonLabel="Loss reason"
        onClose={() => setLossDialogOpen(false)}
        onConfirm={async (reason) => {
          if (!lead) return;
          await runMutation.mutateAsync(() =>
            api.updateLead(lead.id, { status: "LOST", loss_reason: reason })
          );
          setLossDialogOpen(false);
        }}
      />
    </>
  );
}
