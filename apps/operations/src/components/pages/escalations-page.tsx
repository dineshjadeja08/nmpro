"use client";

import type { OpsEscalation } from "@nammapros/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { useMemo, useState } from "react";
import { DataTable, type OpsColumn } from "@/components/ops/ops-data-table";
import { DetailDrawer } from "@/components/ops/ops-detail-drawer";
import { useOpsUi } from "@/components/ops/ops-providers";
import { useBookingDrawer } from "@/components/ops/ops-shell";
import { ErrorState, PageHeader } from "@/components/ops/ops-states";
import { SlaChip, StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime } from "@/lib/format";
import { useTableKeyboardShortcuts, useUrlDrawerParam } from "@/lib/hooks";
import { formatStatusLabel } from "@/lib/status";

const CATEGORIES = [
  "TECHNICIAN_UNAVAILABLE",
  "TECHNICIAN_LATE",
  "CUSTOMER_UNAVAILABLE",
  "SERVICE_DISPUTE",
  "PAYMENT_ISSUE",
  "QUOTATION_DISPUTE",
  "CUSTOMER_COMPLAINT",
  "TECHNICAL_ISSUE",
];

function escalationSlaDeadline(e: OpsEscalation): string | null {
  if (e.status === "RESOLVED" || e.status === "CLOSED") return null;
  const hrs = e.priority === "URGENT" ? 1 : e.priority === "HIGH" ? 2 : 4;
  return new Date(new Date(e.created_at).getTime() + hrs * 3600_000).toISOString();
}

export function EscalationsPage() {
  const { toast } = useOpsUi();
  const { openBookingDrawer } = useBookingDrawer();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [escalationId, setEscalationId] = useUrlDrawerParam("escalation");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [createOpen, setCreateOpen] = useState(() => Boolean(searchParams.get("booking")));

  const listQuery = useQuery({
    queryKey: ["ops", "escalations", status, page],
    queryFn: () => api.escalations({ status, page }),
    refetchInterval: 15_000,
  });

  const rows = useMemo(() => listQuery.data?.results ?? [], [listQuery.data]);
  const selectedEsc = useMemo(() => rows.find((r) => r.id === escalationId) ?? null, [rows, escalationId]);

  useTableKeyboardShortcuts({
    rowCount: rows.length,
    selectedIndex,
    onChangeIndex: setSelectedIndex,
    onOpenRow: (idx) => {
      if (rows[idx]) setEscalationId(rows[idx].id);
    },
    drawerOpen: Boolean(escalationId),
    onCloseDrawer: () => setEscalationId(null),
  });

  const columns: OpsColumn<OpsEscalation>[] = [
    {
      key: "category",
      header: "Category",
      render: (e) => <span className="font-semibold text-[var(--op-text)]">{formatStatusLabel(e.category)}</span>,
    },
    {
      key: "priority",
      header: "Priority",
      render: (e) => <StatusBadge status={e.priority} />,
    },
    {
      key: "status",
      header: "Status",
      render: (e) => <StatusBadge status={e.status} />,
    },
    {
      key: "owner",
      header: "Owner",
      render: (e) => (
        <span className="font-mono text-[12px] text-[var(--op-muted)]">
          {e.assigned_to ? `Op #${e.assigned_to}` : "Unassigned"}
        </span>
      ),
    },
    {
      key: "booking",
      header: "Booking / Ticket",
      render: (e) =>
        e.booking_id ? (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              openBookingDrawer(e.booking_id!);
            }}
            className="text-[12px] font-semibold text-[var(--op-brand)] hover:underline"
          >
            Open Booking
          </button>
        ) : (
          <span className="text-[12px] text-[var(--op-muted)]">—</span>
        ),
    },
    {
      key: "notes",
      header: "Notes",
      render: (e) => <span className="max-w-[260px] truncate block text-[12px] text-[var(--op-muted)]">{e.notes || "—"}</span>,
    },
    {
      key: "sla",
      header: "SLA",
      render: (e) => <SlaChip deadlineAt={escalationSlaDeadline(e)} />,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Escalations Queue"
        subtitle="Urgent operational blockers · resolution note required to close"
        actions={
          <div className="flex items-center gap-2">
            <select
              aria-label="Escalation status filter"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            >
              <option value="">All statuses</option>
              {["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                <option key={s} value={s}>
                  {formatStatusLabel(s)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-[var(--op-brand)] px-3 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
            >
              <Plus className="h-3.5 w-3.5" /> Raise Escalation
            </button>
          </div>
        }
      />

      {listQuery.isError ? (
        <ErrorState
          message={listQuery.error instanceof Error ? listQuery.error.message : "Could not load escalations."}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={listQuery.isLoading}
          selectedIndex={selectedIndex}
          activeRowId={escalationId}
          onRowClick={(r, idx) => {
            setSelectedIndex(idx);
            setEscalationId(r.id);
          }}
          emptyIcon={AlertOctagon}
          emptyTitle="No escalations in queue"
          emptyMessage="Everything in this status filter is clear."
          pagination={listQuery.data ? { page, count: listQuery.data.count, onPageChange: setPage } : undefined}
        />
      )}

      <EscalationDrawer
        escalation={selectedEsc}
        open={Boolean(escalationId)}
        onClose={() => setEscalationId(null)}
      />

      {createOpen && (
        <CreateEscalationModal
          initialBooking={searchParams.get("booking") ?? ""}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            toast("success", "Escalation created");
            setCreateOpen(false);
            setEscalationId(created.id);
            void queryClient.invalidateQueries({ queryKey: ["ops", "escalations"] });
          }}
        />
      )}
    </div>
  );
}

