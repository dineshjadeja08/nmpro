"use client";

import type { OpsBooking } from "@nammapros/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Filter, Search, Send, UserPlus, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useMemo, useState } from "react";
import { ActionDialog } from "@/components/ops/ops-action-dialog";
import { PhoneActions } from "@/components/ops/ops-contact-actions";
import { DataTable, type OpsColumn } from "@/components/ops/ops-data-table";
import { useOpsUi } from "@/components/ops/ops-providers";
import { useBookingDrawer } from "@/components/ops/ops-shell";
import { ErrorState, LiveRefreshBanner, PageHeader, SavedViewsBar } from "@/components/ops/ops-states";
import { SlaChip, StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime, formatMoneyPaise, todayIstDateString } from "@/lib/format";
import { useNowTick, useSavedViews, useTableKeyboardShortcuts, type SavedFilterView } from "@/lib/hooks";
import { evaluateSlaDeadline, getEffectiveSlaDeadline } from "@/lib/status";

type BookingFilters = {
  q: string;
  statuses: string[];
  payment_status: string;
  zone: string;
  service: string;
  technician: string;
  start: string;
  end: string;
  unassignedOnly: boolean;
  slaRiskOnly: boolean;
};

const ALL_STATUSES = [
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "CONFIRMED_UNPAID",
  "TECHNICIAN_ASSIGNED",
  "TECHNICIAN_EN_ROUTE",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "PAYMENT_FAILED",
];

