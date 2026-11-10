"use client";

import type { OpsLead } from "@nammapros/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Download, Kanban, Plus, Search, Table as TableIcon, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { LeadDrawer } from "@/components/drawers/lead-drawer";
import { PhoneActions } from "@/components/ops/ops-contact-actions";
import { DataTable, type OpsColumn } from "@/components/ops/ops-data-table";
import { useOpsUi } from "@/components/ops/ops-providers";
import { ErrorState, KpiCard, LiveRefreshBanner, PageHeader, SavedViewsBar } from "@/components/ops/ops-states";
import { StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime, formatMoneyPaise } from "@/lib/format";
import { useSavedViews, useTableKeyboardShortcuts, useUrlDrawerParam, useNowTick } from "@/lib/hooks";

const BOARD_COLUMNS: { status: string; title: string }[] = [
  { status: "NEW", title: "New" },
  { status: "CONTACTED", title: "Contacted" },
  { status: "FOLLOW_UP", title: "Interested" },
  { status: "QUALIFIED", title: "Scheduled" },
  { status: "CONVERTED", title: "Converted" },
  { status: "LOST", title: "Lost" },
];

export function LeadsPage() {
  const { toast } = useOpsUi();
  const queryClient = useQueryClient();
  const [leadDrawerId, setLeadDrawerId] = useUrlDrawerParam("lead");

  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    service: "",
    area: "",
    source: "",
    priority: "",
  });

  const { views, saveView, removeView } = useSavedViews("leads", [
    { id: "all", name: "All leads", filters: {} },
    { id: "new-urgent", name: "New", filters: { status: "NEW" } },
    { id: "interested", name: "Interested", filters: { status: "FOLLOW_UP" } },
    { id: "qualified", name: "Ready to convert", filters: { status: "QUALIFIED" } },
  ]);

  const leadsQuery = useQuery({
    queryKey: ["ops", "leads", filters, page],
    queryFn: () => api.leads({ ...filters, page }),
  });

  const livePeekQuery = useQuery({
    queryKey: ["ops", "leads-peek", filters, page],
    queryFn: () => api.leads({ ...filters, page }),
    refetchInterval: 15_000,
    enabled: Boolean(leadsQuery.data),
  });

  const summaryQuery = useQuery({
    queryKey: ["ops", "lead-summary"],
    queryFn: () => api.leadSummary(),
    refetchInterval: 15_000,
  });

  const overdueQuery = useQuery({
    queryKey: ["ops", "lead-followups", "overdue"],
    queryFn: () => api.leadFollowUps("overdue", 1),
    refetchInterval: 15_000,
  });

  const catalogQuery = useQuery({
    queryKey: ["ops", "catalog"],
    queryFn: () => api.catalog(),
    staleTime: 60_000,
  });

  const rows = leadsQuery.data?.results ?? [];
  const nowMs = useNowTick(30_000);
  const overdueLeadIds = useMemo(
    () => new Set((overdueQuery.data?.results ?? []).map((f) => f.lead_id)),
    [overdueQuery.data]
  );

  const liveDeltaCount = useMemo(() => {
    if (!leadsQuery.data || !livePeekQuery.data) return 0;
    const diff = Math.abs(livePeekQuery.data.count - leadsQuery.data.count);
    if (diff > 0) return diff;
    const oldSig = leadsQuery.data.results.map((l) => `${l.id}:${l.status}:${l.updated_at ?? ""}`).join("|");
    const newSig = livePeekQuery.data.results.map((l) => `${l.id}:${l.status}:${l.updated_at ?? ""}`).join("|");
    return oldSig !== newSig ? 1 : 0;
  }, [leadsQuery.data, livePeekQuery.data]);

  useTableKeyboardShortcuts({
    rowCount: viewMode === "table" ? rows.length : 0,
    selectedIndex,
    onChangeIndex: setSelectedIndex,
    onOpenRow: (idx) => {
      if (rows[idx]) setLeadDrawerId(rows[idx].id);
    },
    drawerOpen: Boolean(leadDrawerId),
    onCloseDrawer: () => setLeadDrawerId(null),
  });

  const columns: OpsColumn<OpsLead>[] = [
    {
      key: "ref",
      header: "Ref",
      render: (l) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[12px] font-semibold">{l.lead_reference}</span>
          {overdueLeadIds.has(l.id) && (
            <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-bold text-red-700">OVERDUE</span>
          )}
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (l) => (
        <div>
          <div className="font-medium text-[var(--op-text)]">{l.customer_name}</div>
          <PhoneActions phone={l.mobile_number} compact />
        </div>
      ),
    },
    {
      key: "service",
      header: "Service",
      render: (l) => (
        <div>
          <div className="text-[13px]">{l.service}</div>
          <div className="text-[11px] font-mono text-[var(--op-muted)]">
            {formatMoneyPaise(l.quoted_amount_paise ?? l.service_price_paise, true)}
          </div>
        </div>
      ),
    },
    {
      key: "area",
      header: "Area / City",
      render: (l) => <span className="text-[12px]">{[l.area, l.city].filter(Boolean).join(", ") || "—"}</span>,
    },
    {
      key: "status",
      header: "Stage",
      render: (l) => <StatusBadge status={l.status} />,
    },
    {
      key: "priority",
      header: "Priority",
      render: (l) => <StatusBadge status={l.priority} />,
    },
    {
      key: "followup",
      header: "Next Follow-up",
      render: (l) => {
        const overdue =
          l.follow_up_at &&
          !["CONVERTED", "LOST", "CANCELLED"].includes(l.status) &&
          new Date(l.follow_up_at).getTime() < nowMs;
        return (
          <span className={`font-mono text-[12px] ${overdue ? "font-semibold text-red-600" : "text-[var(--op-muted)]"}`}>
            {l.follow_up_at ? formatIstDateTime(l.follow_up_at) : "—"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads CRM"
        subtitle="Pipeline board & follow-up queue · phone numbers respect staff contact permissions"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiveRefreshBanner
              deltaCount={liveDeltaCount}
              isFetching={leadsQuery.isFetching}
              onRefresh={() => void leadsQuery.refetch()}
            />
            <div className="inline-flex rounded border border-[var(--op-border)] bg-[var(--op-surface)] p-0.5 text-[12px]">
              <button
                type="button"
                onClick={() => setViewMode("board")}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium ${
                  viewMode === "board" ? "bg-[var(--op-brand)] text-white" : "text-[var(--op-muted)]"
                }`}
              >
                <Kanban className="h-3.5 w-3.5" /> Board
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium ${
                  viewMode === "table" ? "bg-[var(--op-brand)] text-white" : "text-[var(--op-muted)]"
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" /> Table
              </button>
            </div>
            <a
              href={api.leadExportUrl(filters.status ? { status: filters.status } : {})}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)]"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </a>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-[var(--op-brand)] px-3 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
            >
              <Plus className="h-3.5 w-3.5" /> New Lead
            </button>
          </div>
        }
      />

      {/* Summary strip */}
      {summaryQuery.data && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Total Leads" value={summaryQuery.data.total} />
          <KpiCard label="New" value={summaryQuery.data.new} accent="brand" />
          <KpiCard
            label="Follow-ups Due"
            value={summaryQuery.data.follow_ups_due}
            accent={summaryQuery.data.follow_ups_due > 0 ? "danger" : "default"}
          />
          <KpiCard label="Qualified" value={summaryQuery.data.qualified} />
          <KpiCard label="Converted" value={summaryQuery.data.converted} accent="success" />
          <KpiCard label="Conversion Rate" value={`${summaryQuery.data.conversion_rate}%`} />
        </div>
      )}

      {/* Overdue follow-up alert strip */}
      {(overdueQuery.data?.results.length ?? 0) > 0 && (
        <section className="rounded-lg border border-red-200 bg-red-50/70 p-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-red-800">
            Overdue Follow-ups ({overdueQuery.data?.count})
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {overdueQuery.data?.results.slice(0, 8).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setLeadDrawerId(f.lead_id)}
                className="rounded border border-red-300 bg-white px-2.5 py-1 text-left text-[12px] hover:border-red-500"
              >
                <span className="font-mono font-semibold text-red-800">{f.lead_reference}</span> · {f.customer_name}{" "}
                <span className="text-[11px] text-red-700">({formatIstDateTime(f.due_at)})</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <SavedViewsBar
        views={views}
        currentFilters={filters}
        onApply={(f) => {
          setFilters((prev) => ({ ...prev, ...f }));
          setPage(1);
        }}
        onSave={(name, f) => saveView(name, f)}
        onRemove={removeView}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-3 shadow-[var(--op-shadow)]">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--op-muted)]" />
          <input
            value={filters.q}
            onChange={(e) => {
              setFilters((f) => ({ ...f, q: e.target.value }));
              setPage(1);
            }}
            placeholder="Search ref, customer name, mobile..."
            className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] pl-8 pr-2.5 text-[12px]"
          />
        </div>
        <select
          aria-label="Lead status filter"
          value={filters.status}
          onChange={(e) => {
            setFilters((f) => ({ ...f, status: e.target.value }));
            setPage(1);
          }}
          className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
        >
          <option value="">All stages</option>
          {BOARD_COLUMNS.map((c) => (
            <option key={c.status} value={c.status}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Lead service filter"
          value={filters.service}
          onChange={(e) => {
            setFilters((f) => ({ ...f, service: e.target.value }));
            setPage(1);
          }}
          className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
        >
          <option value="">All services</option>
          {(catalogQuery.data?.services ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Area"
          value={filters.area}
          onChange={(e) => {
            setFilters((f) => ({ ...f, area: e.target.value }));
            setPage(1);
          }}
          className="h-8 w-36 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
        />
      </div>

      {leadsQuery.isError ? (
        <ErrorState
          message={leadsQuery.error instanceof Error ? leadsQuery.error.message : "Could not load leads."}
          onRetry={() => void leadsQuery.refetch()}
        />
      ) : viewMode === "board" ? (
        <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-6">
          {BOARD_COLUMNS.map((col) => {
            const colLeads = rows.filter((l) => l.status === col.status);
            return (
              <div
                key={col.status}
                className="min-w-[230px] rounded-lg border border-[var(--op-border)] bg-[var(--op-surface-alt)] p-2.5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--op-muted)]">
                    {col.title}
                  </span>
                  <span className="rounded bg-[var(--op-surface)] px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                    {colLeads.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colLeads.length === 0 ? (
                    <p className="py-6 text-center text-[11px] text-[var(--op-muted)]">No leads</p>
                  ) : (
                    colLeads.map((l) => {
                      const overdue =
                        overdueLeadIds.has(l.id) ||
                        Boolean(
                          l.follow_up_at &&
                            !["CONVERTED", "LOST", "CANCELLED"].includes(l.status) &&
                            new Date(l.follow_up_at).getTime() < nowMs
                        );
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setLeadDrawerId(l.id)}
                          className={`w-full rounded border bg-[var(--op-surface)] p-2.5 text-left transition hover:border-[var(--op-brand)] ${
                            overdue ? "border-red-300" : "border-[var(--op-border)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[11px] font-semibold text-[var(--op-muted)]">
                              {l.lead_reference}
                            </span>
                            <StatusBadge status={l.priority} />
                          </div>
                          <p className="mt-1 truncate text-[13px] font-semibold text-[var(--op-text)]">
                            {l.customer_name}
                          </p>
                          <p className="truncate text-[11px] text-[var(--op-muted)]">{l.service}</p>
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="text-[var(--op-muted)]">{l.area || l.city || "—"}</span>
                            {overdue && <span className="font-semibold text-red-600">Overdue</span>}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={leadsQuery.isLoading}
          selectedIndex={selectedIndex}
          activeRowId={leadDrawerId}
          onRowClick={(r, idx) => {
            setSelectedIndex(idx);
            setLeadDrawerId(r.id);
          }}
          emptyIcon={ClipboardList}
          emptyTitle="No leads found"
          emptyMessage="Create a new lead or widen your search filters."
          pagination={
            leadsQuery.data
              ? { page, count: leadsQuery.data.count, onPageChange: setPage }
              : undefined
          }
        />
      )}

      {createOpen && (
        <CreateLeadModal
          catalog={catalogQuery.data}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            toast("success", `Lead ${created.lead_reference} created`);
            setCreateOpen(false);
            setLeadDrawerId(created.id);
            void queryClient.invalidateQueries({ queryKey: ["ops", "leads"] });
            void queryClient.invalidateQueries({ queryKey: ["ops", "lead-summary"] });
          }}
        />
      )}

      <LeadDrawer leadId={leadDrawerId} onClose={() => setLeadDrawerId(null)} />
    </div>
  );
}

