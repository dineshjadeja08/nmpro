"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Plus,
  RefreshCw,
  Users,
  Wrench,
  Package,
  Layers,
  MapPin,
  Clock,
  Sparkles,
} from "lucide-react";
import { api, clearCsrf, Row } from "../lib/api";
import Verification from "./verification";
import AdminLeads from "./leads";
import LeadZoneGrants from "./lead-zone-grants";
import BookingControls from "./booking-controls";
import { AdminServicesScreen } from "./admin-catalogue-screens";
import { AdminLeadCreateScreen } from "./admin-lead-workspace";
import { AdminTechniciansDirectory, AdminTechnicianWorkspace } from "./admin-technician-workspace";

import { AdminBrand } from "./admin/admin-brand";
import { AdminSidebar } from "./admin/admin-sidebar";
import { AdminTopbar } from "./admin/admin-topbar";
import { AdminPageHeader } from "./admin/admin-page-header";
import { AdminMetricCard } from "./admin/admin-metric-card";
import { AdminDataTable, AdminColumn } from "./admin/admin-data-table";
import { AdminPagination } from "./admin/admin-pagination";
import { AdminStatusBadge } from "./admin/admin-status-badge";
import { AdminErrorState } from "./admin/admin-error-state";
import { AdminEmptyState } from "./admin/admin-empty-state";
import { AdminBookingDrawer } from "./admin-booking-drawer";

type Me = { id: number; phone_e164: string; roles: string[]; capabilities: string[] };
type Field = { key: string; label?: string; type?: "number" | "date" | "datetime-local" | "checkbox" | "json"; required?: boolean };
type View = { title: string; endpoint: string; fields?: Field[]; permission?: string; detail?: boolean };

const views: Record<string, View> = {
  "/bookings": { title: "Bookings", endpoint: "/admin/bookings/", detail: true },
  "/work-orders": { title: "Work Orders", endpoint: "/admin/work-orders/", detail: true },
  "/customers": { title: "Customers", endpoint: "/admin/customers/", detail: true },
  "/technicians": { title: "Technicians", endpoint: "/admin/technicians/", detail: true },
  "/assignments": { title: "Technician Assignments", endpoint: "/operations/dispatch/candidates/" },
  "/scheduling": { title: "Scheduling & Active Slots", endpoint: "/operations/schedule/" },
  "/services": {
    title: "Services",
    endpoint: "/admin/services/",
    fields: [
      { key: "category_id", required: true },
      { key: "slug", required: true },
      { key: "name", required: true },
      { key: "summary" },
      { key: "description" },
      { key: "starting_price_paise", type: "number" },
      { key: "cover_image_url" },
      { key: "landing_thumbnail_url" },
      { key: "list_image_url" },
      { key: "popup_cover_image_url" },
      { key: "popup_content_image_url" },
      { key: "sort_order", type: "number" },
      { key: "is_active", type: "checkbox" },
    ],
  },
  "/services/categories": {
    title: "Categories",
    endpoint: "/admin/categories/",
    fields: [
      { key: "slug", required: true },
      { key: "name", required: true },
      { key: "description" },
      { key: "image_url" },
      { key: "sort_order", type: "number" },
      { key: "is_active", type: "checkbox" },
    ],
  },
  "/services/packages": {
    title: "Packages",
    endpoint: "/admin/packages/",
    fields: [
      { key: "service_id", required: true },
      { key: "name", required: true },
      { key: "description" },
      { key: "requirements", type: "json" },
      { key: "pricing_model", required: true },
      { key: "duration_minutes", type: "number", required: true },
      { key: "inclusions", type: "json" },
      { key: "exclusions", type: "json" },
      { key: "skill_code", required: true },
      { key: "is_active", type: "checkbox" },
    ],
  },
  "/pricing": {
    title: "Pricing",
    endpoint: "/admin/pricing/",
    permission: "MANAGE_PRICING",
    fields: [
      { key: "package_id", required: true },
      { key: "zone_id", required: true },
      { key: "base_paise", type: "number" },
      { key: "inspection_paise", type: "number" },
      { key: "fee_paise", type: "number" },
      { key: "tax_paise", type: "number" },
      { key: "payment_policy", required: true },
      { key: "advance_type" },
      { key: "advance_percentage", type: "number" },
      { key: "advance_amount_paise", type: "number" },
      { key: "cancellation_cutoff_minutes", type: "number" },
      { key: "reschedule_cutoff_minutes", type: "number" },
      { key: "is_active", type: "checkbox" },
    ],
  },
  "/zones": {
    title: "Service Areas (Zones)",
    endpoint: "/admin/zones/",
    fields: [
      { key: "city_id" },
      { key: "city_name" },
      { key: "name", required: true },
      { key: "postal_code", required: true },
      { key: "state" },
      { key: "operational_capacity", type: "number" },
      { key: "working_hours", type: "json" },
      { key: "is_active", type: "checkbox" },
    ],
  },
  "/finance/payments": { title: "Captured Payments", endpoint: "/admin/finance/payments/", permission: "VIEW_FINANCE" },
  "/finance/refunds": { title: "Refunds", endpoint: "/admin/finance/refunds/", permission: "VIEW_FINANCE" },
  "/finance/settlements": { title: "Technician Settlements", endpoint: "/admin/settlements/", permission: "VIEW_FINANCE" },
  "/finance/payouts": { title: "Payouts", endpoint: "/admin/payouts/", permission: "VIEW_FINANCE" },
  "/finance/invoices": { title: "Invoices", endpoint: "/admin/finance/invoices/", permission: "VIEW_FINANCE" },
  "/finance/ledger": { title: "Ledger", endpoint: "/admin/finance/ledger/", permission: "VIEW_FINANCE" },
  "/commissions": {
    title: "Commission Rules",
    endpoint: "/admin/commissions/",
    permission: "VIEW_FINANCE",
    fields: [
      { key: "name", required: true },
      { key: "package_id" },
      { key: "category_id" },
      { key: "technician_id" },
      { key: "kind", required: true },
      { key: "amount_paise", type: "number" },
      { key: "basis_points", type: "number" },
      { key: "percentage_base" },
      { key: "effective_from", type: "datetime-local", required: true },
      { key: "effective_until", type: "datetime-local" },
    ],
  },
  "/staff": {
    title: "Staff and Roles",
    endpoint: "/admin/staff/",
    permission: "MANAGE_STAFF",
    fields: [
      { key: "phone_e164", required: true },
      { key: "role", required: true },
    ],
  },
  "/notifications": { title: "Notifications", endpoint: "/admin/notifications/" },
  "/audit-logs": { title: "Audit Logs", endpoint: "/admin/audit-logs/", permission: "VIEW_AUDIT" },
};

