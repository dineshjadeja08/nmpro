"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Grant = { id: string; user_id: number; zone_id: string };

export default function LeadZoneGrants() {
  const [rows, setRows] = useState<Grant[]>([]), [userId, setUserId] = useState(""), [zoneId, setZoneId] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = () => api<{ results: Grant[] }>("/operations/lead-zone-grants/").then(r => setRows(r.results)).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  const add = async () => { setBusy(true); setError(""); try { await api("/operations/lead-zone-grants/", "POST", { user_id: Number(userId), zone_id: zoneId }); setUserId(""); setZoneId(""); load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not grant zone."); } finally { setBusy(false); } };
  const remove = async (id: string) => { if (!window.confirm("Remove this lead zone grant?")) return; setBusy(true); setError(""); try { await api(`/operations/lead-zone-grants/${id}/`, "DELETE"); load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not remove zone."); } finally { setBusy(false); } };
  return <section className="panel"><h2>Operations lead zone access</h2><p>Staff with zone grants can only see and manage leads in those zones. Leave a staff member without grants only when their role permits area-wide access.</p>{error && <p className="error" role="alert">{error}</p>}<div className="filters"><label>Staff user ID<input type="number" value={userId} onChange={e => setUserId(e.target.value)} /></label><label>Zone UUID<input value={zoneId} onChange={e => setZoneId(e.target.value)} /></label><button className="primary" disabled={busy || !userId || !zoneId} onClick={add}>Grant zone</button></div><div className="table-wrap"><table><thead><tr><th>Staff user ID</th><th>Zone UUID</th><th>Action</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.user_id}</td><td>{r.zone_id}</td><td><button disabled={busy} onClick={() => remove(r.id)}>Remove</button></td></tr>)}</tbody></table></div></section>;
}