function CreateLeadModal({
  catalog,
  onClose,
  onCreated,
}: {
  catalog: Awaited<ReturnType<typeof api.catalog>> | undefined;
  onClose: () => void;
  onCreated: (lead: OpsLead) => void;
}) {
  const { toast } = useOpsUi();
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("+91");
  const [categoryId, setCategoryId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [source, setSource] = useState("PHONE_CALL");
  const [priority, setPriority] = useState("NORMAL");
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { id: string; description: string; main_text: string }[]
  >([]);
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [coords, setCoords] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude: null,
    longitude: null,
  });
  const [problem, setProblem] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.createLead({
        customer_name: customerName.trim(),
        mobile_number: mobile.trim(),
        service_category_id: categoryId,
        service_id: serviceId,
        source,
        priority,
        address,
        area,
        city,
        pincode,
        latitude: coords.latitude,
        longitude: coords.longitude,
        problem_description: problem,
      }),
    onSuccess: onCreated,
    onError: (err) => {
      toast("error", "Could not create lead", err instanceof Error ? err.message : undefined);
    },
  });

  async function searchAddress(val: string) {
    setAddressQuery(val);
    if (val.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await api.locationAutocomplete(val.trim());
      setSuggestions(res.suggestions);
    } catch {
      setSuggestions([]);
    }
  }

  async function pickSuggestion(id: string) {
    try {
      const geo = await api.locationGeocode(id);
      setAddress(geo.formatted_address);
      setArea(geo.locality);
      setCity(geo.city);
      setPincode(geo.postal_code);
      setCoords({ latitude: geo.latitude, longitude: geo.longitude });
      setAddressQuery(geo.formatted_address);
      setSuggestions([]);
    } catch {
      toast("error", "Could not resolve selected location");
    }
  }

  const selectedCatSlug = catalog?.categories.find((c) => c.id === categoryId)?.slug;
  const filteredServices = (catalog?.services ?? []).filter((s) =>
    selectedCatSlug ? s.category === selectedCatSlug : true
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create new lead"
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-5 shadow-xl space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[var(--op-text)]">Create New Lead</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-[var(--op-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[12px] font-semibold">
            Customer Name *
            <input
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
            />
          </label>
          <label className="text-[12px] font-semibold">
            Mobile Number (+91) *
            <input
              required
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+919876543210"
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
            />
          </label>
          <label className="text-[12px] font-semibold">
            Category *
            <select
              required
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setServiceId("");
              }}
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
            >
              <option value="">Choose category...</option>
              {(catalog?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-semibold">
            Service *
            <select
              required
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
            >
              <option value="">Choose service...</option>
              {filteredServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-semibold">
            Source
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
            >
              {["PHONE_CALL", "WHATSAPP", "WEBSITE", "WALK_IN", "REFERRAL", "CAMPAIGN", "OTHER"].map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-semibold">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
            >
              {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[12px] font-semibold">
            Location Search (Google Maps Autocomplete)
            <input
              value={addressQuery}
              onChange={(e) => void searchAddress(e.target.value)}
              placeholder="Type street, locality, landmark..."
              className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[13px]"
            />
          </label>
          {suggestions.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded border border-[var(--op-border)] bg-[var(--op-surface)] divide-y divide-[var(--op-border)]">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void pickSuggestion(s.id)}
                  className="block w-full px-2.5 py-1.5 text-left text-[12px] hover:bg-[var(--op-row-hover)]"
                >
                  {s.description}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              placeholder="Area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            />
            <input
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            />
            <input
              placeholder="PIN code"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            />
          </div>
        </div>

        <label className="block text-[12px] font-semibold">
          Problem Description
          <textarea
            rows={2}
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            className="mt-1 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] p-2 text-[13px]"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--op-border)] px-3 py-1.5 text-[12px] font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded bg-[var(--op-brand)] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-50"
          >
            {createMutation.isPending ? "Saving..." : "Create Lead"}
          </button>
        </div>
      </form>
    </div>
  );
}