const title = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const display = (value: unknown, key = "") => {
  if (value === null || value === undefined || value === "") return "—";
  if (key.endsWith("_paise") && typeof value === "number") {
    return `₹${(value / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const pickRows = (data: unknown): { rows: Row[]; count: number } => {
  if (data && typeof data === "object") {
    const object = data as Record<string, unknown>;
    if (Array.isArray(object.results)) {
      return { rows: object.results as Row[], count: Number(object.count ?? object.results.length) };
    }
    for (const key of ["invoices", "refunds", "payments", "accounts", "roles", "coverage", "candidates", "available_slots", "slots", "bookings"]) {
      if (Array.isArray(object[key])) return { rows: object[key] as Row[], count: (object[key] as unknown[]).length };
    }
  }
  return { rows: [], count: 0 };
};

export default function Portal() {
  const path = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [phone, setPhone] = useState("+91");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState("30d");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [data, setData] = useState<unknown>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Row | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [pendingKycCount, setPendingKycCount] = useState(0);

  useEffect(() => {
    if (!me) return;
    api<{ count?: number }>("/admin/technicians/?status=UNDER_REVIEW")
      .then((res) => setPendingKycCount(Number(res.count ?? 0)))
      .catch(() => {});
  }, [me, refresh]);

  const detailMatch = path.match(/^\/(bookings|customers|technicians|work-orders)\/([^/]+)$/);
  const listPath = detailMatch ? `/${detailMatch[1]}` : path;
  const isServicesSection = path === "/services" || (path.startsWith("/services/") && path !== "/services/packages");
  const serviceRouteSegments = isServicesSection
    ? path.replace(/^\/services\/?/, "").split("/").filter(Boolean)
    : [];
  const routeCategorySlug =
    serviceRouteSegments[0] && serviceRouteSegments[0] !== "categories" ? serviceRouteSegments[0] : undefined;
  const routeServiceSlug = routeCategorySlug ? serviceRouteSegments[1] : undefined;
  const config = views[listPath];

  const query = useMemo(() => {
    const q = new URLSearchParams({ page: String(page) });
    if (search) q.set("q", search);
    if (status) q.set("status", status);
    if (period !== "custom") q.set("period", period);
    if (period === "custom" && start && end) {
      q.set("start", start);
      q.set("end", end);
    }
    return q.toString();
  }, [page, search, status, period, start, end]);

  useEffect(() => {
    api<Me>("/admin/me/")
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoadingAuth(false));
  }, []);

  const endpoint = detailMatch && config ? `${detailMatch[1] === "work-orders" ? "/admin/bookings/" : config.endpoint}${detailMatch[2]}/` : config?.endpoint;
  const resource =
    path === "/dashboard"
      ? "/admin/dashboard/"
      : path === "/finance"
      ? "/admin/finance/overview/"
      : path === "/roles"
      ? "/admin/roles/"
      : path === "/settings" || path === "/website/carousel"
      ? "/admin/settings/"
      : path === "/reports"
      ? "/admin/reports/bookings/"
      : endpoint;

  const load = useCallback(async () => {
    if (
      !me ||
      !resource ||
      ["/technicians/verification", "/technicians", "/leads/create", "/reviews", "/faqs", "/website/banners"].includes(path) ||
      isServicesSection ||
      detailMatch?.[1] === "technicians"
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      setData(await api(`${resource}${resource.includes("?") ? "&" : "?"}${query}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load data.");
    } finally {
      setBusy(false);
    }
  }, [me, resource, query, path]);

  useEffect(() => {
    load();
  }, [load, refresh]);

  useEffect(() => {
    setPage(1);
    setSearch("");
    setStatus("");
    setData(null);
    setShowForm(false);
  }, [path]);

  const action = async (url: string, method: string, body?: unknown, confirmText?: string, idempotency = false) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(url, method, body, idempotency ? crypto.randomUUID() : undefined);
      setNotice("Saved successfully. Current view refreshed.");
      setRefresh((n) => n + 1);
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await api("/auth/logout/", "POST");
    clearCsrf();
    setMe(null);
    router.push("/login");
  };

  const signIn = async () => {
    setBusy(true);
    setError("");
    try {
      if (!challenge) {
        const r = await api<{ challenge_id: string; development_code?: string }>("/auth/otp/request/", "POST", { phone_e164: phone });
        setChallenge(r.challenge_id);
        setDevCode(r.development_code ?? "");
      } else {
        await api("/auth/otp/verify/", "POST", { phone_e164: phone, challenge_id: challenge, code });
        clearCsrf();
        setMe(await api<Me>("/admin/me/"));
        router.push("/dashboard");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  const can = (permission: string) => me?.capabilities.includes(permission) ?? false;

  if (loadingAuth) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Authenticating Staff...</p>
        </div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="text-center">
            <span className="text-3xl font-black text-slate-900 tracking-tight">
              nammapros<span className="text-teal-600">.</span>
            </span>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-teal-700">Staff Control Console</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Admin Sign In</h1>
            <p className="mt-1 text-xs text-slate-500">Sign in with an approved phone number to manage platform operations</p>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Phone Number</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
                placeholder="+91..."
              />
            </div>

            {challenge && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">One Time Code (OTP)</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="one-time-code"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
                  placeholder="6-digit code"
                />
              </div>
            )}

            {devCode && (
              <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 text-xs text-teal-900 font-semibold">
                Development Test Code: <span className="font-mono font-bold text-teal-950">{devCode}</span>
              </div>
            )}

            {error && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">{error}</div>}

            <button
              onClick={signIn}
              disabled={busy}
              className="w-full rounded-lg bg-teal-700 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-teal-800 disabled:opacity-50 transition"
            >
              {busy ? "Processing..." : challenge ? "Verify & Sign In" : "Send Verification Code"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isList = !!config && !detailMatch && !["/dashboard", "/reports", "/leads", "/leads/create", "/reviews", "/faqs", "/website/banners", "/website/carousel", "/services", "/services/categories", "/technicians"].includes(path);
  const list = pickRows(data);
  const metricSource = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const metrics = path === "/dashboard" ? (metricSource.metrics as Record<string, unknown> | undefined) : undefined;

  const onFormSubmit = () => {
    if (!config?.fields) return;
    const body: Record<string, unknown> = {};
    try {
      for (const field of config.fields) {
        if (editing && path === "/pricing" && ["package_id", "zone_id"].includes(field.key)) continue;
        const value = form[field.key];
        if (value === undefined || value === "") continue;
        body[field.key] =
          field.type === "number"
            ? Number(value)
            : field.type === "json"
            ? typeof value === "string"
              ? JSON.parse(value)
              : value
            : field.type === "datetime-local"
            ? new Date(String(value)).toISOString()
            : value;
      }
      action(editing ? `${config.endpoint}${editing.id}/` : config.endpoint, editing ? "PATCH" : "POST", body, editing ? "Save these changes?" : undefined);
    } catch {
      setError("Please check JSON format or date fields.");
    }
  };

  // Convert row data into standard typed columns for AdminDataTable
  const hiddenKeys = new Set([
    "id", "user_id", "customer_id", "booking_id", "service_id", "category_id",
    "package_id", "zone_id", "technician_id", "payment_id", "settlement_id",
    "adjustment_id", "earning_id", "lead_id", "ticket_id", "assigned_to",
    "assigned_to_id", "actor_id", "images", "entries", "summary", "requirements", "working_hours",
  ]);
  const preferredOrder = [
    "work_order_number", "booking_number", "reference", "customer_code",
    "invoice_number", "lead_reference", "booking_reference",
    "name", "display_name", "title", "customer_name", "phone", "customer_phone",
  ];
  const dataColumns: AdminColumn<Row>[] = list.rows.length
    ? Object.keys(list.rows[0])
        .filter((k) => !hiddenKeys.has(k) && (k !== "work_order_number" || list.rows.some((r) => Boolean(r[k]))) && (k !== "invoice_number" || list.rows.some((r) => Boolean(r[k]))))
        .sort((a, b) => {
          const ia = preferredOrder.indexOf(a);
          const ib = preferredOrder.indexOf(b);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return 0;
        })
        .slice(0, 6)
        .map((k) => ({
          key: k,
          header: title(k),
          render: (row: Row) => {
            if (k === "status") return <AdminStatusBadge status={String(row[k])} />;
            return <span className="font-medium">{display(row[k], k)}</span>;
          },
        }))
    : [];

  // Add actions column
  if (dataColumns.length > 0) {
    dataColumns.push({
      key: "actions",
      header: "Actions",
      render: (row: Row) => (
        <div className="flex items-center gap-2">
          {["/bookings", "/work-orders"].includes(path) ? (
            <button
              onClick={() => setSelectedBooking(row)}
              className="rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 hover:bg-teal-100 transition shadow-xs"
            >
              Operations
            </button>
          ) : config?.detail && row.id ? (
            <a
              href={`${listPath}/${row.id}`}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-teal-800 hover:bg-slate-50 transition"
            >
              View
            </a>
          ) : null}
          {config?.fields && row.id && !["/commissions", "/staff"].includes(path) && (
            <button
              onClick={() => {
                setEditing(row);
                setForm(row);
                setShowForm(true);
              }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Edit
            </button>
          )}
          {path === "/notifications" && row.id && (
            <>
              <button
                onClick={() => void action(`/admin/notifications/${row.id}/retry/`, "POST", undefined, "Retry sending this notification?")}
                className="rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 hover:bg-teal-100 transition"
              >
                Retry
              </button>
              <button
                onClick={() => void action(`/admin/notifications/${row.id}/cancel/`, "POST", undefined, "Cancel this notification?")}
                className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100 transition"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      ),
    });
  }

  return (
    <div className="flex min-h-screen min-w-0 bg-slate-100 font-sans text-slate-900">
      {/* PurpleSquad Admin Sidebar */}
      <AdminSidebar
        pathname={path}
        userPhone={me.phone_e164}
        userRoles={me.roles}
        pendingKycCount={pendingKycCount}
        onSignOut={handleSignOut}
      />

      {/* Main Content Area */}
      <div className="min-w-0 max-w-full flex-1 lg:ml-72 flex flex-col">
        {/* ps_coreF1 Topbar */}
        <AdminTopbar
          pathname={path}
          userPhone={me.phone_e164}
          userRoles={me.roles}
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          onSignOut={handleSignOut}
        />

        {/* Workspace Container */}
        <main className="min-w-0 max-w-full flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/* Header (hidden when inside full-bleed PurpleSquad workspaces that render their own headers) */}
          {detailMatch?.[1] !== "technicians" && path !== "/leads/create" && !/^\/leads\/[^/]+$/.test(path) && !isServicesSection && (
            <AdminPageHeader
              title={config?.title ?? (path === "/dashboard" ? "Dashboard" : title(path.replace(/^\//, "").replace(/\//g, " · ")))}
              description="Real-time operational metrics, assignments, and records from NammaPros API"
              action={
                <div className="flex items-center gap-2">
                  {config?.fields && can("MANAGE_SERVICES") && (
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-800 transition"
                      onClick={() => {
                        setEditing(null);
                        setForm({});
                        setShowForm(true);
                      }}
                    >
                      <Plus className="h-4 w-4" /> Add {config.title.toLowerCase()}
                    </button>
                  )}
                  {path === "/leads" && (
                    <a
                      href="/leads/create"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-800 transition"
                    >
                      <Plus className="h-4 w-4" /> Create Lead
                    </a>
                  )}
                  {path === "/dashboard" && (
                    <a
                      href="/bookings"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-violet-800 transition"
                    >
                      Open bookings
                    </a>
                  )}
                </div>
              }
            />
          )}

          {error && <AdminErrorState message={error} onRetry={() => load()} />}
          {notice && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800 shadow-sm">
              {notice}
            </div>
          )}

          {/* DASHBOARD: PurpleSquad Operational Metric Cards & Needs Attention */}
          {path === "/dashboard" && metrics && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <AdminMetricCard icon={ClipboardList} label="Total Leads" value={String(metrics.leads_total ?? 0)} href="/leads" />
                <AdminMetricCard icon={CalendarCheck} label="Total Bookings" value={String(metrics.total_bookings ?? 0)} href="/bookings" />
                <AdminMetricCard icon={CheckCircle2} label="Completed Jobs" value={String(metrics.completed_bookings ?? 0)} href="/bookings" />
                <AdminMetricCard icon={Wrench} label="Active Technicians" value={String(metrics.active_technicians ?? 0)} href="/technicians" />
                <AdminMetricCard icon={CreditCard} label="Today's Revenue" value={display(metrics.todays_revenue_paise, "todays_revenue_paise")} href="/finance/payments" />
                <AdminMetricCard icon={CreditCard} label="Pending Payments" value={String(metrics.pending_payments_count ?? 0)} href="/finance/payments" />
                <AdminMetricCard icon={Wrench} label="Unassigned Jobs" value={String(metrics.unassigned_jobs ?? 0)} href="/assignments" />
                <AdminMetricCard icon={CheckCircle2} label="Confirmed Bookings" value={String(metrics.confirmed_bookings ?? 0)} href="/work-orders" />
                <AdminMetricCard icon={Clock} label="Upcoming Services" value={String(metrics.upcoming_services ?? 0)} href="/bookings" />
                <AdminMetricCard icon={Users} label="Follow-ups Due" value={String(metrics.follow_ups_due ?? 0)} href="/leads" />
                <AdminMetricCard icon={Users} label="Active Customers" value={String(metrics.active_customers ?? 0)} href="/customers" />
                <AdminMetricCard icon={AlertCircle} label="Pending Partner KYC" value={String(metrics.pending_technician_verification ?? 0)} href="/technicians/verification" />
              </div>

              {/* PurpleSquad "Needs attention" Amber Alert Panel */}
              <section aria-labelledby="admin-needs-attention" className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 id="admin-needs-attention" className="text-base font-bold text-slate-950">Needs attention</h2>
                    <p className="mt-1 text-sm text-slate-600">A short list of items that may need an admin follow-up.</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">Live snapshot</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Unassigned bookings", value: Number(metrics.unassigned_jobs ?? 0), href: "/assignments", hint: "Review vendor assignment" },
                    { label: "Payments pending", value: Number(metrics.pending_payments_count ?? 0), href: "/finance/payments", hint: "Check booking payments" },
                    { label: "Lead follow-ups due", value: Number(metrics.follow_ups_due ?? 0), href: "/leads", hint: "Contact customers" },
                    { label: "Partner KYC pending", value: Number(metrics.pending_technician_verification ?? 0), href: "/technicians/verification", hint: "Review KYC applications" },
                  ].map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      className={`flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-white p-3 transition hover:border-amber-400 hover:shadow-sm ${
                        item.value > 0 ? "border-amber-200" : "border-slate-200"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">{item.label}</span>
                        <span className="mt-1 block text-xs text-slate-500">{item.value > 0 ? item.hint : "Nothing pending"}</span>
                      </span>
                      <span
                        className={`grid h-9 min-w-9 shrink-0 place-items-center rounded-full px-2 text-sm font-bold ${
                          item.value > 0 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {item.value}
                      </span>
                    </a>
                  ))}
                </div>
              </section>

              {/* Recent Bookings and Payments Grid */}
              <div className="grid gap-6 lg:grid-cols-2">
                <RecentBookingsPanel />
                <PendingPaymentsPanel />
              </div>
            </div>
          )}

          {/* Partner KYC screen */}
          {path === "/technicians/verification" && <Verification />}

          {/* Technicians Directory & 6-Tab Workspace */}
          {path === "/technicians" && <AdminTechniciansDirectory canEdit={can("MANAGE_TECHNICIANS")} />}
          {detailMatch?.[1] === "technicians" && (
            <AdminTechnicianWorkspace technicianId={detailMatch[2]} canEdit={can("MANAGE_TECHNICIANS")} />
          )}

          {/* Create Lead Screen */}
          {path === "/leads/create" && (
            <AdminLeadCreateScreen
              onCreated={(leadId) => router.push(`/leads/${leadId}`)}
              onBack={() => router.back()}
            />
          )}

          {/* Leads Screens */}
          {(path === "/leads" || /^\/leads\/[^/]+$/.test(path)) && path !== "/leads/create" && (
            <AdminLeads
              id={path === "/leads" ? undefined : path.split("/")[2]}
              canEdit={me.roles.some((r) => ["SUPER_ADMIN", "OPERATIONS_MANAGER", "DISPATCH_OPERATOR", "SUPPORT_AGENT"].includes(r))}
            />
          )}

          {/* Reviews Moderation */}
          {path === "/reviews" && <ReviewsManager />}

          {/* FAQs Publishing */}
          {path === "/faqs" && <FaqManager />}

          {/* Homepage Banners */}
          {path === "/website/banners" && <HomepageBannersManager />}

          {/* Promotional Carousel */}
          {path === "/website/carousel" && <CarouselManager data={data} onSave={action} />}

          {/* Reports */}
          {path === "/reports" && <ReportTabs period={period} start={start} end={end} />}
          {isServicesSection && (
            <AdminServicesScreen
              canEdit={can("MANAGE_SERVICES")}
              routeCategorySlug={routeCategorySlug}
              routeServiceSlug={routeServiceSlug}
              onNavigate={(nextPath) => router.push(nextPath)}
            />
          )}

          {/* Staff & Roles */}
          {path === "/staff" && (
            <div className="space-y-6">
              <StaffTools onSubmit={action} />
              <LeadZoneGrants />
              <Roles data={data} onChange={action} canEdit={can("MANAGE_STAFF")} />
            </div>
          )}

          {/* Settings */}
          {path === "/settings" && <Settings data={data} onChange={action} canEdit={can("CHANGE_SETTINGS")} />}

          {/* Notifications */}
          {path === "/notifications" && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-2">Notification Delivery Directory</h2>
              <p className="text-xs text-slate-500 mb-4">Delivery logs and event triggers across MSG91 SMS, WhatsApp, and Firebase.</p>
              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Approved Event Templates</p>
                <p className="mt-1 text-sm text-slate-900 font-mono">
                  {((data as { templates?: string[] } | null)?.templates ?? []).join(" · ") || "No templates configured"}
                </p>
              </div>
            </section>
          )}

          {/* Standard Data Table with ps_coreF1 style */}
          {isList && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-teal-700"
                  >
                    <option value="">All Statuses</option>
                    {["REQUESTED", "UNDER_REVIEW", "APPROVED", "VERIFIED", "CAPTURED", "SUCCEEDED", "FAILED", "PAID", "CANCELLED", "CONFIRMED"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {list.count} Total Records
                </span>
              </div>

              {busy ? (
                <div className="grid min-h-[30vh] place-items-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
                </div>
              ) : (
                <AdminDataTable
                  columns={dataColumns}
                  rows={list.rows}
                  getRowKey={(r) => String(r.id ?? Math.random())}
                  onRowClick={["/bookings", "/work-orders"].includes(path) ? (r) => setSelectedBooking(r) : undefined}
                  emptyIcon={ClipboardList}
                  emptyTitle="No records found"
                  emptyMessage="There are no records matching your current filter criteria."
                />
              )}

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

          {/* Record Detail View */}
          {detailMatch && detailMatch[1] !== "technicians" && data && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-4">
                <a href={listPath} className="text-xs font-bold text-teal-800 hover:underline">
                  ← Back to {title(listPath.slice(1))}
                </a>
                {detailMatch[1] === "technicians" && can("MANAGE_TECHNICIANS") && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => action(`/admin/technicians/${detailMatch[2]}/verify/`, "POST", { note: "Verified by admin" }, "Verify technician?")}
                      className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800"
                    >
                      Verify
                    </button>
                    <button
                      onClick={() => action(`/admin/technicians/${detailMatch[2]}/suspend/`, "POST", { note: "Suspended by admin" }, "Suspend technician?")}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    >
                      Suspend
                    </button>
                  </div>
                )}
              </div>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(data as Record<string, unknown>)
                  .filter(([k]) => !hiddenKeys.has(k))
                  .map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3.5">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title(k)}</dt>
                    <dd className="mt-1 text-sm font-semibold text-slate-900 break-words">{display(v, k)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {detailMatch?.[1] === "bookings" && data && me.roles.some((r) => ["SUPER_ADMIN", "OPERATIONS_MANAGER", "SUPPORT_AGENT"].includes(r)) && (
            <div className="mt-6">
              <BookingControls id={detailMatch[2]} version={Number((data as Row).version)} status={String((data as Row).status)} onDone={() => setRefresh((n) => n + 1)} />
            </div>
          )}

          {/* ps_coreF1 Inspired Slide-over Admin Booking Drawer */}
          {selectedBooking && (
            <AdminBookingDrawer
              booking={selectedBooking}
              onClose={() => setSelectedBooking(null)}
              onChanged={() => {
                setSelectedBooking(null);
                load();
              }}
            />
          )}

          {/* Add / Edit Form Modal with Clean Styling */}
          {showForm && config?.fields && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
                  <h2 className="text-lg font-bold text-slate-900">{editing ? "Edit" : "Add"} {config.title}</h2>
                  <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold">×</button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {config.fields.map((field) => (
                    <div key={field.key} className={field.type === "json" ? "sm:col-span-2" : ""}>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                        {field.label ?? title(field.key)}
                      </label>
                      {field.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(form[field.key])}
                          onChange={(e) => setForm({ ...form, [field.key]: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      ) : field.type === "json" ? (
                        <textarea
                          rows={3}
                          value={typeof form[field.key] === "object" ? JSON.stringify(form[field.key]) : String(form[field.key] ?? "")}
                          onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono outline-none focus:border-teal-700"
                          placeholder="Valid JSON"
                        />
                      ) : (
                        <input
                          type={field.type ?? "text"}
                          required={field.required}
                          disabled={Boolean(editing && path === "/pricing" && ["package_id", "zone_id"].includes(field.key))}
                          value={String(form[field.key] ?? "")}
                          onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-teal-700 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-4">
                  <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button onClick={onFormSubmit} disabled={busy} className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50">
                    Save Record
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function RecentBookingsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api<{ results?: Row[] }>("/admin/bookings/?page=1").then((d) => setRows((d.results ?? []).slice(0, 5))).catch(() => {});
  }, []);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Recent Bookings</h2>
        <a href="/bookings" className="text-xs font-bold text-teal-800 hover:underline">View All →</a>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400 font-medium">No bookings recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500 uppercase tracking-wider font-bold">
                <th className="pb-2">Booking Ref</th>
                <th className="pb-2">Service</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={String(r.id)} className="hover:bg-slate-50/70">
                  <td className="py-2.5 font-bold text-slate-900">{String(r.work_order_number || r.reference || r.booking_number || "")}</td>
                  <td className="py-2.5 text-slate-700">{String(r.service_name ?? r.service ?? "Service")}</td>
                  <td className="py-2.5"><AdminStatusBadge status={String(r.status)} /></td>
                  <td className="py-2.5 text-right">
                    <a href={`/bookings/${r.id}`} className="rounded border border-slate-200 bg-white px-2 py-0.5 font-bold text-teal-800 hover:bg-slate-50">
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PendingPaymentsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api<{ results?: Row[] }>("/admin/finance/payments/?page=1").then((d) => setRows((d.results ?? []).slice(0, 5))).catch(() => {});
  }, []);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Recent Payments</h2>
        <a href="/finance/payments" className="text-xs font-bold text-teal-800 hover:underline">View All →</a>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400 font-medium">No payment records yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-500 uppercase tracking-wider font-bold">
                <th className="pb-2">Payment ID</th>
                <th className="pb-2">Amount</th>
                <th className="pb-2">Method</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={String(r.id)} className="hover:bg-slate-50/70">
                  <td className="py-2.5 font-mono text-slate-800 font-semibold">{String(r.booking_reference || r.invoice_number || r.provider_payment_id || "Payment")}</td>
                  <td className="py-2.5 font-bold text-slate-900">{display(r.amount_paise, "amount_paise")}</td>
                  <td className="py-2.5 text-slate-600">{String(r.payment_method ?? "UPI")}</td>
                  <td className="py-2.5 text-right"><AdminStatusBadge status={String(r.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


function ReviewsManager() {
  const [items, setItems] = useState<Array<{ id: string; booking_reference: string; service: string; customer_phone: string; rating: number; comment: string; is_visible: boolean; created_at: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadReviews = useCallback(async () => {
    try {
      const res = await api<{ results?: typeof items }>("/admin/reviews/");
      setItems(res.results ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load reviews.");
    }
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const togglePublic = async (id: string, current: boolean) => {
    setBusy(true);
    setErr("");
    try {
      await api(`/admin/reviews/${id}/`, "PATCH", { is_visible: !current });
      await loadReviews();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Customer Reviews Moderation</h2>
      <p className="text-xs text-slate-500 mb-4">Moderate customer reviews from completed bookings and control storefront visibility.</p>
      {err && <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100 text-left uppercase text-slate-500 font-bold">
              <th className="p-3">Booking Ref</th>
              <th className="p-3">Service</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Rating</th>
              <th className="p-3">Review</th>
              <th className="p-3">Public Status</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">No customer reviews submitted yet.</td>
              </tr>
            ) : items.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="p-3 font-bold text-slate-900">{r.booking_reference}</td>
                <td className="p-3 text-slate-700">{r.service}</td>
                <td className="p-3 text-slate-600">{r.customer_phone}</td>
                <td className="p-3 text-amber-500 font-bold">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</td>
                <td className="p-3 max-w-sm text-slate-600">{r.comment || "—"}</td>
                <td className="p-3">
                  {r.is_visible ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Published</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">Hidden</span>
                  )}
                </td>
                <td className="p-3">
                  <button
                    disabled={busy}
                    onClick={() => void togglePublic(r.id, r.is_visible)}
                    className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {r.is_visible ? "Hide" : "Publish"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FaqManager() {
  const [items, setItems] = useState<Array<{ id: string; question: string; answer: string; sort_order: number; is_active: boolean }>>([]);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadFaqs = useCallback(async () => {
    try {
      const res = await api<{ results?: typeof items }>("/admin/faqs/");
      setItems(res.results ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load FAQs.");
    }
  }, []);

  useEffect(() => {
    void loadFaqs();
  }, [loadFaqs]);

  const saveFaq = async () => {
    if (!q.trim() || !a.trim()) return;
    setBusy(true);
    setErr("");
    try {
      if (editingId) {
        await api(`/admin/faqs/${editingId}/`, "PATCH", { question: q.trim(), answer: a.trim() });
      } else {
        await api("/admin/faqs/", "POST", { question: q.trim(), answer: a.trim(), is_active: true });
      }
      setQ("");
      setA("");
      setEditingId(null);
      await loadFaqs();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save FAQ.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (id: string, curr: boolean) => {
    await api(`/admin/faqs/${id}/`, "PATCH", { is_active: !curr });
    await loadFaqs();
  };

  const deleteFaq = async (id: string) => {
    if (!window.confirm("Delete this FAQ?")) return;
    await api(`/admin/faqs/${id}/`, "DELETE");
    await loadFaqs();
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-900">Catalogue FAQs</h2>
        <p className="text-xs text-slate-500">Create, edit, publish, and remove FAQs displayed across customer service pages.</p>
      </div>
      {err && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800">{err}</div>}
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400">No FAQs published yet.</p>
        ) : items.map((f) => (
          <div key={f.id} className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <strong className="block text-xs font-bold uppercase tracking-wide text-teal-800 mb-1">Q: {f.question}</strong>
              <p className="text-sm text-slate-700 m-0">{f.answer}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => void toggleActive(f.id, f.is_active)}
                className={`rounded px-2.5 py-1 text-[11px] font-bold ${f.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}
              >
                {f.is_active ? "Active" : "Hidden"}
              </button>
              <button
                onClick={() => {
                  setEditingId(f.id);
                  setQ(f.question);
                  setA(f.answer);
                }}
                className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                onClick={() => void deleteFaq(f.id)}
                className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">{editingId ? "Edit FAQ Item" : "Add FAQ Item"}</h3>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
          placeholder="Question..."
        />
        <textarea
          rows={2}
          value={a}
          onChange={(e) => setA(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
          placeholder="Answer..."
        />
        <div className="flex gap-2">
          <button
            onClick={() => void saveFaq()}
            disabled={busy || !q.trim() || !a.trim()}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {editingId ? "Update FAQ" : "Publish FAQ"}
          </button>
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setQ("");
                setA("");
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function HomepageBannersManager() {
  const [banners, setBanners] = useState<Array<{ id: string; title: string; subtitle: string; placement: string; desktop_image_url: string; target_url: string; is_active: boolean }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleVal, setTitleVal] = useState("");
  const [subtitleVal, setSubtitleVal] = useState("");
  const [placement, setPlacement] = useState("HERO");
  const [imgUrl, setImgUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadBanners = useCallback(async () => {
    try {
      const res = await api<{ results?: typeof banners }>("/admin/homepage-banners/");
      setBanners(res.results ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load banners.");
    }
  }, []);

  useEffect(() => {
    void loadBanners();
  }, [loadBanners]);

  const save = async () => {
    if (!titleVal.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const payload = {
        title: titleVal.trim(),
        subtitle: subtitleVal.trim(),
        placement,
        desktop_image_url: imgUrl.trim(),
        target_url: targetUrl.trim(),
        is_active: true,
      };
      if (editingId) {
        await api(`/admin/homepage-banners/${editingId}/`, "PATCH", payload);
      } else {
        await api("/admin/homepage-banners/", "POST", payload);
      }
      setEditingId(null);
      setTitleVal("");
      setSubtitleVal("");
      setImgUrl("");
      setTargetUrl("");
      await loadBanners();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save banner.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Homepage Banners</h2>
        <p className="text-xs text-slate-500 mb-4">Manage hero, promo, and category banners displayed on the website.</p>
        {err && <div className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{err}</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banners.map((b) => (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col justify-between gap-3">
              <div>
                <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-900">{b.placement}</span>
                <strong className="mt-2 block text-sm font-bold text-slate-900">{b.title}</strong>
                {b.subtitle ? <p className="mt-1 text-xs text-slate-600">{b.subtitle}</p> : null}
                {b.desktop_image_url ? <p className="mt-1 truncate text-[11px] font-mono text-slate-500">{b.desktop_image_url}</p> : null}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={async () => {
                    await api(`/admin/homepage-banners/${b.id}/`, "PATCH", { is_active: !b.is_active });
                    await loadBanners();
                  }}
                  className={`rounded px-2 py-0.5 text-[11px] font-bold ${b.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}
                >
                  {b.is_active ? "Active" : "Hidden"}
                </button>
                <button
                  onClick={() => {
                    setEditingId(b.id);
                    setTitleVal(b.title);
                    setSubtitleVal(b.subtitle);
                    setPlacement(b.placement);
                    setImgUrl(b.desktop_image_url);
                    setTargetUrl(b.target_url);
                  }}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700"
                >
                  Edit
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm("Delete this banner?")) return;
                    await api(`/admin/homepage-banners/${b.id}/`, "DELETE");
                    await loadBanners();
                  }}
                  className="ml-auto rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm max-w-xl space-y-4">
        <h3 className="text-sm font-bold text-slate-900">{editingId ? "Edit Banner" : "Add Homepage Banner"}</h3>
        <div className="space-y-3">
          <input value={titleVal} onChange={(e) => setTitleVal(e.target.value)} placeholder="Banner Title *" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
          <input value={subtitleVal} onChange={(e) => setSubtitleVal(e.target.value)} placeholder="Subtitle" className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
          <select value={placement} onChange={(e) => setPlacement(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm">
            <option value="HERO">HERO</option>
            <option value="MID_PROMO">MID_PROMO</option>
            <option value="CATEGORY_STRIP">CATEGORY_STRIP</option>
          </select>
          <input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="Desktop Image URL" className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono" />
          <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="Target link (e.g. /services/ac-service)" className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono" />
          <div className="flex gap-2">
            <button disabled={busy || !titleVal.trim()} onClick={() => void save()} className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50">
              {editingId ? "Update Banner" : "Create Banner"}
            </button>
            {editingId && (
              <button onClick={() => { setEditingId(null); setTitleVal(""); setSubtitleVal(""); setImgUrl(""); setTargetUrl(""); }} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700">
                Cancel
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function CarouselManager({ data, onSave }: { data: unknown; onSave: (url: string, method: string, body?: unknown, confirmText?: string) => void }) {
  const d = data as { settings?: Record<string, unknown> } | null;
  const carousel = (d?.settings?.carousel_items as { items?: Array<{ title: string; discount: string; banner: string; is_active: boolean }> }) ?? { items: [] };
  const items = carousel.items || [];
  const [titleVal, setTitleVal] = useState("");
  const [discountVal, setDiscountVal] = useState("");
  const [bannerVal, setBannerVal] = useState("");

  const addSlide = () => {
    if (!titleVal.trim()) return;
    const updated = [...items, { title: titleVal.trim(), discount: discountVal.trim(), banner: bannerVal.trim(), is_active: true }];
    onSave("/admin/settings/", "PATCH", { key: "carousel_items", value: { items: updated } }, "Add carousel slide?");
    setTitleVal("");
    setDiscountVal("");
    setBannerVal("");
  };

  const toggleSlide = (idx: number) => {
    const updated = items.map((it, i) => (i === idx ? { ...it, is_active: !it.is_active } : it));
    onSave("/admin/settings/", "PATCH", { key: "carousel_items", value: { items: updated } });
  };

  const deleteSlide = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx);
    onSave("/admin/settings/", "PATCH", { key: "carousel_items", value: { items: updated } }, "Delete carousel slide?");
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-900">Promotional Carousel</h2>
        <p className="text-xs text-slate-500">Add, toggle, or remove promotional slide banners and discount highlights.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, idx) => (
          <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col justify-between gap-3">
            <div>
              <strong className="block text-sm font-bold text-teal-900">{it.title}</strong>
              <p className="text-xs font-bold text-emerald-700 my-1">{it.discount}</p>
              <p className="text-[11px] font-mono text-slate-500 truncate">{it.banner}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleSlide(idx)}
                className={`rounded px-2 py-0.5 text-[10px] font-bold ${it.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
              >
                {it.is_active ? "Active" : "Paused"}
              </button>
              <button
                onClick={() => deleteSlide(idx)}
                className="ml-auto rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 max-w-xl space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Add Carousel Slide</h3>
        <input value={titleVal} onChange={(e) => setTitleVal(e.target.value)} placeholder="Slide Title (e.g. Summer AC Tune-up)" className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" />
        <input value={discountVal} onChange={(e) => setDiscountVal(e.target.value)} placeholder="Discount / Highlight (e.g. Flat 20% Off)" className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" />
        <input value={bannerVal} onChange={(e) => setBannerVal(e.target.value)} placeholder="Banner Image URL" className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-mono" />
        <button disabled={!titleVal.trim()} onClick={addSlide} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50">
          Add Slide
        </button>
      </div>
    </section>
  );
}

function ReportTabs({ period, start, end }: { period: string; start: string; end: string }) {
  const [kind, setKind] = useState("bookings");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams();
    if (period === "custom") {
      if (!start || !end) return;
      q.set("start", start);
      q.set("end", end);
    } else q.set("period", period);
    api<Record<string, unknown>>(`/admin/reports/${kind}/?${q}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [kind, period, start, end]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex gap-2 border-b border-slate-200 pb-4 mb-4">
        {["bookings", "revenue", "technicians", "finance"].map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              kind === k ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {title(k)}
          </button>
        ))}
      </div>
      {error && <AdminErrorState message={error} />}
      {data && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title(k)}</dt>
              <dd className="mt-1 text-sm font-bold text-slate-900">{display(v, k)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function Roles({ data, onChange, canEdit }: { data: unknown; onChange: (url: string, method: string, body?: unknown, confirmText?: string) => void; canEdit: boolean }) {
  const roles = (data as { roles?: { name: string; permissions: string[] }[] } | null)?.roles ?? [];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900 mb-2">Staff Roles & Permissions</h2>
      <div className="divide-y divide-slate-100">
        {roles.map((r) => (
          <div key={r.name} className="py-3 flex items-center justify-between gap-4">
            <div>
              <strong className="text-xs font-bold text-slate-900 uppercase tracking-wide">{r.name}</strong>
              <p className="text-xs text-slate-500 mt-0.5">{r.permissions.join(" · ") || "Default access"}</p>
            </div>
            {canEdit && r.name !== "SUPER_ADMIN" && (
              <button
                onClick={() => {
                  const permission_code = window.prompt("Enter capability code to grant:");
                  if (permission_code) onChange(`/admin/roles/${r.name}/`, "PATCH", { permission_code, enabled: true }, "Grant this permission?");
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Grant Capability
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Settings({ data, onChange, canEdit }: { data: unknown; onChange: (url: string, method: string, body?: unknown, confirmText?: string) => void; canEdit: boolean }) {
  const d = data as { settings?: Record<string, unknown>; providers?: Record<string, boolean> } | null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Platform Settings</h2>
      <p className="text-xs text-slate-500 mb-4">Safe platform configuration; secret keys and credentials are not displayed.</p>

      {/* Provider Status flags like ps_coreF1 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {Object.entries(d?.providers ?? {}).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{title(k.replace("_configured", ""))}</span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${v ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
              {v ? "Configured" : "Unavailable"}
            </span>
          </div>
        ))}
      </div>

      <div className="divide-y divide-slate-100">
        {Object.entries(d?.settings ?? {}).map(([k, v]) => (
          <div key={k} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <strong className="text-xs font-bold uppercase tracking-wide text-slate-700">{title(k)}</strong>
            <span className="text-xs font-mono text-slate-600 truncate max-w-md">{display(v)}</span>
          </div>
        ))}
      </div>

      {canEdit && (
        <button
          onClick={() => {
            const key = window.prompt("Setting key");
            if (!key) return;
            const raw = window.prompt("JSON object value");
            if (!raw) return;
            try {
              onChange("/admin/settings/", "PATCH", { key, value: JSON.parse(raw) }, "Save platform setting?");
            } catch {
              window.alert("Please provide valid JSON.");
            }
          }}
          className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 transition"
        >
          Edit Setting
        </button>
      )}
    </section>
  );
}

function StaffTools({ onSubmit }: { onSubmit: (url: string, method: string, body?: unknown, confirmText?: string) => void }) {
  const [id, setId] = useState("");
  const [role, setRole] = useState("");
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm max-w-xl">
      <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-1">Staff Access Management</h2>
      <p className="text-xs text-slate-500 mb-4">Modify staff roles or toggle account activity.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Staff User ID</label>
          <input type="number" value={id} onChange={(e) => setId(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Role</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg border border-slate-300 p-2 text-sm" placeholder="e.g. OPERATIONS_MANAGER" />
        </div>
        <div className="sm:col-span-2 flex flex-wrap gap-2 pt-2">
          <button disabled={!id || !role} onClick={() => onSubmit(`/admin/staff/${id}/`, "PATCH", { remove_role: role }, "Remove this role?")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Remove Role
          </button>
          <button disabled={!id} onClick={() => onSubmit(`/admin/staff/${id}/`, "PATCH", { is_active: false }, "Deactivate account?")} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">
            Deactivate Account
          </button>
          <button disabled={!id} onClick={() => onSubmit(`/admin/staff/${id}/`, "PATCH", { is_active: true }, "Reactivate account?")} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
            Reactivate Account
          </button>
        </div>
      </div>
    </section>
  );
}
