"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookingRequest } from "@/lib/booking-api";

type Refund = { id: string; amount_paise: number; status: string };
type Payment = { id: string; booking_id: string; booking_reference: string; amount_paise: number;
                 currency: string; status: string; refunds: Refund[] };
const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export function PaymentHistory() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    bookingRequest<{ count: number; payments: Payment[] }>(`/customers/payments/?page=${page}`)
      .then(data => { if (active) { setRows(data.payments); setCount(data.count); setLoading(false); } })
      .catch(() => { if (active) { setError("Sign in to view payment history, or try again later."); setLoading(false); } });
    return () => { active = false; };
  }, [page]);
  return <main className="container simple-page"><h1>Payment history</h1>
    {loading ? <p>Loading payments…</p> : error ? <div className="booking-warning" role="alert">{error}</div> : !count ? <p>No payments recorded yet.</p> : <>{rows.map(payment => <section className="ui-card" key={payment.id}>
      <h2><Link href={`/bookings/${payment.booking_id}`}>{payment.booking_reference}</Link></h2>
      <p>{money(payment.amount_paise)} · {payment.status.replaceAll("_", " ")}</p>
      {payment.refunds.length > 0 && <><h3>Refunds</h3>{payment.refunds.map(refund => <p key={refund.id}>{money(refund.amount_paise)} · {refund.status.replaceAll("_", " ")}</p>)}</>}
    </section>)}<div className="booking-actions"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="button button-outline" disabled={page * 20 >= count} onClick={() => setPage(page + 1)}>Next</button></div></>}
  </main>;
}