export function BookingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useOpsUi();
  const { openBookingDrawer, closeBookingDrawer, activeBookingId, triggerBookingFocus } = useBookingDrawer();
  const nowMs = useNowTick(15_000);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const filters: BookingFilters = useMemo(
    () => ({
      q: searchParams.get("q") ?? "",
      statuses: (searchParams.get("status") ?? "").split(",").filter(Boolean),
      payment_status: searchParams.get("payment_status") ?? "",
      zone: searchParams.get("zone") ?? "",
      service: searchParams.get("service") ?? "",
      technician: searchParams.get("technician") ?? "",
      start: searchParams.get("start") ?? "",
      end: searchParams.get("end") ?? "",
      unassignedOnly: searchParams.get("unassigned") === "1",
      slaRiskOnly: searchParams.get("sla") === "risk",
    }),
    [searchParams]
  );

  function updateUrlParams(patch: Record<string, string | null>, resetPage = true) {
    setCheckedIds(new Set());
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    });
    if (resetPage) next.delete("page");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  const builtInViews: SavedFilterView<Record<string, string>>[] = useMemo(() => {
    const t = todayIstDateString();
    return [
      { id: "all", name: "All", filters: {} as Record<string, string> },
      {
        id: "today-unassigned",
        name: "Today – Unassigned",
        filters: { start: t, end: t, unassigned: "1" } as Record<string, string>,
      },
      { id: "sla-risk", name: "SLA at risk", filters: { sla: "risk" } as Record<string, string> },
      {
        id: "pending-payment",
        name: "Pending payment",
        filters: { status: "AWAITING_PAYMENT" } as Record<string, string>,
      },
    ];
  }, []);

  const { views, saveView, removeView } = useSavedViews("bookings", builtInViews);

  const apiParams = useMemo(() => {
    const p: Record<string, string | number> = {
      q: filters.q,
      payment_status: filters.payment_status,
      zone: filters.zone,
      service: filters.service,
      technician: filters.technician,
      start: filters.start,
      end: filters.end,
      sort: "slot__start_at",
      page,
    };
    if (filters.statuses.length === 1) {
      p.status = filters.statuses[0];
    }
    return p;
  }, [filters, page]);

  const bookingsQuery = useQuery({
    queryKey: ["ops", "bookings", apiParams],
    queryFn: () => api.bookings(apiParams),
  });

  // Poll quietly every 15s for changed count / head signature without shifting current table rows
  const livePeekQuery = useQuery({
    queryKey: ["ops", "bookings-peek", apiParams],
    queryFn: () => api.bookings(apiParams),
    refetchInterval: 15_000,
    enabled: Boolean(bookingsQuery.data),
  });

  const dashboardWarningsQuery = useQuery({
    queryKey: ["ops", "dashboard-sla-warnings"],
    queryFn: () => api.dashboard({}),
    staleTime: 30_000,
  });

  const zonesQuery = useQuery({
    queryKey: ["ops", "service-areas"],
    queryFn: () => api.serviceAreas(),
    staleTime: 60_000,
  });

  const catalogQuery = useQuery({
    queryKey: ["ops", "catalog"],
    queryFn: () => api.catalog(),
    staleTime: 60_000,
  });

  const techniciansQuery = useQuery({
    queryKey: ["ops", "technicians-list"],
    queryFn: () => api.technicians({ page: 1 }),
    staleTime: 30_000,
  });

  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTechId, setBulkTechId] = useState("");

  const slaDeadlineByBooking = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of dashboardWarningsQuery.data?.sla_warnings ?? []) {
      if (w.booking_id) map.set(w.booking_id, w.deadline_at);
    }
    return map;
  }, [dashboardWarningsQuery.data]);

  const displayedRows = useMemo(() => {
    let items = bookingsQuery.data?.results ?? [];
    if (filters.statuses.length > 1) {
      const set = new Set(filters.statuses);
      items = items.filter((b) => set.has(b.status));
    }
    if (filters.unassignedOnly) {
      items = items.filter((b) => !b.technician && !["CANCELLED", "EXPIRED", "COMPLETED", "CLOSED"].includes(b.status));
    }
    if (filters.slaRiskOnly) {
      items = items.filter((b) => {
        const deadline = getEffectiveSlaDeadline(b, slaDeadlineByBooking.get(b.id));
        const ev = evaluateSlaDeadline(deadline, nowMs);
        return ev.severity === "AT_RISK" || ev.severity === "BREACHED";
      });
    }
    return items;
  }, [bookingsQuery.data, filters.statuses, filters.unassignedOnly, filters.slaRiskOnly, slaDeadlineByBooking, nowMs]);

  const liveDeltaCount = useMemo(() => {
    const current = bookingsQuery.data;
    const latest = livePeekQuery.data;
    if (!current || !latest) return 0;
    const countDiff = Math.abs(latest.count - current.count);
    if (countDiff > 0) return countDiff;
    const oldSig = current.results.map((r) => `${r.id}:${r.version}:${r.status}`).join("|");
    const newSig = latest.results.map((r) => `${r.id}:${r.version}:${r.status}`).join("|");
    if (oldSig !== newSig) return Math.max(1, latest.results.filter((r, i) => current.results[i]?.version !== r.version).length);
    return 0;
  }, [bookingsQuery.data, livePeekQuery.data]);

  useTableKeyboardShortcuts({
    rowCount: displayedRows.length,
    selectedIndex,
    onChangeIndex: setSelectedIndex,
    onOpenRow: (idx) => {
      const row = displayedRows[idx];
      if (row) openBookingDrawer(row.id);
    },
    drawerOpen: Boolean(activeBookingId),
    onCloseDrawer: closeBookingDrawer,
    onAssign: () => triggerBookingFocus("assign"),
    onNote: () => triggerBookingFocus("note"),
    onReschedule: () => triggerBookingFocus("reschedule"),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ technicianId, reason }: { technicianId: string; reason: string }) => {
      const targets = displayedRows.filter((b) => checkedIds.has(b.id));
      let updated = 0;
      let failed = 0;
      for (const b of targets) {
        try {
          await api.bookingAction(b.id, b.technician ? "reassign" : "assign", {
            technician_id: technicianId,
            expected_version: b.version,
            reason,
          });
          updated += 1;
        } catch {
          failed += 1;
        }
      }
      return { updated, failed };
    },
    onSuccess: ({ updated, failed }) => {
      toast(
        failed > 0 ? "info" : "success",
        `Bulk assignment complete: ${updated} updated${failed > 0 ? `, ${failed} skipped/ineligible` : ""}`
      );
      setBulkOpen(false);
      setBulkTechId("");
      setCheckedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ["ops", "bookings"] });
    },
    onError: (err) => {
      toast("error", "Bulk assign failed", err instanceof Error ? err.message : undefined);
    },
  });

  const columns: OpsColumn<OpsBooking>[] = [
    {
      key: "reference",
      header: "ID / Ref",
      render: (b) => (
        <div>
          <span className="font-mono text-[12px] font-semibold text-[var(--op-text)]">{b.reference}</span>
          {b.priority === "URGENT" && (
            <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-[10px] font-bold text-red-700">URGENT</span>
          )}
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (b) => (
        <div>
          <div className="font-medium text-[var(--op-text)]">{b.customer_name || `Customer #${b.customer_id}`}</div>
          <PhoneActions phone={b.customer_phone} compact />
        </div>
      ),
    },
    {
      key: "service",
      header: "Service / Package",
      render: (b) => (
        <div className="max-w-[200px] truncate">
          <div className="truncate font-medium text-[var(--op-text)]">{b.service}</div>
          <div className="truncate text-[11px] text-[var(--op-muted)]">{b.package}</div>
        </div>
      ),
    },
    {
      key: "zone",
      header: "Zone / Locality",
      render: (b) => (
        <div className="max-w-[160px] truncate">
          <div className="truncate text-[var(--op-text)]">{b.zone || "—"}</div>
          <div className="truncate text-[11px] text-[var(--op-muted)]">{b.address?.locality || "—"}</div>
        </div>
      ),
    },
    {
      key: "slot",
      header: "Slot (IST)",
      render: (b) => <span className="font-mono text-[12px]">{formatIstDateTime(b.start_at)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (b) => <StatusBadge status={b.status} />,
    },
    {
      key: "payment",
      header: "Payment",
      render: (b) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={b.payment_status} />
          <span className="font-mono text-[11px] text-[var(--op-muted)]">
            {formatMoneyPaise(b.price_paise, true)}
          </span>
        </div>
      ),
    },
    {
      key: "technician",
      header: "Technician",
      render: (b) =>
        b.technician ? (
          <span className="font-medium text-[var(--op-text)]">{b.technician.name}</span>
        ) : (
          <span className="text-[12px] font-medium text-amber-700">Unassigned</span>
        ),
    },
    {
      key: "sla",
      header: "SLA",
      render: (b) => <SlaChip deadlineAt={getEffectiveSlaDeadline(b, slaDeadlineByBooking.get(b.id))} />,
    },
  ];

  const activeFilterObject: Record<string, string> = {
    ...(filters.statuses.length ? { status: filters.statuses.join(",") } : {}),
    ...(filters.payment_status ? { payment_status: filters.payment_status } : {}),
    ...(filters.start ? { start: filters.start } : {}),
    ...(filters.end ? { end: filters.end } : {}),
    ...(filters.unassignedOnly ? { unassigned: "1" } : {}),
    ...(filters.slaRiskOnly ? { sla: "risk" } : {}),
  };

  function toggleStatusFilter(s: string) {
    const exists = filters.statuses.includes(s);
    const next = exists ? filters.statuses.filter((item) => item !== s) : [...filters.statuses, s];
    updateUrlParams({ status: next.length ? next.join(",") : null });
  }

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Filterable live job table · J/K to navigate, Enter to inspect, Esc to close"
        actions={
          <LiveRefreshBanner
            deltaCount={liveDeltaCount}
            isFetching={bookingsQuery.isFetching}
            onRefresh={() => {
              void bookingsQuery.refetch();
            }}
          />
        }
      />

      <SavedViewsBar
        views={views}
        currentFilters={activeFilterObject}
        onApply={(viewFilters) => {
          updateUrlParams({
            q: null,
            status: viewFilters.status ?? null,
            payment_status: viewFilters.payment_status ?? null,
            zone: viewFilters.zone ?? null,
            service: viewFilters.service ?? null,
            technician: viewFilters.technician ?? null,
            start: viewFilters.start ?? null,
            end: viewFilters.end ?? null,
            unassigned: viewFilters.unassigned ?? null,
            sla: viewFilters.sla ?? null,
          });
        }}
        onSave={(name, f) => saveView(name, f)}
        onRemove={removeView}
      />

      {/* Filter Bar */}
      <div className="mb-3 space-y-2 rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-3 shadow-[var(--op-shadow)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[210px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--op-muted)]" />
            <input
              value={filters.q}
              onChange={(e) => updateUrlParams({ q: e.target.value || null })}
              placeholder="Search booking ref or customer code..."
              className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] pl-8 pr-2.5 text-[12px]"
            />
          </div>

          <select
            aria-label="Zone filter"
            value={filters.zone}
            onChange={(e) => updateUrlParams({ zone: e.target.value || null })}
            className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
          >
            <option value="">All zones</option>
            {(zonesQuery.data ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} ({z.postal_code})
              </option>
            ))}
          </select>

          <select
            aria-label="Service filter"
            value={filters.service}
            onChange={(e) => updateUrlParams({ service: e.target.value || null })}
            className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
          >
            <option value="">All services</option>
            {(catalogQuery.data?.services ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Technician filter"
            value={filters.technician}
            onChange={(e) => updateUrlParams({ technician: e.target.value || null })}
            className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
          >
            <option value="">All technicians</option>
            {(techniciansQuery.data?.results ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Payment status filter"
            value={filters.payment_status}
            onChange={(e) => updateUrlParams({ payment_status: e.target.value || null })}
            className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
          >
            <option value="">All payment states</option>
            {["PAID", "ADVANCE_PAID", "UNPAID", "PENDING", "REFUND_PENDING"].map((ps) => (
              <option key={ps} value={ps}>
                {ps.replaceAll("_", " ")}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Start date"
            value={filters.start}
            onChange={(e) => updateUrlParams({ start: e.target.value || null })}
            className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
          />
          <input
            type="date"
            aria-label="End date"
            value={filters.end}
            onChange={(e) => updateUrlParams({ end: e.target.value || null })}
            className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
          />

          {(filters.q ||
            filters.statuses.length > 0 ||
            filters.payment_status ||
            filters.zone ||
            filters.service ||
            filters.technician ||
            filters.start ||
            filters.end ||
            filters.unassignedOnly ||
            filters.slaRiskOnly) && (
            <button
              type="button"
              onClick={() =>
                updateUrlParams({
                  q: null,
                  status: null,
                  payment_status: null,
                  zone: null,
                  service: null,
                  technician: null,
                  start: null,
                  end: null,
                  unassigned: null,
                  sla: null,
                })
              }
              className="inline-flex h-8 items-center gap-1 rounded border border-[var(--op-border)] px-2 text-[12px] text-[var(--op-muted)] hover:text-[var(--op-text)]"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Multi-status chip bar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--op-muted)]">
            <Filter className="h-3 w-3" /> Status:
          </span>
          {ALL_STATUSES.map((st) => {
            const active = filters.statuses.includes(st);
            return (
              <button
                key={st}
                type="button"
                onClick={() => toggleStatusFilter(st)}
                className={`rounded border px-2 py-0.5 text-[11px] font-medium transition ${
                  active
                    ? "border-[var(--op-brand)] bg-[var(--op-brand-soft)] text-[var(--op-brand)]"
                    : "border-[var(--op-border)] bg-[var(--op-surface-alt)] text-[var(--op-muted)] hover:text-[var(--op-text)]"
                }`}
              >
                {st.replaceAll("_", " ")}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => updateUrlParams({ unassigned: filters.unassignedOnly ? null : "1" })}
            className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
              filters.unassignedOnly
                ? "border-amber-500 bg-amber-50 text-amber-900"
                : "border-[var(--op-border)] bg-[var(--op-surface-alt)] text-[var(--op-muted)]"
            }`}
          >
            Unassigned only
          </button>
        </div>
      </div>

      {/* Bulk selection bar */}
      {checkedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--op-brand)] bg-[var(--op-brand-soft)] px-3 py-2 text-[12px]">
          <span className="font-semibold text-[var(--op-brand)]">{checkedIds.size} booking(s) selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="inline-flex items-center gap-1 rounded bg-[var(--op-brand)] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
            >
              <UserPlus className="h-3.5 w-3.5" /> Assign / Reassign
            </button>
            <button
              type="button"
              disabled
              title="Bulk customer notifications are not exposed under /api/v1/operations/"
              className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1 text-[12px] text-[var(--op-muted)] opacity-60"
            >
              <Send className="h-3.5 w-3.5" /> Notify (Admin only)
            </button>
            <button
              type="button"
              onClick={() => setCheckedIds(new Set())}
              className="rounded px-2 py-1 text-[12px] font-medium text-[var(--op-muted)] hover:text-[var(--op-text)]"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {bookingsQuery.isError ? (
        <ErrorState
          message={
            bookingsQuery.error instanceof Error ? bookingsQuery.error.message : "Could not load bookings."
          }
          onRetry={() => void bookingsQuery.refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={displayedRows}
          getRowKey={(row) => row.id}
          loading={bookingsQuery.isLoading}
          selectedIndex={selectedIndex}
          activeRowId={activeBookingId}
          onRowClick={(row, idx) => {
            setSelectedIndex(idx);
            openBookingDrawer(row.id);
          }}
          selectable
          checkedIds={checkedIds}
          onToggleCheck={(id) => {
            setCheckedIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onToggleCheckAll={(checked) => {
            if (checked) {
              setCheckedIds(new Set(displayedRows.map((r) => r.id)));
            } else {
              setCheckedIds(new Set());
            }
          }}
          emptyIcon={CalendarDays}
          emptyTitle="No bookings match current filters"
          emptyMessage="Try clearing filters or switching to another saved view."
          emptyAction={
            <button
              type="button"
              onClick={() => updateUrlParams({ q: null, status: null, payment_status: null, zone: null, service: null, technician: null, start: null, end: null, unassigned: null, sla: null })}
              className="rounded bg-[var(--op-brand)] px-3 py-1.5 text-[12px] font-semibold text-white"
            >
              Reset all filters
            </button>
          }
          pagination={
            bookingsQuery.data
              ? {
                  page,
                  count: bookingsQuery.data.count,
                  onPageChange: (nextPage) => updateUrlParams({ page: String(nextPage) }, false),
                }
              : undefined
          }
        />
      )}

      <ActionDialog
        open={bulkOpen}
        busy={bulkAssignMutation.isPending}
        title={`Bulk assign ${checkedIds.size} booking(s)`}
        description="Assigns eligible selected bookings to the chosen technician."
        confirmLabel="Run Bulk Assign"
        requireReason
        reasonLabel="Assignment reason"
        onClose={() => setBulkOpen(false)}
        onConfirm={async (reason) => {
          if (!bulkTechId) {
            toast("error", "Select a technician first.");
            return;
          }
          await bulkAssignMutation.mutateAsync({ technicianId: bulkTechId, reason });
        }}
      >
        <label className="block text-[12px] font-semibold">
          Technician
          <select
            value={bulkTechId}
            onChange={(e) => setBulkTechId(e.target.value)}
            className="mt-1 h-9 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
          >
            <option value="">Choose technician...</option>
            {(techniciansQuery.data?.results ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.online ? "Online" : "Offline"} · {t.active_jobs} active)
              </option>
            ))}
          </select>
        </label>
      </ActionDialog>
    </div>
  );
}
