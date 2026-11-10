"use client";

import type { OpsBooking, OpsCandidate } from "@nammapros/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Radio, RefreshCw, Send, UserCheck } from "lucide-react";
import React, { useMemo, useState } from "react";
import { ActionDialog } from "@/components/ops/ops-action-dialog";
import { PhoneActions } from "@/components/ops/ops-contact-actions";
import { MapPanel } from "@/components/ops/ops-map-panel";
import { useOpsUi } from "@/components/ops/ops-providers";
import { useBookingDrawer } from "@/components/ops/ops-shell";
import { EmptyState, ErrorState, PageHeader } from "@/components/ops/ops-states";
import { SlaChip, StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime } from "@/lib/format";
import { useNowTick } from "@/lib/hooks";
import { evaluateSlaDeadline, getEffectiveSlaDeadline } from "@/lib/status";

type QueueTab = "NEEDS_DISPATCH" | "OFFERED" | "EXCEPTIONS" | "ASSIGNED";

export function DispatchPage() {
  const { toast } = useOpsUi();
  const { openBookingDrawer } = useBookingDrawer();
  const queryClient = useQueryClient();
  const nowMs = useNowTick(15_000);

  const [tab, setTab] = useState<QueueTab>("NEEDS_DISPATCH");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmCandidate, setConfirmCandidate] = useState<{
    mode: "offer" | "assign" | "reassign";
    candidate: OpsCandidate;
  } | null>(null);

  const dispatchQuery = useQuery({
    queryKey: ["ops", "dispatch"],
    queryFn: () => api.dispatch(),
    refetchInterval: 15_000,
  });

  const dashboardWarningsQuery = useQuery({
    queryKey: ["ops", "dashboard-sla-warnings"],
    queryFn: () => api.dashboard({}),
    staleTime: 30_000,
  });

  const slaByBooking = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of dashboardWarningsQuery.data?.sla_warnings ?? []) {
      if (w.booking_id) map.set(w.booking_id, w.deadline_at);
    }
    return map;
  }, [dashboardWarningsQuery.data]);

  const queueItems = useMemo(() => {
    const groups = dispatchQuery.data?.groups;
    if (!groups) return [];
    let list: OpsBooking[] = [];
    if (tab === "NEEDS_DISPATCH") {
      list = [...(groups.UNASSIGNED ?? []), ...(groups.EXCEPTIONS ?? [])];
    } else if (tab === "OFFERED") {
      list = groups.OFFERED ?? [];
    } else if (tab === "EXCEPTIONS") {
      list = groups.EXCEPTIONS ?? [];
    } else {
      list = [...(groups.ASSIGNED ?? []), ...(groups.IN_PROGRESS ?? [])];
    }

    // Sort by SLA urgency (lowest remainingMs / breached first), then slot time
    return [...list].sort((a, b) => {
      const evA = evaluateSlaDeadline(getEffectiveSlaDeadline(a, slaByBooking.get(a.id)), nowMs);
      const evB = evaluateSlaDeadline(getEffectiveSlaDeadline(b, slaByBooking.get(b.id)), nowMs);
      const rA = evA.remainingMs ?? Number.MAX_SAFE_INTEGER;
      const rB = evB.remainingMs ?? Number.MAX_SAFE_INTEGER;
      if (rA !== rB) return rA - rB;
      return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
    });
  }, [dispatchQuery.data, tab, slaByBooking, nowMs]);

  const selectedBooking = useMemo(() => {
    if (selectedId) {
      const found = queueItems.find((b) => b.id === selectedId);
      if (found) return found;
    }
    return queueItems[0] ?? null;
  }, [queueItems, selectedId]);

  const candidatesQuery = useQuery({
    queryKey: ["ops", "dispatch-candidates", selectedBooking?.id],
    queryFn: () => api.candidates(selectedBooking!.id),
    enabled: Boolean(selectedBooking?.id),
    refetchInterval: 15_000,
  });

  const attemptsQuery = useQuery({
    queryKey: ["ops", "dispatch-attempts", selectedBooking?.id],
    queryFn: () => api.attempts(selectedBooking!.id),
    enabled: Boolean(selectedBooking?.id),
    refetchInterval: 15_000,
  });

  const dispatchMutation = useMutation({
    mutationFn: async ({
      mode,
      candidate,
      reason,
    }: {
      mode: "offer" | "assign" | "reassign";
      candidate: OpsCandidate;
      reason: string;
    }) => {
      if (!selectedBooking) throw new Error("No job selected.");
      if (mode === "offer") {
        return api.bookingAction(selectedBooking.id, "offer", {
          technician_id: candidate.id,
          expected_version: selectedBooking.version,
        });
      }
      return api.bookingAction(selectedBooking.id, mode, {
        technician_id: candidate.id,
        expected_version: selectedBooking.version,
        reason,
      });
    },
    onSuccess: (_res, vars) => {
      toast(
        "success",
        vars.mode === "offer"
          ? `Offer sent to ${vars.candidate.name}`
          : `${vars.candidate.name} assigned to ${selectedBooking?.reference}`
      );
      setConfirmCandidate(null);
      void queryClient.invalidateQueries({ queryKey: ["ops", "dispatch"] });
      void queryClient.invalidateQueries({ queryKey: ["ops", "dispatch-candidates", selectedBooking?.id] });
      void queryClient.invalidateQueries({ queryKey: ["ops", "dispatch-attempts", selectedBooking?.id] });
      void queryClient.invalidateQueries({ queryKey: ["ops", "bookings"] });
    },
    onError: (err) => {
      toast("error", "Dispatch action failed", err instanceof Error ? err.message : undefined);
    },
  });

  const rule = dispatchQuery.data?.rule as
    | { name?: string; automatic_enabled?: boolean; offer_timeout_minutes?: number }
    | null
    | undefined;

  return (
    <div>
      <PageHeader
        title="Dispatch Console"
        subtitle="Ranked SLA-ordered dispatch queue · auto-refreshes every 15s"
        actions={
          <div className="flex items-center gap-2">
            <span className="rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1 text-[12px] text-[var(--op-muted)]">
              Auto-dispatch:{" "}
              <strong className="text-[var(--op-text)]">
                {rule?.automatic_enabled ? "Enabled" : "Manual / Off"}
              </strong>
              {rule?.offer_timeout_minutes ? ` · ${rule.offer_timeout_minutes}m timeout` : ""}
            </span>
            <button
              type="button"
              onClick={() => void dispatchQuery.refetch()}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dispatchQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      {dispatchQuery.isError && (
        <div className="mb-3">
          <ErrorState
            message={dispatchQuery.error instanceof Error ? dispatchQuery.error.message : "Could not load dispatch queue."}
            onRetry={() => void dispatchQuery.refetch()}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        {/* Left Queue */}
        <section className="flex flex-col rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] shadow-[var(--op-shadow)]">
          <div className="flex border-b border-[var(--op-border)] px-2 pt-2">
            {(
              [
                ["NEEDS_DISPATCH", `Unassigned (${(dispatchQuery.data?.groups.UNASSIGNED?.length ?? 0) + (dispatchQuery.data?.groups.EXCEPTIONS?.length ?? 0)})`],
                ["OFFERED", `Offered (${dispatchQuery.data?.groups.OFFERED?.length ?? 0})`],
                ["EXCEPTIONS", `Exceptions (${dispatchQuery.data?.groups.EXCEPTIONS?.length ?? 0})`],
                ["ASSIGNED", `Assigned (${(dispatchQuery.data?.groups.ASSIGNED?.length ?? 0) + (dispatchQuery.data?.groups.IN_PROGRESS?.length ?? 0)})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setSelectedId(null);
                }}
                className={`border-b-2 px-2.5 pb-2 text-[12px] font-semibold transition ${
                  tab === key
                    ? "border-[var(--op-brand)] text-[var(--op-brand)]"
                    : "border-transparent text-[var(--op-muted)] hover:text-[var(--op-text)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-[calc(100vh-230px)] divide-y divide-[var(--op-border)] overflow-y-auto">
            {dispatchQuery.isLoading ? (
              <p className="p-4 text-[12px] text-[var(--op-muted)]">Loading dispatch queue...</p>
            ) : queueItems.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Radio}
                  title="Queue clear"
                  message="No jobs currently waiting in this dispatch lane."
                />
              </div>
            ) : (
              queueItems.map((b) => {
                const isSelected = selectedBooking?.id === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full p-3 text-left transition ${
                      isSelected ? "bg-[var(--op-row-selected)]" : "hover:bg-[var(--op-row-hover)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] font-semibold text-[var(--op-text)]">
                        {b.reference}
                      </span>
                      <SlaChip deadlineAt={getEffectiveSlaDeadline(b, slaByBooking.get(b.id))} />
                    </div>
                    <p className="mt-1 truncate text-[13px] font-medium text-[var(--op-text)]">
                      {b.service} · {b.package}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] text-[var(--op-muted)]">
                      <span>{b.zone || "—"} · {formatIstDateTime(b.start_at)}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    {b.technician && (
                      <p className="mt-1 text-[11px] font-medium text-indigo-700">
                        Tech: {b.technician.name}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Right Detail + Ranked Candidates + Live Attempts */}
        <section className="space-y-4">
          {!selectedBooking ? (
            <EmptyState
              icon={Radio}
              title="Select a job to dispatch"
              message="Pick an unassigned, offered, or exception job on the left to inspect ranked technicians and send offers."
            />
          ) : (
            <>
              <div className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[16px] font-semibold text-[var(--op-text)]">
                        {selectedBooking.reference}
                      </span>
                      <StatusBadge status={selectedBooking.status} />
                      <SlaChip
                        deadlineAt={getEffectiveSlaDeadline(
                          selectedBooking,
                          slaByBooking.get(selectedBooking.id)
                        )}
                      />
                    </div>
                    <p className="mt-1 text-[13px] font-medium text-[var(--op-text)]">
                      {selectedBooking.service} · {selectedBooking.package}
                    </p>
                    <p className="text-[12px] text-[var(--op-muted)]">
                      {formatIstDateTime(selectedBooking.start_at)} · {selectedBooking.zone} ·{" "}
                      {selectedBooking.address?.line_1}, {selectedBooking.address?.locality}
                    </p>
                    <div className="mt-1.5">
                      <PhoneActions phone={selectedBooking.customer_phone} compact />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openBookingDrawer(selectedBooking.id)}
                    className="inline-flex items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Full Drawer
                  </button>
                </div>

                <div className="mt-3">
                  <MapPanel
                    title="Job Location & Candidates"
                    heightClass="h-44"
                    pins={[
                      {
                        id: selectedBooking.id,
                        label: `${selectedBooking.reference} (Job)`,
                        status: selectedBooking.status,
                        addressText: selectedBooking.address
                          ? `${selectedBooking.address.line_1}, ${selectedBooking.address.locality}, ${selectedBooking.address.city}`
                          : selectedBooking.zone,
                        onSelect: () => openBookingDrawer(selectedBooking.id),
                      },
                    ]}
                  />
                </div>
              </div>

              {/* Ranked candidates */}
              <div className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)]">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-[14px] font-semibold text-[var(--op-text)]">Ranked Candidates</h2>
                    <p className="text-[11px] text-[var(--op-muted)]">
                      Sorted by active DispatchRule score & workload (distance, rating & acceptance metrics are not yet returned by `/operations/dispatch/candidates/`)
                    </p>
                  </div>
                </div>

                {candidatesQuery.isLoading ? (
                  <p className="text-[12px] text-[var(--op-muted)]">Ranking verified technicians...</p>
                ) : (candidatesQuery.data?.candidates.length ?? 0) === 0 ? (
                  <p className="text-[12px] text-[var(--op-muted)]">
                    No eligible candidates match verified skill, zone, working hours, and active DispatchRule.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--op-border)] rounded border border-[var(--op-border)]">
                    {candidatesQuery.data?.candidates.map((cand) => (
                      <div key={cand.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--op-text)]">{cand.name}</span>
                            <span className="rounded bg-[var(--op-surface-alt)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--op-brand)]">
                              Score {cand.score}
                            </span>
                            <span className="text-[11px] text-[var(--op-muted)]">
                              {cand.workload} active jobs
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--op-muted)]">
                            {cand.reasons.join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={Boolean(selectedBooking.technician)}
                            onClick={() => setConfirmCandidate({ mode: "offer", candidate: cand })}
                            className="inline-flex items-center gap-1 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)] disabled:opacity-45"
                          >
                            <Send className="h-3.5 w-3.5" /> Send Offer
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmCandidate({
                                mode: selectedBooking.technician ? "reassign" : "assign",
                                candidate: cand,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded bg-[var(--op-brand)] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
                          >
                            <UserCheck className="h-3.5 w-3.5" />{" "}
                            {selectedBooking.technician ? "Force Reassign" : "Force Assign"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Dispatch Attempts */}
              <div className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)]">
                <h2 className="mb-2 text-[14px] font-semibold text-[var(--op-text)]">
                  Offer Attempts History (Live)
                </h2>
                {attemptsQuery.isLoading ? (
                  <p className="text-[12px] text-[var(--op-muted)]">Loading dispatch attempts...</p>
                ) : (attemptsQuery.data?.attempts.length ?? 0) === 0 ? (
                  <p className="text-[12px] text-[var(--op-muted)]">No dispatch offers sent for this job yet.</p>
                ) : (
                  <div className="divide-y divide-[var(--op-border)]">
                    {attemptsQuery.data?.attempts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between py-2 text-[12px]">
                        <div>
                          <span className="font-semibold text-[var(--op-text)]">{a.technician}</span>
                          <span className="ml-2 text-[11px] text-[var(--op-muted)]">{a.mode}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[var(--op-muted)]">
                            {formatIstDateTime(a.created_at)}
                          </span>
                          <StatusBadge status={a.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <ActionDialog
        open={Boolean(confirmCandidate)}
        busy={dispatchMutation.isPending}
        title={
          confirmCandidate?.mode === "offer"
            ? `Send dispatch offer to ${confirmCandidate.candidate.name}`
            : `${confirmCandidate?.mode === "reassign" ? "Reassign" : "Assign"} ${confirmCandidate?.candidate.name ?? ""}`
        }
        description={selectedBooking ? `Booking ${selectedBooking.reference} · ${selectedBooking.service}` : undefined}
        confirmLabel={confirmCandidate?.mode === "offer" ? "Send Offer" : "Confirm Assignment"}
        requireReason={confirmCandidate?.mode !== "offer"}
        reasonLabel="Dispatch reason"
        onClose={() => setConfirmCandidate(null)}
        onConfirm={async (reason) => {
          if (!confirmCandidate) return;
          await dispatchMutation.mutateAsync({
            mode: confirmCandidate.mode,
            candidate: confirmCandidate.candidate,
            reason,
          });
        }}
      />
    </div>
  );
}
