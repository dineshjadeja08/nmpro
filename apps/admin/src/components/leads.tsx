"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

const operationsUrl = process.env.NEXT_PUBLIC_OPERATIONS_URL ?? "http://localhost:3003";

type Lead = { id: string; lead_reference: string; customer_name: string; mobile_number: string; service: string; area: string; source: string; status: string; priority: string; assigned_to: number | null; assigned_to_phone: string | null; created_at: string; follow_up_at: string | null; converted_booking_id: string | null; problem_description: string; address: string; city: string; pincode: string; internal_notes: string; activities?: { kind: string; detail: Record<string, unknown>; created_at: string }[] };
type Summary = { total: number; new: number; follow_ups_due: number; qualified: number; converted: number; conversion_rate: number };

export default function AdminLeads({ id, canEdit }: { id?: string; canEdit: boolean }) {
  const [list, setList] = useState<{ count: number; results: Lead[] }>({ count: 0, results: [] });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [page, setPage] = useState(1), [q, setQ] = useState(""), [status, setStatus] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState(""), [priority, setPriority] = useState("NORMAL"), [nextStatus, setNextStatus] = useState("NEW");
  const reload = () => {
    if (id) api<Lead>(`/operations/leads/${id}/`).then(l => { setLead(l); setOwner(l.assigned_to ? String(l.assigned_to) : ""); setPriority(l.priority); setNextStatus(l.status); }).catch(e => setError(e.message));
    else {
      const params = new URLSearchParams({ page: String(page), q, status });
      Promise.all([api<{ count: number; results: Lead[] }>(`/operations/leads/?${params}`), api<Summary>("/operations/leads/summary/")]).then(([rows, metrics]) => { setList(rows); setSummary(metrics); setError(""); }).catch(e => setError(e.message));
    }
  };
  useEffect(() => { reload(); if (!id) { const timer = window.setInterval(reload, 30000); return () => window.clearInterval(timer); } }, [id, page, q, status]);
  const save = async () => { if (!id) return; setBusy(true); setError(""); try {
    const body: Record<string, unknown> = { status: nextStatus, priority, assigned_to: owner ? Number(owner) : null };
    if (nextStatus === "LOST") { const reason = window.prompt("Reason for loss"); if (!reason) return; body.loss_reason = reason; }
    await api(`/operations/leads/${id}/`, "PATCH", body); reload();
  } catch (e) { setError(e instanceof Error ? e.message : "Update failed."); } finally { setBusy(false); } };
  return <section className="panel">{error && <p className="error" role="alert">{error}</p>}
    {id ? <>{lead ? <><p><a href="/leads">← All leads</a></p><h2>{lead.lead_reference}</h2><dl className="report">{Object.entries(lead).filter(([k]) => !["id", "activities"].includes(k)).map(([k, v]) => <div key={k}><dt>{k.replaceAll("_", " ")}</dt><dd>{v === null ? "—" : String(v)}</dd></div>)}</dl><h2>Activity</h2>{lead.activities?.map((a, i) => <p key={i}>{a.kind} · {new Date(a.created_at).toLocaleString("en-IN")} · {JSON.stringify(a.detail)}</p>)}{canEdit && lead.status !== "CONVERTED" && <div className="filters"><label>Status<select value={nextStatus} onChange={e => setNextStatus(e.target.value)}>{["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "LOST", "CANCELLED"].map(s => <option key={s}>{s}</option>)}</select></label><label>Priority<select value={priority} onChange={e => setPriority(e.target.value)}>{["LOW", "NORMAL", "HIGH", "URGENT"].map(s => <option key={s}>{s}</option>)}</select></label><label>Assigned staff user ID<input type="number" value={owner} onChange={e => setOwner(e.target.value)} /></label><button className="primary" disabled={busy} onClick={save}>Save lead</button><a href={`${operationsUrl}/leads/${lead.id}`}>Open full lead workflow</a></div>}</> : <p>Loading lead…</p>}</> : <><div className="table-head"><h2>Lead management</h2><span>Shared operations records · refreshes every 30 seconds</span></div>{summary && <div className="metrics">{Object.entries(summary).map(([k, v]) => <section className="metric" key={k}><span>{k.replaceAll("_", " ")}</span><strong>{k === "conversion_rate" ? `${v}%` : v}</strong></section>)}</div>}<div className="filters"><input placeholder="Reference, name, mobile" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "CONVERTED", "LOST", "CANCELLED"].map(s => <option key={s}>{s}</option>)}</select></div><div className="table-wrap"><table><thead><tr>{["Reference", "Customer", "Mobile", "Service", "Area", "Source", "Status", "Priority", "Assigned", "Created", "Follow-up", "Booking"].map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{list.results.map(l => <tr key={l.id}><td><a href={`/leads/${l.id}`}>{l.lead_reference}</a></td><td>{l.customer_name}</td><td>{l.mobile_number}</td><td>{l.service}</td><td>{l.area}</td><td>{l.source}</td><td>{l.status}</td><td>{l.priority}</td><td>{l.assigned_to_phone ?? "—"}</td><td>{new Date(l.created_at).toLocaleString("en-IN")}</td><td>{l.follow_up_at ? new Date(l.follow_up_at).toLocaleString("en-IN") : "—"}</td><td>{l.converted_booking_id ? <a href={`/bookings/${l.converted_booking_id}`}>View</a> : "—"}</td></tr>)}</tbody></table>{!list.results.length && <p className="empty">No leads found.</p>}</div><div className="pager"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>{list.count} leads · Page {page}</span><button disabled={page * 20 >= list.count} onClick={() => setPage(page + 1)}>Next</button></div></>}</section>;
}
