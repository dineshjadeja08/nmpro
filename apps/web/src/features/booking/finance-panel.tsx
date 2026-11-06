"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bookingRequest } from "@/lib/booking-api";

type PaymentRow = { id: string; booking_reference: string; amount_paise: number; currency: string; status: string; provider_payment_id: string };
type RefundRow = { id: string; booking_reference: string; amount_paise: number; status: string; provider_refund_id: string | null };
type ExceptionRow = { id: string; type: string; severity: string; status: string; booking_id: string | null };
type EventRow = { id: string; type: string; processing_status: string; received_at: string };
type InvoiceRow = { id: string; booking_reference: string; invoice_number: string; status: string; total_paise: number };
const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export function FinancePanel() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [reference, setReference] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refundKey = useRef("");
  const load = useCallback(async () => {
    const filter = reference ? `?booking_reference=${encodeURIComponent(reference)}` : "";
    const [p, r, e, v, i] = await Promise.all([
      bookingRequest<{ payments: PaymentRow[] }>(`/finance/payments/${filter}`),
      bookingRequest<{ refunds: RefundRow[] }>("/finance/refunds/"),
      bookingRequest<{ exceptions: ExceptionRow[] }>("/finance/exceptions/"),
      bookingRequest<{ events: EventRow[] }>("/finance/events/"),
      bookingRequest<{ invoices: InvoiceRow[] }>("/finance/invoices/"),
    ]);
    setPayments(p.payments); setRefunds(r.refunds); setExceptions(e.exceptions);
    setEvents(v.events); setInvoices(i.invoices);
  }, [reference]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(() => setError("Finance access is unavailable. Sign in with a finance role.")); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Finance action failed."); }
    finally { setBusy(false); }
  }
  async function submitRefund() {
    if (!refundKey.current) refundKey.current = crypto.randomUUID();
    await run(async () => {
      await bookingRequest("/finance/refunds/", "POST", {
        payment_id: paymentId, amount_paise: Number(amount), reason_code: reason,
      }, refundKey.current);
      refundKey.current = "";
      setPaymentId(""); setAmount(""); setReason("");
    });
  }
  return <main className="container simple-page"><h1>Finance review</h1><p>Access is restricted by server finance grants. Provider acceptance and final settlement are separate states.</p>
    {error && <div className="booking-warning" role="alert">{error}</div>}
    <section><h2>Payments</h2><label htmlFor="finance-reference">Booking reference</label><input id="finance-reference" value={reference} onChange={event => setReference(event.target.value)} maxLength={32}/>
      <div className="booking-actions"><button className="button button-outline" disabled={busy} onClick={() => run(load)}>Refresh</button></div>
      {payments.map(payment => <p key={payment.id}><b>{payment.booking_reference}</b> · {money(payment.amount_paise)} · {payment.status} · {payment.provider_payment_id}</p>)}
    </section>
    <section><h2>Request a refund</h2><p>Only authorized finance users can submit. A different approver must approve. Enter paise from the approved policy.</p>
      <div className="form-field"><label htmlFor="refund-payment">Payment ID</label><input id="refund-payment" value={paymentId} onChange={event => setPaymentId(event.target.value)}/></div>
      <div className="form-field"><label htmlFor="refund-amount">Amount (paise)</label><input id="refund-amount" type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)}/></div>
      <div className="form-field"><label htmlFor="refund-reason">Approved reason code</label><input id="refund-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={40}/></div>
      <button className="button" disabled={busy || !paymentId || !amount || !reason} onClick={submitRefund}>Request refund</button>
    </section>
    <section><h2>Refunds</h2>{refunds.map(refund => <div key={refund.id} className="booking-history-card"><b>{refund.booking_reference}</b> · {money(refund.amount_paise)} · {refund.status}
      {refund.status === "REQUESTED" && <button className="button button-outline" disabled={busy} onClick={() => run(() => bookingRequest(`/finance/refunds/${refund.id}/approve/`, "POST"))}>Approve</button>}
      {refund.status === "PROCESSING" && <button className="button button-outline" disabled={busy} onClick={() => run(() => bookingRequest(`/finance/refunds/${refund.id}/reconcile/`, "POST"))}>Check provider status</button>}</div>)}</section>
    <section><h2>Reconciliation exceptions</h2>{exceptions.map(item => <p key={item.id}><b>{item.type}</b> · {item.severity} · {item.status} · {item.booking_id ?? "No booking linked"}</p>)}</section>
    <section><h2>Payment events</h2>{events.map(item => <p key={item.id}><b>{item.type}</b> · {item.processing_status} · {item.received_at}</p>)}</section>
    <section><h2>Issued invoices</h2>{invoices.map(item => <p key={item.id}><b>{item.invoice_number}</b> · {item.booking_reference} · {money(item.total_paise)} · {item.status}</p>)}</section>
  </main>;
}
