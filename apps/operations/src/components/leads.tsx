"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type ConversionPackage, type Lead, type LeadSummary, type Page } from "../lib/api";

const statuses = ["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "LOST", "CANCELLED"];
const sources = ["PHONE_CALL", "WHATSAPP", "WEBSITE", "WALK_IN", "REFERRAL", "CAMPAIGN", "OTHER"];
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];
const label = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase());
const dateTime = (s: string | null) => s ? new Date(s).toLocaleString("en-IN") : "—";
const phone = (s: string) => { const digits = s.replace(/\D/g, ""); return digits.length === 12 && digits.startsWith("91") ? `+${digits}` : `+91${digits}`; };
type Catalog = Awaited<ReturnType<typeof api.catalog>>;

export function LeadsList() {
  const [rows, setRows] = useState<Page<Lead> | null>(null);
  const [summary, setSummary] = useState<LeadSummary | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({ q: "", status: "", source: "", priority: "", area: "", service: "", assigned_to: "", start: "", end: "" });
  const [page, setPage] = useState(1), [error, setError] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [followState, setFollowState] = useState("due");
  const [followUps, setFollowUps] = useState<Awaited<ReturnType<typeof api.leadFollowUps>> | null>(null);
  const update = (key: string, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(1); };
  useEffect(() => { api.catalog().then(setCatalog).catch(() => {}); }, []);
  useEffect(() => { api.leadFollowUps(followState).then(setFollowUps).catch(e => setError(e.message)); }, [followState]);
  useEffect(() => {
    let active = true;
    const load = () => { Promise.all([api.leads({ ...filters, page }), api.leadSummary()]).then(([list, totals]) => {
      if (active) { setRows(list); setSummary(totals); setError(""); }
    }).catch(e => { if (active) setError(e.message); }); };
    load(); const timer = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [filters, page]);
  return <><div className="heading"><div><h1>Leads</h1><p className="muted">Shared with Admin · refreshes every 30 seconds</p></div><Link className="btn" href="/leads/new">+ Create lead</Link></div>
    {error && <p className="error" role="alert">{error}</p>}
    {summary && <div className="grid">{Object.entries(summary).map(([key, value]) => <div className="card" key={key}><span className="muted">{label(key)}</span><div className="metric">{key === "conversion_rate" ? `${value}%` : value}</div></div>)}</div>}
    <div className="filters" style={{ marginTop: 20 }}><input className="input" aria-label="Search leads" placeholder="Reference, customer, mobile" value={filters.q} onChange={e => update("q", e.target.value)} />
      <select className="input" aria-label="Status" value={filters.status} onChange={e => update("status", e.target.value)}><option value="">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
      <select className="input" aria-label="Service" value={filters.service} onChange={e => update("service", e.target.value)}><option value="">All services</option>{catalog?.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <input className="input" placeholder="Area" value={filters.area} onChange={e => update("area", e.target.value)} />
      <select className="input" aria-label="Source" value={filters.source} onChange={e => update("source", e.target.value)}><option value="">All sources</option>{sources.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
      <select className="input" aria-label="Priority" value={filters.priority} onChange={e => update("priority", e.target.value)}><option value="">All priorities</option>{priorities.map(s => <option key={s}>{s}</option>)}</select>
      <input className="input" type="number" placeholder="Assigned staff ID" value={filters.assigned_to} onChange={e => update("assigned_to", e.target.value)} />
      <label className="field">From<input type="date" value={filters.start} onChange={e => update("start", e.target.value)} /></label><label className="field">To<input type="date" value={filters.end} onChange={e => update("end", e.target.value)} /></label></div>
    <div className="table-wrap"><table><thead><tr>{["Reference", "Customer", "Mobile", "Service", "Area", "Source", "Status", "Priority", "Assigned to", "Created", "Next follow-up", "Actions"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{rows?.results.map(l => <tr key={l.id}><td><Link href={`/leads/${l.id}`}>{l.lead_reference}</Link></td><td>{l.customer_name}</td><td>{l.mobile_number}</td><td>{l.service}</td><td>{l.area}</td><td>{label(l.source)}</td><td><span className="pill">{label(l.status)}</span></td><td>{l.priority}</td><td>{l.assigned_to_phone ?? "Unassigned"}</td><td>{dateTime(l.created_at)}</td><td>{dateTime(l.follow_up_at)}</td><td><Link href={`/leads/${l.id}`}>View</Link> · <Link href={`/leads/${l.id}/edit`}>Edit</Link></td></tr>)}</tbody></table>{rows?.results.length === 0 && <div className="empty">No leads match these filters.</div>}</div>
    <div className="row" style={{ marginTop: 16 }}><span>{rows?.count ?? 0} leads · Page {page}</span><div className="actions"><button className="btn ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn ghost" disabled={page * 20 >= (rows?.count ?? 0)} onClick={() => setPage(page + 1)}>Next</button></div></div>
    <section className="card" style={{ marginTop: 20 }}><div className="row"><h2>Follow-ups</h2><select className="input" value={followState} onChange={e => setFollowState(e.target.value)}>{["due", "overdue", "upcoming", "completed"].map(s => <option key={s}>{label(s)}</option>)}</select></div>{followUps?.results.length ? followUps.results.map(f => <p key={f.id}><Link href={`/leads/${f.lead_id}`}>{f.lead_reference}</Link> · {f.customer_name} · {dateTime(f.due_at)} · {f.notes}</p>) : <p className="muted">No follow-ups in this queue.</p>}</section></>;
}

export function LeadForm({ id }: { id?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({ customer_name: "", mobile_number: "", source: "PHONE_CALL", priority: "NORMAL", urgency: "NORMAL", status: "NEW" });
  const [catalog, setCatalog] = useState<Catalog | null>(null), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => { api.catalog().then(setCatalog).catch(e => setError(e.message)); if (id) api.lead(id).then(l => {
    const copy: Record<string, string> = {}; Object.entries(l).forEach(([k, v]) => { if (v !== null && typeof v !== "object") copy[k] = String(v); });
    if (copy.follow_up_at) copy.follow_up_at = new Date(copy.follow_up_at).toISOString().slice(0, 16);
    setForm(copy);
  }).catch(e => setError(e.message)); }, [id]);
  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value, ...(key === "service_category_id" ? { service_id: "" } : {}) }));
  const field = (key: string, name: string, required = false, type = "text") => <label className="field" key={key}>{name}<input type={type} required={required} value={form[key] ?? ""} onChange={e => set(key, e.target.value)} /></label>;
  const save = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(""); try {
    const fields = ["customer_name", "mobile_number", "alternate_mobile", "email", "service_category_id", "service_id", "problem_description", "address", "landmark", "area", "city", "pincode", "preferred_date", "preferred_time", "urgency", "source", "status", "priority", "assigned_to", "follow_up_at", "internal_notes", "loss_reason"];
    const body: Record<string, unknown> = Object.fromEntries(fields.filter(k => form[k] !== undefined).map(k => [k, form[k]]));
    body.mobile_number = phone(form.mobile_number);
    if (form.alternate_mobile) body.alternate_mobile = phone(form.alternate_mobile);
    if (form.follow_up_at) body.follow_up_at = new Date(form.follow_up_at).toISOString();
    for (const k of ["preferred_date", "preferred_time", "follow_up_at", "assigned_to"]) if (!form[k]) delete body[k];
    if (form.assigned_to) body.assigned_to = Number(form.assigned_to);
    const lead = id ? await api.updateLead(id, body) : await api.createLead(body);
    router.push(`/leads/${lead.id}`); router.refresh();
  } catch (e) { setError(e instanceof Error ? e.message : "Could not save lead."); } finally { setSaving(false); } };
  return <><div className="heading"><h1>{id ? "Edit lead" : "Create lead"}</h1><Link href={id ? `/leads/${id}` : "/leads"}>Back</Link></div><form className="stack" onSubmit={save}>
    {error && <p className="error" role="alert">{error}</p>}
    <section className="card"><h2>Customer</h2><div className="grid">{field("customer_name", "Customer name", true)}{field("mobile_number", "Mobile number (+91)", true, "tel")}{field("alternate_mobile", "Alternate mobile", false, "tel")}{field("email", "Email", false, "email")}</div></section>
    <section className="card"><h2>Service</h2><div className="grid"><label className="field">Category<select required value={form.service_category_id ?? ""} onChange={e => set("service_category_id", e.target.value)}><option value="">Select category</option>{catalog?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field">Service<select required value={form.service_id ?? ""} onChange={e => set("service_id", e.target.value)}><option value="">Select service</option>{catalog?.services.filter(s => catalog.categories.find(c => c.id === form.service_category_id)?.slug === s.category).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{field("preferred_date", "Preferred date", false, "date")}{field("preferred_time", "Preferred time", false, "time")}<label className="field">Urgency<select value={form.urgency ?? "NORMAL"} onChange={e => set("urgency", e.target.value)}>{["NORMAL", "SOON", "URGENT"].map(s => <option key={s}>{s}</option>)}</select></label></div><label className="field">Problem description<textarea value={form.problem_description ?? ""} onChange={e => set("problem_description", e.target.value)} /></label></section>
    <section className="card"><h2>Location</h2><div className="grid">{field("address", "Address")}{field("landmark", "Landmark")}{field("area", "Area")}{field("city", "City")}{field("pincode", "PIN code")}</div></section>
    <section className="card"><h2>Lead management</h2><div className="grid"><label className="field">Source<select value={form.source ?? "PHONE_CALL"} onChange={e => set("source", e.target.value)}>{sources.map(s => <option key={s} value={s}>{label(s)}</option>)}</select></label><label className="field">Status<select value={form.status ?? "NEW"} onChange={e => set("status", e.target.value)}>{statuses.filter(s => s !== "CONVERTED").map(s => <option key={s}>{s}</option>)}</select></label><label className="field">Priority<select value={form.priority ?? "NORMAL"} onChange={e => set("priority", e.target.value)}>{priorities.map(s => <option key={s}>{s}</option>)}</select></label>{field("assigned_to", "Assigned staff user ID", false, "number")}{field("follow_up_at", "Follow-up", false, "datetime-local")}{form.status === "LOST" && field("loss_reason", "Lost reason", true)}</div><label className="field">Internal notes<textarea value={form.internal_notes ?? ""} onChange={e => set("internal_notes", e.target.value)} /></label></section>
    <div className="actions"><button className="btn" disabled={saving}>{saving ? "Saving…" : id ? "Save lead" : "Create lead"}</button><Link className="btn ghost" href="/leads">Cancel</Link></div></form></>;
}

export function LeadDetail({ id }: { id: string }) {
  const [lead, setLead] = useState<Lead | null>(null), [options, setOptions] = useState<ConversionPackage[]>([]);
  const [packageId, setPackageId] = useState(""), [slotId, setSlotId] = useState("");
  const [dueAt, setDueAt] = useState(""), [followNotes, setFollowNotes] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const reload = () => { api.lead(id).then(setLead).catch(e => setError(e.message)); api.conversionOptions(id).then(r => setOptions(r.packages)).catch(() => setOptions([])); };
  useEffect(() => { reload(); }, [id]);
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(""); try { await fn(); reload(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); } finally { setBusy(false); } };
  const selected = options.find(p => p.id === packageId);
  if (!lead) return <div className="empty">{error || "Loading lead…"}</div>;
  return <><div className="heading"><div><h1>{lead.lead_reference}</h1><p className="muted">Created {dateTime(lead.created_at)}</p></div><div className="actions"><Link className="btn ghost" href="/leads">All leads</Link>{lead.status !== "CONVERTED" && <Link className="btn" href={`/leads/${id}/edit`}>Edit lead</Link>}</div></div>{error && <p className="error" role="alert">{error}</p>}
    <div className="grid"><section className="card"><h2>Customer</h2><p>{lead.customer_name} · {lead.mobile_number}</p><p>{lead.alternate_mobile} {lead.email}</p><p>{lead.address}, {lead.area}, {lead.city} {lead.pincode}</p><p>{lead.landmark}</p></section><section className="card"><h2>Service request</h2><p>{lead.service_category} / {lead.service}</p><p>{lead.problem_description || "No description"}</p><p>Preferred: {lead.preferred_date ?? "—"} {lead.preferred_time ?? ""}</p><p>Urgency: {lead.urgency}</p></section><section className="card"><h2>Management</h2><p>Status: {label(lead.status)} · Priority: {lead.priority}</p><p>Source: {label(lead.source)}</p><p>Assigned: {lead.assigned_to_phone ?? "Unassigned"}</p><p>Next follow-up: {dateTime(lead.follow_up_at)}</p>{lead.converted_booking_id && <Link href={`/bookings/${lead.converted_booking_id}`}>View linked booking</Link>}<p>{lead.internal_notes}</p></section></div>
    {lead.status !== "CONVERTED" && <section className="card" style={{ marginTop: 18 }}><h2>Follow-up</h2><div className="filters"><label className="field">Due at<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label><label className="field">Notes<input value={followNotes} onChange={e => setFollowNotes(e.target.value)} /></label><button className="btn" disabled={busy || !dueAt} onClick={() => act(() => api.followUp(id, { due_at: new Date(dueAt).toISOString(), notes: followNotes }))}>Schedule</button></div>{lead.follow_ups?.map(f => <p key={f.id}>{dateTime(f.due_at)} · {f.notes} · {f.completed_at ? "Completed" : <button className="btn ghost" disabled={busy} onClick={() => act(() => api.completeFollowUp(id, f.id))}>Mark completed</button>}</p>)}</section>}
    {lead.status === "QUALIFIED" && <section className="card" style={{ marginTop: 18 }}><h2>Convert to booking</h2><p className="muted">Only live serviceable slots are shown. The server recalculates price and capacity.</p><div className="filters"><label className="field">Package<select value={packageId} onChange={e => { setPackageId(e.target.value); setSlotId(""); }}><option value="">Select package</option>{options.map(p => <option key={p.id} value={p.id}>{p.name} · ₹{(p.total_paise / 100).toFixed(2)} · {p.payment_policy}</option>)}</select></label><label className="field">Appointment<select value={slotId} onChange={e => setSlotId(e.target.value)}><option value="">Select slot</option>{selected?.slots.map(s => <option key={s.id} value={s.id}>{dateTime(s.start_at)} · {s.remaining} left</option>)}</select></label><button className="btn" disabled={busy || !selected || !slotId} onClick={() => { if (window.confirm("Create this booking for the lead's customer?")) act(() => api.convertLead(id, { package_id: packageId, slot_id: slotId, accepted_total_paise: selected?.total_paise })); }}>Confirm conversion</button></div>{!options.length && <p>No eligible priced packages or slots. Complete address, coverage, pricing and capacity first.</p>}</section>}
    <section className="card" style={{ marginTop: 18 }}><h2>Activity timeline</h2>{lead.activities?.length ? lead.activities.map((a, i) => <p key={i}><strong>{label(a.kind)}</strong> · {dateTime(a.created_at)} · {JSON.stringify(a.detail)}</p>) : <p>No activity yet.</p>}</section></>;
}
