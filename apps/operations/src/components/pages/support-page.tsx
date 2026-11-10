"use client";

import type { OpsTicket } from "@nammapros/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { useState } from "react";
import { DataTable, type OpsColumn } from "@/components/ops/ops-data-table";
import { DetailDrawer } from "@/components/ops/ops-detail-drawer";
import { useOpsUi } from "@/components/ops/ops-providers";
import { useBookingDrawer } from "@/components/ops/ops-shell";
import { ErrorState, PageHeader, Timeline } from "@/components/ops/ops-states";
import { SlaChip, StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime } from "@/lib/format";
import { useTableKeyboardShortcuts, useUrlDrawerParam } from "@/lib/hooks";
import { formatStatusLabel } from "@/lib/status";

function computeTicketSlaDeadline(t: OpsTicket): string | null {
  if (t.status === "RESOLVED" || t.status === "CLOSED") return null;
  const hrs = t.priority === "URGENT" ? 2 : t.priority === "HIGH" ? 4 : 24;
  return new Date(new Date(t.created_at).getTime() + hrs * 3600_000).toISOString();
}

export function SupportPage() {
  const { toast } = useOpsUi();
  const { openBookingDrawer } = useBookingDrawer();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [ticketId, setTicketId] = useUrlDrawerParam("ticket");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [createOpen, setCreateOpen] = useState(() =>
    Boolean(searchParams.get("booking") || searchParams.get("customer"))
  );

  const listQuery = useQuery({
    queryKey: ["ops", "support", q, status, page],
    queryFn: () => api.tickets({ q, status, page }),
    refetchInterval: 15_000,
  });

  const rows = listQuery.data?.results ?? [];

  useTableKeyboardShortcuts({
    rowCount: rows.length,
    selectedIndex,
    onChangeIndex: setSelectedIndex,
    onOpenRow: (idx) => {
      if (rows[idx]) setTicketId(rows[idx].id);
    },
    drawerOpen: Boolean(ticketId),
    onCloseDrawer: () => setTicketId(null),
  });

  const columns: OpsColumn<OpsTicket>[] = [
    {
      key: "ref",
      header: "Reference",
      render: (t) => <span className="font-mono text-[12px] font-semibold">{t.reference}</span>,
    },
    {
      key: "subject",
      header: "Subject",
      render: (t) => (
        <div className="max-w-[280px] truncate">
          <div className="truncate font-medium text-[var(--op-text)]">{t.subject}</div>
          <div className="truncate text-[11px] text-[var(--op-muted)]">{t.category}</div>
        </div>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (t) => <StatusBadge status={t.priority} />,
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: "owner",
      header: "Owner",
      render: (t) => (
        <span className="font-mono text-[12px] text-[var(--op-muted)]">
          {t.assigned_to ? `Op #${t.assigned_to}` : "Unassigned"}
        </span>
      ),
    },
    {
      key: "links",
      header: "Linked",
      render: (t) => (
        <div className="flex items-center gap-2 text-[12px]">
          <Link
            href={`/customers?customer=${t.customer_id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[var(--op-brand)] hover:underline"
          >
            Cust #{t.customer_id}
          </Link>
          {t.booking_id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openBookingDrawer(t.booking_id!);
              }}
              className="text-[var(--op-brand)] hover:underline"
            >
              Booking
            </button>
          )}
        </div>
      ),
    },
    {
      key: "sla",
      header: "SLA",
      render: (t) => <SlaChip deadlineAt={computeTicketSlaDeadline(t)} />,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Support Inbox"
        subtitle="Customer support tickets, response SLAs, and coordinator notes"
        actions={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-[var(--op-brand)] px-3 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
          >
            <Plus className="h-3.5 w-3.5" /> New Ticket
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-3 shadow-[var(--op-shadow)]">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--op-muted)]" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search ticket reference or subject..."
            className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] pl-8 pr-2.5 text-[12px]"
          />
        </div>
        <select
          aria-label="Ticket status filter"
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
      </div>

      {listQuery.isError ? (
        <ErrorState
          message={listQuery.error instanceof Error ? listQuery.error.message : "Could not load tickets."}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={listQuery.isLoading}
          selectedIndex={selectedIndex}
          activeRowId={ticketId}
          onRowClick={(r, idx) => {
            setSelectedIndex(idx);
            setTicketId(r.id);
          }}
          emptyIcon={LifeBuoy}
          emptyTitle="Support inbox empty"
          emptyMessage="No tickets match these filters."
          pagination={listQuery.data ? { page, count: listQuery.data.count, onPageChange: setPage } : undefined}
        />
      )}

      <TicketDrawer ticketId={ticketId} onClose={() => setTicketId(null)} />

      {createOpen && (
        <CreateTicketModal
          initialCustomer={searchParams.get("customer") ?? ""}
          initialBooking={searchParams.get("booking") ?? ""}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            toast("success", `Ticket ${created.reference} created`);
            setCreateOpen(false);
            setTicketId(created.id);
            void queryClient.invalidateQueries({ queryKey: ["ops", "support"] });
          }}
        />
      )}
    </div>
  );
}

function TicketDrawer({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const { toast } = useOpsUi();
  const { openBookingDrawer } = useBookingDrawer();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [note, setNote] = useState("");
  const [communication, setCommunication] = useState("");

  const detailQuery = useQuery({
    queryKey: ["ops", "ticket", ticketId],
    queryFn: () => api.ticket(ticketId as string),
    enabled: Boolean(ticketId),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateTicket(ticketId as string, {
        ...(status ? { status } : {}),
        ...(ownerId ? { assigned_to: Number(ownerId) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(communication.trim() ? { communication: communication.trim() } : {}),
      }),
    onSuccess: () => {
      toast("success", "Ticket updated");
      setNote("");
      setCommunication("");
      void queryClient.invalidateQueries({ queryKey: ["ops", "ticket", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["ops", "support"] });
    },
    onError: (err) => {
      toast("error", "Ticket update failed", err instanceof Error ? err.message : undefined);
    },
  });

  const t = detailQuery.data;

  return (
    <DetailDrawer
      open={Boolean(ticketId)}
      onClose={onClose}
      title={
        t ? (
          <>
            <span className="font-mono">{t.reference}</span>
            <StatusBadge status={t.priority} />
            <StatusBadge status={t.status} />
          </>
        ) : (
          "Loading ticket..."
        )
      }
      subtitle={t ? `${t.subject} · ${t.category}` : undefined}
    >
      {detailQuery.isLoading ? (
        <div className="h-32 animate-pulse rounded bg-[var(--op-border)]" />
      ) : detailQuery.isError ? (
        <ErrorState
          message={detailQuery.error instanceof Error ? detailQuery.error.message : "Could not load ticket."}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : t ? (
        <div className="space-y-4">
          <section className="rounded border border-[var(--op-border)] p-3 space-y-2 text-[12px]">
            <p className="text-[13px] text-[var(--op-text)]">{t.description}</p>
            <div className="flex flex-wrap gap-3 text-[var(--op-muted)]">
              <Link href={`/customers?customer=${t.customer_id}`} className="font-semibold text-[var(--op-brand)] hover:underline">
                Customer #{t.customer_id}
              </Link>
              {t.booking_id && (
                <button
                  type="button"
                  onClick={() => openBookingDrawer(t.booking_id!)}
                  className="font-semibold text-[var(--op-brand)] hover:underline"
                >
                  Open Linked Booking →
                </button>
              )}
              <span>Created {formatIstDateTime(t.created_at)}</span>
            </div>
          </section>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate();
            }}
            className="rounded border border-[var(--op-border)] p-3 space-y-2.5"
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Update Status, Owner & Log Reply
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                aria-label="Update ticket status"
                value={status || t.status}
                onChange={(e) => setStatus(e.target.value)}
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
                placeholder={`Owner ID (${t.assigned_to ?? "unassigned"})`}
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
              />
            </div>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal coordinator note..."
              className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] p-2 text-[12px]"
            />
            <textarea
              rows={2}
              value={communication}
              onChange={(e) => setCommunication(e.target.value)}
              placeholder="Customer communication summary (call / WhatsApp reply)..."
              className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] p-2 text-[12px]"
            />
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded bg-[var(--op-brand)] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-50"
            >
              {updateMutation.isPending ? "Saving..." : "Update Ticket"}
            </button>
          </form>

          <section className="rounded border border-[var(--op-border)] p-3 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Conversation & Activity Timeline
            </h3>
            <Timeline
              items={(t.events ?? []).map((ev, idx) => ({
                id: String(idx),
                title: formatStatusLabel(ev.kind),
                subtitle: ev.text || (ev.to_status ? `${formatStatusLabel(ev.from_status)} → ${formatStatusLabel(ev.to_status)}` : undefined),
                timestamp: formatIstDateTime(ev.created_at),
              }))}
            />
          </section>
        </div>
      ) : null}
    </DetailDrawer>
  );
}

function CreateTicketModal({
  initialCustomer,
  initialBooking,
  onClose,
  onCreated,
}: {
  initialCustomer: string;
  initialBooking: string;
  onClose: () => void;
  onCreated: (t: OpsTicket) => void;
}) {
  const { toast } = useOpsUi();
  const [customerId, setCustomerId] = useState(initialCustomer);
  const [bookingId, setBookingId] = useState(initialBooking);
  const [category, setCategory] = useState("GENERAL");
  const [priority, setPriority] = useState("NORMAL");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.createTicket({
        customer_id: Number(customerId),
        ...(bookingId.trim() ? { booking_id: bookingId.trim() } : {}),
        category,
        priority,
        subject: subject.trim(),
        description: description.trim(),
      }),
    onSuccess: onCreated,
    onError: (err) => {
      toast("error", "Could not create ticket", err instanceof Error ? err.message : undefined);
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create support ticket"
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
          <h2 className="text-[15px] font-semibold">Create Support Ticket</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 text-[var(--op-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="text-[12px] font-semibold">
            Customer ID *
            <input
              required
              type="number"
              min="1"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
            />
          </label>
          <label className="text-[12px] font-semibold">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
            >
              {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-[12px] font-semibold">
          Booking UUID (optional)
          <input
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px] font-mono"
          />
        </label>
        <label className="block text-[12px] font-semibold">
          Category *
          <input
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
          />
        </label>
        <label className="block text-[12px] font-semibold">
          Subject *
          <input
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
          />
        </label>
        <label className="block text-[12px] font-semibold">
          Description *
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            {createMutation.isPending ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
