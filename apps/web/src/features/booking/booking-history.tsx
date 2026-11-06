"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookingApi, type Booking } from "@/lib/booking-api";

const date = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function BookingHistory() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    bookingApi.bookings(page).then(result => { if (active) { setBookings(result.results); setCount(result.count); setLoading(false); } })
      .catch(() => { if (active) { setError("Sign in or refresh to view your bookings."); setLoading(false); } });
    return () => { active = false; };
  }, [page]);
  const groups = [
    { title: "Upcoming", items: bookings.filter(item => (item.status === "CONFIRMED_UNPAID" || item.status === "CONFIRMED") && new Date(item.slot.start_at) >= new Date()) },
    { title: "Past appointments", items: bookings.filter(item => (item.status === "CONFIRMED_UNPAID" || item.status === "CONFIRMED") && new Date(item.slot.start_at) < new Date()) },
    { title: "Completed", items: bookings.filter(item => item.status === "CLOSED" || item.status === "SERVICE_COMPLETED") },
    { title: "Awaiting payment", items: bookings.filter(item => item.status === "AWAITING_PAYMENT") },
    { title: "Cancelled or expired", items: bookings.filter(item => item.status === "CANCELLED" || item.status === "EXPIRED") },
  ];
  return <main className="container simple-page booking-history"><h1>My Bookings</h1><p>Your bookings are loaded from your signed-in account.</p>{loading ? <div className="booking-loading" aria-label="Loading bookings"><span className="ui-skeleton"/><span className="ui-skeleton"/></div> : error ? <div className="status-panel" role="alert"><h2>Bookings unavailable</h2><p>{error}</p><Link href="/account">Go to account</Link></div> : count === 0 ? <div className="status-panel"><h2>No bookings yet</h2><p>Explore services to plan your first visit.</p><Link href="/services">Explore services</Link></div> : <>{groups.map(group => <section key={group.title}><h2>{group.title}</h2>{group.items.length ? group.items.map(item => <Link className="booking-history-card" key={item.id} href={`/bookings/${item.id}`}><b>{item.service}</b><span>{item.reference}</span><span>{date(item.slot.start_at)} · {item.status.replaceAll("_", " ")}</span></Link>) : <p>No {group.title.toLowerCase()} bookings on this page.</p>}</section>)}<div className="booking-actions"><button className="button button-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="button button-outline" disabled={page * 20 >= count} onClick={() => setPage(page + 1)}>Next</button></div></>}</main>;
}
