"use client";

import React, { useEffect, useState } from "react";
import {
  Users,
  Search,
  ArrowLeft,
  Calendar,
  Clock,
  Phone,
  Tag,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { api } from "../lib/api";
import { AdminStatusBadge } from "./admin/admin-status-badge";
import { AdminMetricCard } from "./admin/admin-metric-card";
import { AdminDataTable, AdminColumn } from "./admin/admin-data-table";
import { AdminPagination } from "./admin/admin-pagination";
import { AdminErrorState } from "./admin/admin-error-state";
import { AdminLeadDetailWorkspace } from "./admin-lead-workspace";

type Lead = {
  id: string;
  lead_reference?: string;
  customer_name: string;
  mobile_number: string;
  alternate_mobile?: string;
  email?: string;
  service_category?: string;
  service?: string;
  service_id?: string;
  area?: string;
  city?: string;
  pincode?: string;
  address?: string;
  landmark?: string;
  source: string;
  status: string;
  priority: string;
  urgency?: string;
  assigned_to?: number | null;
  assigned_to_phone?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  follow_up_at?: string | null;
  converted_booking_id?: string | null;
  problem_description?: string;
  internal_notes?: string;
  created_at: string;
  updated_at: string;
  activities?: Array<{
    kind: string;
    detail: Record<string, unknown>;
    created_at: string;
    actor_id?: number | null;
  }>;
  follow_ups?: Array<{
    id: string;
    due_at: string;
    notes: string;
    assigned_to?: number | null;
    completed_at?: string | null;
  }>;
};

type Summary = {
  total: number;
  new: number;
  follow_ups_due: number;
  qualified: number;
  converted: number;
  conversion_rate: number;
};

export default function AdminLeads({
  id,
  canEdit,
}: {
  id?: string;
  canEdit: boolean;
}) {
  if (id) {
    return <AdminLeadDetailWorkspace leadId={id} canEdit={canEdit} />;
  }
  return <AdminLeadsList />;
}

function AdminLeadsList() {
  const id = "";
  const canEdit = true;
  const [list, setList] = useState<{ count: number; results: Lead[] }>({
    count: 0,
    results: [],
  });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filter and pagination state
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [source, setSource] = useState("");

  // Edit lead state
  const [editStatus, setEditStatus] = useState("NEW");
  const [editPriority, setEditPriority] = useState("NORMAL");
  const [editOwner, setEditOwner] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [convertNotes, setConvertNotes] = useState("");
  const [showConvertModal, setShowConvertModal] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      if (id) {
        const leadData = await api<Lead>(`/operations/leads/${id}/`);
        setLead(leadData);
        setEditStatus(leadData.status);
        setEditPriority(leadData.priority);
        setEditOwner(leadData.assigned_to ? String(leadData.assigned_to) : "");
        setEditNotes(leadData.internal_notes || "");
      } else {
        const params = new URLSearchParams({ page: String(page) });
        if (q) params.set("q", q);
        if (status) params.set("status", status);
        if (priority) params.set("priority", priority);
        if (source) params.set("source", source);

        const [rows, metrics] = await Promise.all([
          api<{ count: number; results: Lead[] }>(`/operations/leads/?${params}`),
          api<Summary>("/operations/leads/summary/").catch(() => null),
        ]);
        setList(rows);
        if (metrics) setSummary(metrics);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    if (!id) {
      const interval = setInterval(reload, 30000);
      return () => clearInterval(interval);
    }
  }, [id, page, q, status, priority, source]);

  const handleSaveLead = async () => {
    if (!id) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body: Record<string, unknown> = {
        status: editStatus,
        priority: editPriority,
        assigned_to: editOwner ? Number(editOwner) : null,
        internal_notes: editNotes,
      };
      if (editStatus === "LOST") {
        const reason = window.prompt("Reason for loss (required):");
        if (!reason) {
          setBusy(false);
          return;
        }
        body.loss_reason = reason;
      }
      await api(`/operations/leads/${id}/`, "PATCH", body);
      setNotice("Lead updated successfully.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update lead.");
    } finally {
      setBusy(false);
    }
  };

  const handleConvertLead = async () => {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await api(`/operations/leads/${id}/convert/`, "POST", { notes: convertNotes });
      setShowConvertModal(false);
      setNotice("Lead converted to confirmed booking successfully!");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to convert lead.");
    } finally {
      setBusy(false);
    }
  };

  // Lead List View
  if (!id) {
    const columns: AdminColumn<Lead>[] = [
      {
        key: "reference",
        header: "Lead Reference",
        render: (l) => (
          <div>
            <a
              href={`/leads/${l.id}`}
              className="font-bold text-teal-800 hover:text-teal-900 hover:underline flex items-center gap-1"
            >
              <span>{l.lead_reference || l.id.slice(0, 8).toUpperCase()}</span>
              <ChevronRight className="h-3 w-3 text-slate-400" />
            </a>
            <span className="text-[11px] text-slate-400 font-mono">
              {new Date(l.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ),
      },
      {
        key: "customer",
        header: "Customer",
        render: (l) => (
          <div>
            <p className="font-semibold text-slate-900">{l.customer_name}</p>
            <a
              href={`tel:${l.mobile_number}`}
              className="text-xs text-teal-700 hover:underline flex items-center gap-1 mt-0.5"
            >
              <Phone className="h-3 w-3" />
              <span>{l.mobile_number}</span>
            </a>
          </div>
        ),
      },
      {
        key: "service",
        header: "Service & Area",
        render: (l) => (
          <div>
            <span className="font-medium text-slate-900">{l.service || "Unassigned Service"}</span>
            <span className="block text-xs text-slate-500">
              {[l.area, l.city].filter(Boolean).join(", ") || "Location not given"}
            </span>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (l) => (
          <div className="flex flex-col gap-1 items-start">
            <AdminStatusBadge status={l.status} />
            {l.priority === "HIGH" || l.priority === "URGENT" ? (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                {l.priority}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "source",
        header: "Source / Assignee",
        render: (l) => (
          <div>
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              {l.source}
            </span>
            <span className="block text-xs text-slate-500">
              {l.assigned_to_phone ? `Staff: ${l.assigned_to_phone}` : "Unassigned"}
            </span>
          </div>
        ),
      },
      {
        key: "booking",
        header: "Booking",
        render: (l) =>
          l.converted_booking_id ? (
            <a
              href={`/bookings/${l.converted_booking_id}`}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              <span>View Job</span>
            </a>
          ) : (
            <span className="text-xs text-slate-400">Pre-booking</span>
          ),
      },
      {
        key: "actions",
        header: "Action",
        render: (l) => (
          <a
            href={`/leads/${l.id}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-slate-50 transition shadow-xs"
          >
            Manage
          </a>
        ),
      },
    ];

    return (
      <div className="space-y-6">
        {/* Metric Cards Banner */}
        {summary && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <AdminMetricCard icon={Users} label="Total Leads" value={String(summary.total)} />
            <AdminMetricCard icon={Sparkles} label="New Leads" value={String(summary.new)} />
            <AdminMetricCard icon={Clock} label="Follow-ups Due" value={String(summary.follow_ups_due)} />
            <AdminMetricCard icon={CheckCircle2} label="Qualified" value={String(summary.qualified)} />
            <AdminMetricCard icon={ExternalLink} label="Converted" value={String(summary.converted)} />
            <AdminMetricCard
              icon={Tag}
              label="Conversion Rate"
              value={`${summary.conversion_rate ?? 0}%`}
            />
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search reference, customer name, mobile, service..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 outline-none focus:border-teal-700 focus:bg-white transition"
              />
            </div>

            {/* Dropdown Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-700"
              >
                <option value="">All Statuses</option>
                {["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "LOST", "CANCELLED"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  )
                )}
              </select>

              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-700"
              >
                <option value="">All Priorities</option>
                {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-700"
              >
                <option value="">All Sources</option>
                {[
                  "PHONE_CALL",
                  "WHATSAPP",
                  "WEBSITE",
                  "WALK_IN",
                  "REFERRAL",
                  "CAMPAIGN",
                  "OTHER",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {(q || status || priority || source) && (
                <button
                  onClick={() => {
                    setQ("");
                    setStatus("");
                    setPriority("");
                    setSource("");
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lead List Table */}
        {loading ? (
          <div className="grid min-h-[30vh] place-items-center rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
              <p className="text-xs text-slate-500 font-medium">Loading leads...</p>
            </div>
          </div>
        ) : error ? (
          <AdminErrorState message={error} onRetry={reload} />
        ) : (
          <div className="space-y-4">
            <AdminDataTable
              columns={columns}
              rows={list.results}
              getRowKey={(l) => l.id}
              emptyIcon={Users}
              emptyTitle="No leads found"
              emptyMessage="Customer enquiries and pre-payment leads will appear here."
            />

            <AdminPagination
              count={list.count}
              page={page}
              pageSize={20}
              hasNext={page * 20 < list.count}
              hasPrevious={page > 1}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>
    );
  }

  // Lead Detail View
  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
      </div>
    );
  }

  if (error || !lead) {
    return <AdminErrorState message={error || "Lead not found."} onRetry={reload} />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <a
            href="/leads"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800 hover:underline mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Lead List
          </a>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Lead #{lead.lead_reference || lead.id.slice(0, 8).toUpperCase()}
            </h1>
            <AdminStatusBadge status={lead.status} />
          </div>
        </div>

        {/* Lead Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && lead.status !== "CONVERTED" && (
            <button
              onClick={() => setShowConvertModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-800 transition"
            >
              <CheckCircle2 className="h-4 w-4" /> Convert to Booking
            </button>
          )}
          {lead.converted_booking_id && (
            <a
              href={`/bookings/${lead.converted_booking_id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
            >
              <ExternalLink className="h-4 w-4" /> View Converted Booking
            </a>
          )}
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800 shadow-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}

      {/* Grid: Overview Details + Operational Controls */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Customer & Service Profile */}
        <div className="space-y-6 lg:col-span-2">
          {/* Customer & Location Card */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
              Customer Information
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Full Name
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {lead.customer_name}
                </dd>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Phone Number
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  <a href={`tel:${lead.mobile_number}`} className="text-teal-700 hover:underline">
                    {lead.mobile_number}
                  </a>
                  {lead.alternate_mobile && (
                    <span className="block text-xs text-slate-500">Alt: {lead.alternate_mobile}</span>
                  )}
                </dd>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 sm:col-span-2">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Service Requested
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {lead.service || "Unspecified Service"}
                  {lead.service_category && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800 border border-teal-200">
                      {lead.service_category}
                    </span>
                  )}
                </dd>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 sm:col-span-2">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Address & Area
                </dt>
                <dd className="mt-1 text-sm font-medium text-slate-700">
                  {[lead.address, lead.landmark, lead.area, lead.city, lead.pincode]
                    .filter(Boolean)
                    .join(", ") || "No address provided"}
                </dd>
              </div>

              {lead.problem_description && (
                <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 sm:col-span-2">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Customer Problem Description
                  </dt>
                  <dd className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">
                    {lead.problem_description}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Activity Timeline Card */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
              Lead Activity Timeline
            </h2>
            {lead.activities && lead.activities.length > 0 ? (
              <ol className="relative border-l border-slate-200 ml-3 space-y-4">
                {lead.activities.map((a, i) => (
                  <li key={i} className="mb-4 ml-4">
                    <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-teal-600" />
                    <time className="text-[11px] font-semibold text-slate-400">
                      {new Date(a.created_at).toLocaleString("en-IN")}
                    </time>
                    <p className="text-xs font-bold text-slate-900 mt-0.5">{a.kind}</p>
                    {a.detail && Object.keys(a.detail).length > 0 && (
                      <p className="text-xs text-slate-600 font-mono mt-1 bg-slate-50 p-2 rounded border border-slate-100">
                        {JSON.stringify(a.detail)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-slate-400 font-medium">No recorded activities yet.</p>
            )}
          </section>
        </div>

        {/* Right Column: Lead Management & Update Controls */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Manage Lead Status
            </h2>

            {canEdit ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-700"
                  >
                    {[
                      "NEW",
                      "CONTACTED",
                      "FOLLOW_UP",
                      "QUALIFIED",
                      "CONVERTED",
                      "LOST",
                      "CANCELLED",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Priority
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-700"
                  >
                    {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Assigned Staff User ID
                  </label>
                  <input
                    type="number"
                    value={editOwner}
                    onChange={(e) => setEditOwner(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-teal-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Internal Staff Notes
                  </label>
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Customer preference, conversation notes..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-teal-700"
                  />
                </div>

                <button
                  onClick={handleSaveLead}
                  disabled={busy}
                  className="w-full rounded-lg bg-teal-700 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50 transition"
                >
                  {busy ? "Updating..." : "Save Changes"}
                </button>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-slate-600">
                <p><strong>Status:</strong> {lead.status}</p>
                <p><strong>Priority:</strong> {lead.priority}</p>
                <p><strong>Source:</strong> {lead.source}</p>
                <p><strong>Assigned:</strong> {lead.assigned_to_phone || "None"}</p>
              </div>
            )}
          </section>

          {/* Follow-up Section */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Next Follow-Up
            </h2>
            <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-xs font-semibold text-amber-900">
                {lead.follow_up_at
                  ? new Date(lead.follow_up_at).toLocaleString("en-IN")
                  : "No follow-up scheduled"}
              </span>
            </div>
          </section>
        </div>
      </div>

      {/* Convert to Booking Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Convert Lead to Booking</h3>
            <p className="text-xs text-slate-500">
              This will create a confirmed booking for customer <strong>{lead.customer_name}</strong> and link it to this lead.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                Conversion Notes (Optional)
              </label>
              <textarea
                rows={3}
                value={convertNotes}
                onChange={(e) => setConvertNotes(e.target.value)}
                placeholder="Special service instructions, customer confirmation..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-teal-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConvertModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConvertLead}
                className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {busy ? "Converting..." : "Confirm Conversion"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