function EscalationDrawer({
  escalation,
  open,
  onClose,
}: {
  escalation: OpsEscalation | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useOpsUi();
  const { openBookingDrawer } = useBookingDrawer();
  const queryClient = useQueryClient();
  const [nextStatus, setNextStatus] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.updateEscalation(escalation!.id, {
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(ownerId ? { assigned_to: Number(ownerId) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
      }),
    onSuccess: () => {
      toast("success", "Escalation updated");
      void queryClient.invalidateQueries({ queryKey: ["ops", "escalations"] });
      void queryClient.invalidateQueries({ queryKey: ["ops", "dashboard"] });
    },
    onError: (err) => {
      toast("error", "Escalation update failed", err instanceof Error ? err.message : undefined);
    },
  });

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={
        escalation ? (
          <>
            <span>{formatStatusLabel(escalation.category)}</span>
            <StatusBadge status={escalation.priority} />
            <StatusBadge status={escalation.status} />
          </>
        ) : (
          "Escalation Detail"
        )
      }
      subtitle={escalation ? `Raised ${formatIstDateTime(escalation.created_at)}` : undefined}
    >
      {escalation ? (
        <div className="space-y-4">
          <div className="rounded border border-[var(--op-border)] p-3 text-[12px] space-y-2">
            <p className="text-[13px] text-[var(--op-text)]">{escalation.notes || "No initial notes."}</p>
            {escalation.resolution && (
              <p className="rounded bg-emerald-50 p-2 text-emerald-900">
                <strong>Resolution:</strong> {escalation.resolution}
              </p>
            )}
            {escalation.booking_id && (
              <button
                type="button"
                onClick={() => openBookingDrawer(escalation.booking_id!)}
                className="font-semibold text-[var(--op-brand)] hover:underline"
              >
                Inspect Linked Booking →
              </button>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="rounded border border-[var(--op-border)] p-3 space-y-2.5"
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Manage Escalation (Operations Manager role)
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                aria-label="Escalation status"
                value={nextStatus || escalation.status}
                onChange={(e) => setNextStatus(e.target.value)}
                className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
              >
                {["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                  <option key={s} value={s}>
                    {formatStatusLabel(s)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                placeholder={`Owner ID (${escalation.assigned_to ?? "unassigned"})`}
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
              />
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Update internal investigation notes..."
              className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] p-2 text-[12px]"
            />
            <textarea
              rows={2}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder="Resolution summary (required when resolving or closing)..."
              className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] p-2 text-[12px]"
            />
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded bg-[var(--op-brand)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-50"
            >
              {mutation.isPending ? "Saving..." : "Save Escalation"}
            </button>
          </form>
        </div>
      ) : (
        <p className="text-[12px] text-[var(--op-muted)]">Escalation not on current page.</p>
      )}
    </DetailDrawer>
  );
}

function CreateEscalationModal({
  initialBooking,
  onClose,
  onCreated,
}: {
  initialBooking: string;
  onClose: () => void;
  onCreated: (esc: OpsEscalation) => void;
}) {
  const { toast } = useOpsUi();
  const [bookingId, setBookingId] = useState(initialBooking);
  const [category, setCategory] = useState("TECHNICIAN_UNAVAILABLE");
  const [priority, setPriority] = useState("HIGH");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.createEscalation({
        booking_id: bookingId.trim(),
        category,
        priority,
        notes: notes.trim(),
      }),
    onSuccess: onCreated,
    onError: (err) => {
      toast("error", "Could not create escalation", err instanceof Error ? err.message : undefined);
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Raise escalation"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
        className="w-full max-w-md rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-5 shadow-xl space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Raise Escalation</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 text-[var(--op-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="block text-[12px] font-semibold">
          Booking UUID *
          <input
            required
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px] font-mono"
          />
        </label>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="text-[12px] font-semibold">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {formatStatusLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-semibold">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            >
              {["NORMAL", "HIGH", "URGENT"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-[12px] font-semibold">
          Notes
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] p-2 text-[13px]"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-[var(--op-border)] px-3 py-1.5 text-[12px] font-semibold">
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded bg-[var(--op-brand)] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
          >
            {createMutation.isPending ? "Saving..." : "Submit Escalation"}
          </button>
        </div>
      </form>
    </div>
  );
}
