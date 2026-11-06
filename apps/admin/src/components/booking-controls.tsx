"use client";

import { useState } from "react";
import { api } from "../lib/api";

export default function BookingControls({ id, version, status, onDone }: { id: string; version: number; status: string; onDone: () => void }) {
  const [slots, setSlots] = useState<{ id: string; start_at: string; remaining: number }[]>([]);
  const [slotId, setSlotId] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const loadSlots = async () => { setError(""); try { const result = await api<{ slots: typeof slots }>(`/operations/bookings/${id}/slots/`); setSlots(result.slots); } catch (e) { setError(e instanceof Error ? e.message : "Could not load slots."); } };
  const run = async (action: string, body: unknown) => { setBusy(true); setError(""); try { await api(`/operations/bookings/${id}/${action}/`, "POST", body); onDone(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); } finally { setBusy(false); } };
  return <section className="panel"><h2>Booking controls</h2>{error && <p className="error" role="alert">{error}</p>}
    {status === "CONFIRMED_UNPAID" && <div className="filters"><button disabled={busy} onClick={loadSlots}>Find alternative slots</button><select value={slotId} onChange={e => setSlotId(e.target.value)}><option value="">Select appointment</option>{slots.map(s => <option key={s.id} value={s.id}>{new Date(s.start_at).toLocaleString("en-IN")} · {s.remaining} left</option>)}</select><button disabled={busy || !slotId} onClick={() => { if (window.confirm("Reschedule this booking?")) run("reschedule", { expected_version: version, slot_id: slotId }); }}>Reschedule</button></div>}
    {["CONFIRMED", "CONFIRMED_UNPAID", "AWAITING_PAYMENT"].includes(status) && <button disabled={busy} onClick={() => { const reason = window.prompt("Reason for cancellation"); if (reason) run("cancel", { expected_version: version, reason }); }}>Cancel booking</button>}
    <p>Payment and assignment rules are enforced by the existing operations API.</p></section>;
}
