"use client";
import { useCallback, useEffect, useState } from "react";
import { bookingApi, type JobQuotation } from "@/lib/booking-api";

const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
export function QuotationApproval({ bookingId }: { bookingId: string }) {
  const [quotes, setQuotes] = useState<JobQuotation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => bookingApi.quotations(bookingId).then(data => setQuotes(data.quotations)).catch(e => setError(e instanceof Error ? e.message : "Quotations could not load.")), [bookingId]);
  useEffect(() => { void reload(); }, [reload]);
  async function decide(quoteId: string, action: "approve" | "reject") {
    setBusy(true); setError("");
    try { await bookingApi.quotationDecision(bookingId, quoteId, action); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Decision could not be saved."); }
    finally { setBusy(false); }
  }
  if (!quotes.length && !error) return null;
  return <section className="status-panel" aria-label="Additional work quotations"><h2>Additional work quotations</h2><p>Review each item before approving additional work. Approval does not charge your payment method automatically.</p>{error && <p className="booking-warning" role="alert">{error}</p>}{quotes.map(q => <div key={q.id} className="draft-summary" style={{ marginBottom: 16 }}><div><span>Status</span><b>{q.status.replaceAll("_", " ")}</b></div><div><span>Labour</span><b>{money(q.labour_paise)}</b></div>{q.items.map((item, i) => <div key={i}><span>{item.description} × {item.quantity}</span><b>{money(item.total_paise)}</b></div>)}<div><span>Tax</span><b>{money(q.tax_paise)}</b></div><div><span>Total additional amount</span><b>{money(q.total_paise)}</b></div><div><span>Valid until</span><b>{new Date(q.valid_until).toLocaleString("en-IN")}</b></div>{q.status === "SUBMITTED" && <div className="booking-actions"><button className="button" disabled={busy || new Date(q.valid_until) <= new Date()} onClick={() => decide(q.id, "approve")}>Approve additional work</button><button className="button button-outline" disabled={busy} onClick={() => decide(q.id, "reject")}>Reject</button></div>}</div>)}</section>;
}
