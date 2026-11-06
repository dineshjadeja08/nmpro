"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, base, clearCsrf, Row, uploadImage } from "../lib/api";
import Verification from "./verification";
import AdminLeads from "./leads";
import LeadZoneGrants from "./lead-zone-grants";
import BookingControls from "./booking-controls";

type Me = { id: number; phone_e164: string; roles: string[]; capabilities: string[] };
type Field = { key: string; label?: string; type?: "number" | "date" | "datetime-local" | "checkbox" | "json"; required?: boolean };
type View = { title: string; endpoint: string; fields?: Field[]; permission?: string; detail?: boolean };
const nav = [
  ["Dashboard", "/dashboard"], ["Leads", "/leads"], ["Bookings", "/bookings"], ["Customers", "/customers"],
  ["Technicians", "/technicians"], ["Verification", "/technicians/verification"],
  ["Services", "/services"], ["Categories", "/services/categories"], ["Packages", "/services/packages"],
  ["Pricing", "/pricing"], ["Service zones", "/zones"], ["Finance", "/finance"],
  ["Payments", "/finance/payments"], ["Refunds", "/finance/refunds"],
  ["Settlements", "/finance/settlements"], ["Payouts", "/finance/payouts"],
  ["Invoices", "/finance/invoices"], ["Ledger", "/finance/ledger"],
  ["Commissions", "/commissions"], ["Reports", "/reports"], ["Staff", "/staff"],
  ["Roles", "/roles"], ["Notifications", "/notifications"], ["Settings", "/settings"],
  ["Audit logs", "/audit-logs"],
] as const;
const views: Record<string, View> = {
  "/bookings": { title: "Bookings", endpoint: "/admin/bookings/", detail: true },
  "/customers": { title: "Customers", endpoint: "/admin/customers/", detail: true },
  "/technicians": { title: "Technicians", endpoint: "/admin/technicians/", detail: true },
  "/services": { title: "Services", endpoint: "/admin/services/", fields: [
    { key: "category_id", required: true }, { key: "slug", required: true }, { key: "name", required: true },
    { key: "summary" }, { key: "description" }, { key: "starting_price_paise", type: "number" },
    { key: "sort_order", type: "number" }, { key: "is_active", type: "checkbox" }] },
  "/services/categories": { title: "Categories", endpoint: "/admin/categories/", fields: [
    { key: "slug", required: true }, { key: "name", required: true }, { key: "description" },
    { key: "sort_order", type: "number" }, { key: "is_active", type: "checkbox" }] },
  "/services/packages": { title: "Packages", endpoint: "/admin/packages/", fields: [
    { key: "service_id", required: true }, { key: "name", required: true }, { key: "description" },
    { key: "requirements", type: "json" }, { key: "pricing_model", required: true },
    { key: "duration_minutes", type: "number", required: true }, { key: "inclusions", type: "json" },
    { key: "exclusions", type: "json" }, { key: "skill_code", required: true }, { key: "is_active", type: "checkbox" }] },
  "/pricing": { title: "Pricing", endpoint: "/admin/pricing/", permission: "MANAGE_PRICING", fields: [
    { key: "package_id", required: true }, { key: "zone_id", required: true }, { key: "base_paise", type: "number" },
    { key: "inspection_paise", type: "number" }, { key: "fee_paise", type: "number" },
    { key: "tax_paise", type: "number" }, { key: "payment_policy", required: true },
    { key: "cancellation_cutoff_minutes", type: "number" }, { key: "reschedule_cutoff_minutes", type: "number" },
    { key: "is_active", type: "checkbox" }] },
  "/zones": { title: "Service zones", endpoint: "/admin/zones/", fields: [
    { key: "city_id" }, { key: "city_name" }, { key: "name", required: true },
    { key: "postal_code", required: true }, { key: "state" },
    { key: "operational_capacity", type: "number" }, { key: "working_hours", type: "json" },
    { key: "is_active", type: "checkbox" }] },
  "/finance/payments": { title: "Captured payments", endpoint: "/admin/finance/payments/", permission: "VIEW_FINANCE" },
  "/finance/refunds": { title: "Refunds", endpoint: "/admin/finance/refunds/", permission: "VIEW_FINANCE" },
  "/finance/settlements": { title: "Technician settlements", endpoint: "/admin/settlements/", permission: "VIEW_FINANCE" },
  "/finance/payouts": { title: "Payouts", endpoint: "/admin/payouts/", permission: "VIEW_FINANCE" },
  "/finance/invoices": { title: "Invoices", endpoint: "/admin/finance/invoices/", permission: "VIEW_FINANCE" },
  "/finance/ledger": { title: "Ledger", endpoint: "/admin/finance/ledger/", permission: "VIEW_FINANCE" },
  "/commissions": { title: "Commission rules", endpoint: "/admin/commissions/", permission: "VIEW_FINANCE", fields: [
    { key: "name", required: true }, { key: "package_id" }, { key: "category_id" }, { key: "technician_id" },
    { key: "kind", required: true }, { key: "amount_paise", type: "number" },
    { key: "basis_points", type: "number" }, { key: "percentage_base" },
    { key: "effective_from", type: "datetime-local", required: true },
    { key: "effective_until", type: "datetime-local" }] },
  "/staff": { title: "Staff", endpoint: "/admin/staff/", permission: "MANAGE_STAFF", fields: [
    { key: "phone_e164", required: true }, { key: "role", required: true }] },
  "/notifications": { title: "Notifications", endpoint: "/admin/notifications/" },
  "/audit-logs": { title: "Audit logs", endpoint: "/admin/audit-logs/", permission: "VIEW_AUDIT" },
};
const financePaths = new Set(["/finance", "/finance/payments", "/finance/refunds", "/finance/settlements", "/finance/payouts", "/finance/invoices", "/finance/ledger", "/commissions"]);
const title = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const display = (value: unknown, key = "") => {
  if (value === null || value === undefined || value === "") return "—";
  if (key.endsWith("_paise") && typeof value === "number") return `₹${(value / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
const pickRows = (data: unknown): { rows: Row[]; count: number } => {
  if (data && typeof data === "object") {
    const object = data as Record<string, unknown>;
    if (Array.isArray(object.results)) return { rows: object.results as Row[], count: Number(object.count ?? object.results.length) };
    for (const key of ["invoices", "refunds", "payments", "accounts", "roles", "coverage"]) {
      if (Array.isArray(object[key])) return { rows: object[key] as Row[], count: (object[key] as unknown[]).length };
    }
  }
  return { rows: [], count: 0 };
};

export default function Portal() {
  const path = usePathname(); const router = useRouter();
  const [me, setMe] = useState<Me | null>(null), [loadingAuth, setLoadingAuth] = useState(true);
  const [phone, setPhone] = useState("+91"), [challenge, setChallenge] = useState(""), [code, setCode] = useState(""), [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [collapsed, setCollapsed] = useState(false), [search, setSearch] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
  const [period, setPeriod] = useState("30d"), [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [data, setData] = useState<unknown>(null), [form, setForm] = useState<Record<string, unknown>>({}), [editing, setEditing] = useState<Row | null>(null);
  const [showForm, setShowForm] = useState(false), [refresh, setRefresh] = useState(0);
  const detailMatch = path.match(/^\/(bookings|customers|technicians)\/([^/]+)$/);
  const listPath = detailMatch ? `/${detailMatch[1]}` : path;
  const config = views[listPath];
  const query = useMemo(() => { const q = new URLSearchParams({ page: String(page) }); if (search) q.set("q", search); if (status) q.set("status", status); if (period !== "custom") q.set("period", period); if (period === "custom" && start && end) { q.set("start", start); q.set("end", end); } return q.toString(); }, [page, search, status, period, start, end]);
  useEffect(() => { api<Me>("/admin/me/").then(setMe).catch(() => setMe(null)).finally(() => setLoadingAuth(false)); }, []);
  const endpoint = detailMatch && config ? `${config.endpoint}${detailMatch[2]}/` : config?.endpoint;
  const resource = path === "/dashboard" ? "/admin/dashboard/" : path === "/finance" ? "/admin/finance/overview/" : path === "/roles" ? "/admin/roles/" : path === "/settings" ? "/admin/settings/" : path === "/reports" ? "/admin/reports/bookings/" : endpoint;
  const load = useCallback(async () => { if (!me || !resource || path === "/technicians/verification") return; setBusy(true); setError(""); try { setData(await api(`${resource}${resource.includes("?") ? "&" : "?"}${query}`)); } catch (e) { setError(e instanceof Error ? e.message : "Could not load data."); } finally { setBusy(false); } }, [me, resource, query, path]);
  useEffect(() => { load(); }, [load, refresh]);
  useEffect(() => { setPage(1); setSearch(""); setStatus(""); setData(null); setShowForm(false); }, [path]);
  const action = async (url: string, method: string, body?: unknown, confirmText?: string, idempotency = false) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError(""); setNotice("");
    try { await api(url, method, body, idempotency ? crypto.randomUUID() : undefined); setNotice("Saved. Refreshing current data."); setRefresh(n => n + 1); setShowForm(false); setEditing(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(false); }
  };
  const signIn = async () => { setBusy(true); setError(""); try {
    if (!challenge) { const r = await api<{ challenge_id: string; development_code?: string }>("/auth/otp/request/", "POST", { phone_e164: phone }); setChallenge(r.challenge_id); setDevCode(r.development_code ?? ""); }
    else { await api("/auth/otp/verify/", "POST", { phone_e164: phone, challenge_id: challenge, code }); clearCsrf(); setMe(await api<Me>("/admin/me/")); router.push("/dashboard"); }
  } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed."); } finally { setBusy(false); } };
  const can = (permission: string) => me?.capabilities.includes(permission) ?? false;
  if (loadingAuth) return <main className="center"><div className="spinner" />Checking access…</main>;
  if (!me) return <main className="login"><section className="login-card"><div className="brand">nammapros<span>.</span></div><p className="eyebrow">ADMIN CONSOLE</p><h1>Staff sign in</h1><p>Use your approved staff phone number.</p><label>Phone number<input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" /></label>{challenge && <label>One time code<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" /></label>}{devCode && <p className="hint">Development code: {devCode}</p>}<button className="primary" onClick={signIn} disabled={busy}>{challenge ? "Verify and continue" : "Send code"}</button>{error && <p className="error">{error}</p>}</section></main>;
  if (path === "/technicians/verification") return <Verification />;
  const unauthorized = (config?.permission && !can(config.permission)) || (financePaths.has(path) && !can("VIEW_FINANCE")) || (["/staff", "/roles"].includes(path) && !can("MANAGE_STAFF"));
  if (unauthorized) return <main className="center">You do not have access to this area.</main>;
  const list = pickRows(data); const isList = !!config && !detailMatch;
  const metricSource = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const metrics = path === "/dashboard" ? metricSource.metrics as Record<string, unknown> | undefined : path === "/finance" ? metricSource : undefined;
  const onFormSubmit = () => { if (!config?.fields) return; const body: Record<string, unknown> = {};
    try { for (const field of config.fields) { const value = form[field.key]; if (value === undefined || value === "") continue; body[field.key] = field.type === "number" ? Number(value) : field.type === "json" ? JSON.parse(String(value)) : field.type === "datetime-local" ? new Date(String(value)).toISOString() : value; }
      action(editing ? `${config.endpoint}${editing.id}/` : config.endpoint, editing ? "PATCH" : "POST", body, editing ? "Save these changes?" : undefined);
    } catch { setError("Check the JSON and date fields."); }
  };
  const columns = list.rows.length ? Object.keys(list.rows[0]).filter(k => !["images", "entries", "summary", "requirements", "working_hours"].includes(k)).slice(0, 7) : [];
  return <div className="shell"><aside className={collapsed ? "sidebar collapsed" : "sidebar"}><div className="side-top"><a href="/dashboard" className="brand">nammapros<span>.</span></a><button className="icon" aria-label="Toggle sidebar" onClick={() => setCollapsed(!collapsed)}>{collapsed ? "☰" : "×"}</button></div><div className="side-caption">OPERATIONS & FINANCE</div><nav>{nav.filter(([label, href]) => (!financePaths.has(href) || can("VIEW_FINANCE")) && (!["Staff", "Roles"].includes(label) || can("MANAGE_STAFF")) && (href !== "/audit-logs" || can("VIEW_AUDIT"))).map(([label, href]) => <a key={href} className={path === href ? "active" : ""} href={href}><span className="nav-dot" />{!collapsed && label}</a>)}</nav><div className="side-foot">{!collapsed && <><strong>{me.phone_e164}</strong><small>{me.roles.join(" · ")}</small></>}<button onClick={async () => { await api("/auth/logout/", "POST"); clearCsrf(); setMe(null); router.push("/login"); }}>Sign out</button></div></aside><main className="main"><header className="topbar"><span>Administration <b>/ {config?.title ?? (path === "/dashboard" ? "Dashboard" : path === "/finance" ? "Finance" : title(path.slice(1)))}</b></span><span className="avatar">{me.phone_e164.slice(-2)}</span></header><div className="content"><div className="heading"><div><p className="eyebrow">NAMMAPROS CONTROL CENTER</p><h1>{config?.title ?? (path === "/dashboard" ? "Dashboard" : path === "/finance" ? "Finance overview" : path === "/reports" ? "Reports" : title(path.slice(1)))}</h1><p>Live records from the NammaPros API</p></div>{config?.fields && can(path === "/pricing" ? "MANAGE_PRICING" : path === "/commissions" ? "APPROVE_SETTLEMENTS" : path === "/staff" ? "MANAGE_STAFF" : "MANAGE_SERVICES") && <button className="primary" onClick={() => { setEditing(null); setForm({}); setShowForm(true); }}>+ Add {config.title.toLowerCase()}</button>}</div>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {(path === "/dashboard" || path === "/finance" || path === "/reports") && <div className="filters"><label>Period<select value={period} onChange={e => setPeriod(e.target.value)}><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom</option></select></label>{period === "custom" && <><label>From<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label><label>To<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label></>}</div>}
    {metrics && <><div className="metrics">{Object.entries(metrics).filter(([, v]) => typeof v === "number").map(([k, v]) => <section className="metric" key={k}><span>{title(k)}</span><strong>{display(v, k)}</strong></section>)}</div><div className="chart-grid">{["booking_trend", "cancellation_trend", "category_performance", "technician_activity", "revenue_trend"].filter(k => Array.isArray(metricSource[k])).map(k => <section className="panel" key={k}><h2>{title(k)}</h2><MiniChart rows={metricSource[k] as Row[]} /></section>)}</div></>}
    {path === "/reports" && <ReportTabs period={period} start={start} end={end} />}
    {(path === "/leads" || /^\/leads\/[^/]+$/.test(path)) && <AdminLeads id={path === "/leads" ? undefined : path.split("/")[2]} canEdit={me.roles.some(r => ["SUPER_ADMIN", "OPERATIONS_MANAGER", "DISPATCH_OPERATOR", "SUPPORT_AGENT"].includes(r))} />}
    {path === "/roles" && <Roles data={data} onChange={action} canEdit={can("MANAGE_STAFF")} />}
    {path === "/settings" && <Settings data={data} onChange={action} canEdit={can("CHANGE_SETTINGS")} />}
    {isList && <section className="panel"><div className="table-head"><div className="filters"><input aria-label="Search" placeholder="Search records" value={search} onChange={e => { setPage(1); setSearch(e.target.value); }} /><select aria-label="Status filter" value={status} onChange={e => { setPage(1); setStatus(e.target.value); }}><option value="">All statuses</option>{["REQUESTED", "UNDER_REVIEW", "APPROVED", "VERIFIED", "CAPTURED", "SUCCEEDED", "FAILED", "PAID", "CANCELLED"].map(s => <option key={s}>{s}</option>)}</select></div><span>{list.count} records</span></div>{busy && <p className="loading">Loading records…</p>}{!busy && !list.rows.length && <div className="empty">No records found for this view.</div>}{!!list.rows.length && <div className="table-wrap"><table><thead><tr>{columns.map(k => <th key={k}>{title(k)}</th>)}<th>Actions</th></tr></thead><tbody>{list.rows.map((row, i) => <tr key={String(row.id ?? i)}>{columns.map(k => <td key={k} className={k === "status" ? "status-cell" : ""}>{display(row[k], k)}</td>)}<td><div className="row-actions">{config?.detail && row.id && <a href={`${listPath}/${row.id}`}>View</a>}{config?.fields && row.id && !["/commissions", "/staff"].includes(path) && <button onClick={() => { setEditing(row); setForm(row); setShowForm(true); }}>Edit</button>}{path === "/commissions" && row.id && !row.approved && can("APPROVE_SETTLEMENTS") && <button onClick={() => action(`/admin/commissions/${row.id}/`, "PATCH", { action: "approve" }, "Approve this commission rule?")}>Approve</button>}{path === "/finance/settlements" && row.id && row.status === "DRAFT" && <button onClick={() => action(`/admin/settlements/${row.id}/submit/`, "POST", {}, "Submit settlement for review?")}>Submit</button>}{path === "/finance/settlements" && row.id && row.status === "UNDER_REVIEW" && <button onClick={() => action(`/admin/settlements/${row.id}/approve/`, "POST", {}, "Approve this settlement?")}>Approve</button>}{path === "/finance/payouts" && row.id && row.status === "REQUESTED" && <button onClick={() => action(`/admin/payouts/${row.id}/`, "POST", {}, "Approve payout record? Provider execution remains blocked.")}>Approve</button>}{path === "/finance/refunds" && row.id && row.status === "REQUESTED" && can("APPROVE_REFUNDS") && <><button onClick={() => action(`/admin/finance/refunds/${row.id}/approve/`, "POST", {}, "Approve and initiate this refund with Razorpay?")}>Approve</button><button onClick={() => { const reason = window.prompt("Reason for rejection"); if (reason) action(`/admin/finance/refunds/${row.id}/reject/`, "POST", { reason }, "Reject this refund?"); }}>Reject</button></>}{path === "/staff" && row.id && <button onClick={() => { const role = window.prompt("Role to assign or remove"); if (role) action(`/admin/staff/${row.id}/`, "PATCH", { add_role: role }, "Assign this role?"); }}>Add role</button>}{path === "/finance/invoices" && row.id && <a href={`${base}/api/v1/admin/finance/invoices/${row.id}/download/`} target="_blank">PDF</a>}</div></td></tr>)}</tbody></table></div>}<div className="pager"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={page * 20 >= list.count} onClick={() => setPage(page + 1)}>Next</button></div></section>}
    {detailMatch && data && <section className="panel detail"><div className="detail-head"><a href={listPath}>← Back to {listPath.slice(1)}</a>{detailMatch[1] === "technicians" && can("MANAGE_TECHNICIANS") && <div><button onClick={() => action(`/admin/technicians/${detailMatch[2]}/verify/`, "POST", { note: "Verified by admin" }, "Verify technician?")}>Verify</button><button className="danger" onClick={() => action(`/admin/technicians/${detailMatch[2]}/suspend/`, "POST", { note: "Suspended by admin" }, "Suspend technician?")}>Suspend</button></div>}</div><dl>{Object.entries(data as Record<string, unknown>).map(([k, v]) => <div key={k}><dt>{title(k)}</dt><dd>{display(v, k)}</dd></div>)}</dl></section>}
    {detailMatch?.[1] === "bookings" && data && me.roles.some(r => ["SUPER_ADMIN", "OPERATIONS_MANAGER", "SUPPORT_AGENT"].includes(r)) && <BookingControls id={detailMatch[2]} version={Number((data as Row).version)} status={String((data as Row).status)} onDone={() => setRefresh(n => n + 1)} />}
    {path === "/services" && can("MANAGE_SERVICES") && <ImageForm onDone={() => setRefresh(n => n + 1)} />}
    {path === "/finance" && <FinanceTools onSubmit={action} refresh={refresh} />}
    {path === "/staff" && <><StaffTools onSubmit={action} /><LeadZoneGrants /></>}
    {path === "/notifications" && <section className="panel"><h2>Approved event directory</h2><p>{((data as { templates?: string[] } | null)?.templates ?? []).join(" · ") || "No templates configured."}</p><p>Failed or uncertain submissions require provider review before retry.</p></section>}
    {path === "/finance/settlements" && <SettlementForm onSubmit={action} />}{path === "/finance/payouts" && <PayoutForm onSubmit={action} />}{path === "/finance/refunds" && <RefundForm onSubmit={action} />}
    {showForm && config?.fields && <div className="modal-backdrop" role="presentation" onClick={() => setShowForm(false)}><section className="modal" role="dialog" aria-modal="true" aria-label={`${editing ? "Edit" : "Add"} ${config.title}`} onClick={e => e.stopPropagation()}><div className="modal-head"><h2>{editing ? "Edit" : "Add"} {config.title.toLowerCase()}</h2><button onClick={() => setShowForm(false)}>×</button></div><div className="form-grid">{config.fields.map(field => <label key={field.key}>{field.label ?? title(field.key)}{field.type === "checkbox" ? <input type="checkbox" checked={Boolean(form[field.key])} onChange={e => setForm({ ...form, [field.key]: e.target.checked })} /> : field.type === "json" ? <textarea value={typeof form[field.key] === "object" ? JSON.stringify(form[field.key]) : String(form[field.key] ?? "")} onChange={e => setForm({ ...form, [field.key]: e.target.value })} placeholder="Valid JSON" /> : <input type={field.type ?? "text"} required={field.required} value={String(form[field.key] ?? "")} onChange={e => setForm({ ...form, [field.key]: e.target.value })} />}</label>)}</div><div className="modal-actions"><button onClick={() => setShowForm(false)}>Cancel</button><button className="primary" disabled={busy} onClick={onFormSubmit}>Save</button></div></section></div>}
  </div></main></div>;
}

function MiniChart({ rows }: { rows: Row[] }) { const values = rows.map(r => Number(r.count ?? r.collected_paise ?? 0)); const max = Math.max(1, ...values); return <div className="chart">{rows.length ? rows.slice(-30).map((r, i) => <div className="bar-wrap" key={i} title={`${display(r.created_at__date ?? r.completed_at__date ?? r.service__category__name)}: ${values[i]}`}><div className="bar" style={{ height: `${Math.max(4, (values[i] / max) * 100)}%` }} /></div>) : <p>No data in this period.</p>}</div>; }
function SmallForm({ title: formTitle, fields, submit, onSubmit }: { title: string; fields: Field[]; submit: string; onSubmit: (body: Record<string, unknown>) => void }) { const [values, setValues] = useState<Record<string, string>>({}); return <section className="panel small-form"><h2>{formTitle}</h2><div className="filters">{fields.map(f => <label key={f.key}>{title(f.key)}<input type={f.type ?? "text"} value={values[f.key] ?? ""} onChange={e => setValues({ ...values, [f.key]: e.target.value })} /></label>)}<button className="primary" onClick={() => { const body: Record<string, unknown> = {}; for (const f of fields) if (values[f.key]) body[f.key] = f.type === "number" ? Number(values[f.key]) : values[f.key]; onSubmit(body); }}>{submit}</button></div></section>; }
function SettlementForm({ onSubmit }: { onSubmit: (url: string, method: string, body?: unknown, confirmText?: string) => void }) { return <SmallForm title="Generate settlement draft" fields={[{ key: "technician_id" }, { key: "period_start", type: "date" }, { key: "period_end", type: "date" }]} submit="Generate" onSubmit={body => onSubmit("/admin/settlements/generate/", "POST", body, "Generate a settlement draft from approved earnings?")} />; }
function PayoutForm({ onSubmit }: { onSubmit: (url: string, method: string, body?: unknown, confirmText?: string, idempotency?: boolean) => void }) { return <SmallForm title="Request payout record" fields={[{ key: "settlement_id" }, { key: "account_id" }, { key: "amount_paise", type: "number" }]} submit="Request payout" onSubmit={body => onSubmit("/admin/payouts/", "POST", body, "Request payout? Live transfer is disabled.", true)} />; }
function RefundForm({ onSubmit }: { onSubmit: (url: string, method: string, body?: unknown, confirmText?: string, idempotency?: boolean) => void }) { return <SmallForm title="Request refund" fields={[{ key: "payment_id" }, { key: "amount_paise", type: "number" }, { key: "reason_code" }]} submit="Request refund" onSubmit={body => onSubmit("/admin/finance/refunds/request/", "POST", body, "Create a refund request?", true)} />; }
function ReportTabs({ period, start, end }: { period: string; start: string; end: string }) { const [kind, setKind] = useState("bookings"), [data, setData] = useState<Record<string, unknown> | null>(null), [error, setError] = useState(""); useEffect(() => { const q = new URLSearchParams(); if (period === "custom") { if (!start || !end) return; q.set("start", start); q.set("end", end); } else q.set("period", period); api<Record<string, unknown>>(`/admin/reports/${kind}/?${q}`).then(setData).catch(e => setError(e.message)); }, [kind, period, start, end]); return <section className="panel"><div className="tabs">{["bookings", "revenue", "technicians", "finance"].map(k => <button className={kind === k ? "selected" : ""} onClick={() => setKind(k)} key={k}>{title(k)}</button>)}</div>{error && <p className="error">{error}</p>}{data && <dl className="report">{Object.entries(data).map(([k, v]) => <div key={k}><dt>{title(k)}</dt><dd>{display(v, k)}</dd></div>)}</dl>}</section>; }
function Roles({ data, onChange, canEdit }: { data: unknown; onChange: (url: string, method: string, body?: unknown, confirmText?: string) => void; canEdit: boolean }) { const roles = (data as { roles?: { name: string; permissions: string[] }[] } | null)?.roles ?? []; return <section className="panel"><h2>Permissions by role</h2>{roles.map(r => <div className="role-row" key={r.name}><strong>{r.name}</strong><span>{r.permissions.join(" · ")}</span>{canEdit && r.name !== "SUPER_ADMIN" && <button onClick={() => { const permission_code = window.prompt("Capability code"); if (permission_code) onChange(`/admin/roles/${r.name}/`, "PATCH", { permission_code, enabled: true }, "Grant this permission?"); }}>Grant capability</button>}</div>)}</section>; }
function Settings({ data, onChange, canEdit }: { data: unknown; onChange: (url: string, method: string, body?: unknown, confirmText?: string) => void; canEdit: boolean }) { const d = data as { settings?: Record<string, unknown>; providers?: Record<string, boolean> } | null; return <section className="panel"><h2>Platform settings</h2><p>Provider configuration status: {Object.entries(d?.providers ?? {}).map(([k, v]) => `${title(k)} ${v ? "configured" : "unavailable"}`).join(" · ")}</p>{Object.entries(d?.settings ?? {}).map(([k, v]) => <div className="role-row" key={k}><strong>{title(k)}</strong><span>{display(v)}</span></div>)}{canEdit && <button onClick={() => { const key = window.prompt("Setting key"); if (!key) return; const raw = window.prompt("JSON object"); if (!raw) return; try { onChange("/admin/settings/", "PATCH", { key, value: JSON.parse(raw) }, "Save platform setting?"); } catch { window.alert("Enter valid JSON."); } }}>Edit setting</button>}</section>; }
function ImageForm({ onDone }: { onDone: () => void }) { const [serviceId, setServiceId] = useState(""), [file, setFile] = useState<File | null>(null), [message, setMessage] = useState(""); return <section className="panel small-form"><h2>Service image</h2><div className="filters"><label>Service ID<input value={serviceId} onChange={e => setServiceId(e.target.value)} /></label><label>JPEG, PNG, or WebP<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><button className="primary" disabled={!serviceId || !file} onClick={async () => { try { if (file) { await uploadImage(serviceId, file); setMessage("Image uploaded."); onDone(); } } catch (e) { setMessage(e instanceof Error ? e.message : "Upload failed."); } }}>Upload image</button></div>{message && <p role="status">{message}</p>}</section>; }
function StaffTools({ onSubmit }: { onSubmit: (url: string, method: string, body?: unknown, confirmText?: string) => void }) { const [id, setId] = useState(""), [role, setRole] = useState(""); return <section className="panel small-form"><h2>Staff access changes</h2><div className="filters"><label>Staff user ID<input type="number" value={id} onChange={e => setId(e.target.value)} /></label><label>Role to remove<input value={role} onChange={e => setRole(e.target.value)} /></label><button disabled={!id || !role} onClick={() => onSubmit(`/admin/staff/${id}/`, "PATCH", { remove_role: role }, "Remove this staff role?")}>Remove role</button><button disabled={!id} onClick={() => onSubmit(`/admin/staff/${id}/`, "PATCH", { is_active: false }, "Deactivate this staff account?")}>Deactivate account</button><button disabled={!id} onClick={() => onSubmit(`/admin/staff/${id}/`, "PATCH", { is_active: true }, "Reactivate this staff account?")}>Reactivate</button></div></section>; }
function FinanceTools({ onSubmit, refresh }: { onSubmit: (url: string, method: string, body?: unknown, confirmText?: string) => void; refresh: number }) { const [tab, setTab] = useState("earnings"), [rows, setRows] = useState<Row[]>([]), [error, setError] = useState(""); const endpoints: Record<string, string> = { earnings: "/admin/earnings/", adjustments: "/admin/adjustments/", "payout accounts": "/admin/payout-accounts/", "ledger accounts": "/admin/finance/ledger/accounts/" }; useEffect(() => { api(endpoints[tab]).then(d => setRows(pickRows(d).rows)).catch(e => setError(e.message)); }, [tab, refresh]); return <section className="panel"><div className="tabs">{Object.keys(endpoints).map(k => <button key={k} className={tab === k ? "selected" : ""} onClick={() => setTab(k)}>{title(k)}</button>)}</div>{error && <p className="error">{error}</p>}{rows.length ? <div className="table-wrap"><table><thead><tr>{Object.keys(rows[0]).slice(0, 6).map(k => <th key={k}>{title(k)}</th>)}<th>Actions</th></tr></thead><tbody>{rows.map((r, i) => <tr key={String(r.id ?? i)}>{Object.keys(rows[0]).slice(0, 6).map(k => <td key={k}>{display(r[k], k)}</td>)}<td>{tab === "earnings" && r.status === "PENDING" && <button onClick={() => onSubmit(`/admin/earnings/${r.id}/approve/`, "POST", {}, "Approve this earning?")}>Approve</button>}{tab === "adjustments" && r.status === "REQUESTED" && <button onClick={() => onSubmit(`/admin/adjustments/${r.id}/approve/`, "POST", {}, "Approve this adjustment?")}>Approve</button>}</td></tr>)}</tbody></table></div> : <p className="empty">No records.</p>}{tab === "adjustments" && <SmallForm title="Request adjustment" fields={[{ key: "technician_id" }, { key: "amount_paise", type: "number" }, { key: "reason" }]} submit="Request" onSubmit={body => onSubmit("/admin/adjustments/", "POST", body, "Request this adjustment?")} />}{tab === "payout accounts" && <SmallForm title="Add provider payout reference" fields={[{ key: "technician_id" }, { key: "provider" }, { key: "provider_account_ref" }, { key: "masked_label" }]} submit="Add reference" onSubmit={body => onSubmit("/admin/payout-accounts/", "POST", body, "Add unverified payout reference?")} />}{tab === "ledger accounts" && <SmallForm title="Create ledger account" fields={[{ key: "code" }, { key: "name" }, { key: "kind" }]} submit="Create" onSubmit={body => onSubmit("/admin/finance/ledger/accounts/", "POST", body, "Create ledger account?")} />}</section>; }
