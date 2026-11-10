"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookingApi, type Booking, type Slot } from "@/lib/booking-api";
import { QuotationApproval } from "./quotation-approval";
import { LiveBookingTracker } from "@/components/live-booking-tracker";

const date = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" }).format(new Date(value));
const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayWindow = Window & { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } };
function loadCheckout() {
  return new Promise<void>((resolve, reject) => {
    if ((window as RazorpayWindow).Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Payment checkout could not load. Refresh and retry."));
    document.body.appendChild(script);
  });
}

export function BookingDetail({ id, confirmed }: { id: string; confirmed: boolean }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentUncertain, setPaymentUncertain] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  useEffect(() => {
    let active = true;
    bookingApi.booking(id).then(result => { if (active) { setBooking(result); setPaymentUncertain(Boolean(result.payment_attempt_unresolved)); setLoading(false); } })
      .catch(() => { if (active) { setError("This booking is unavailable or you are signed out."); setLoading(false); } });
    return () => { active = false; };
  }, [id]);
  async function cancel() {
    if (!booking || !window.confirm("Cancel this booking?")) return;
    setBusy(true); setError("");
    try { await bookingApi.cancel(id, booking.version); setBooking(await bookingApi.booking(id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Cancellation failed. Refresh and retry."); }
    finally { setBusy(false); }
  }
  async function findSlots() {
    if (!booking) return;
    setBusy(true); setError("");
    try {
      const start = new Date(); const end = new Date(start.getTime() + 14 * 86400000);
      const result = await bookingApi.slots(booking.package_id, booking.address_id, start.toISOString(), end.toISOString());
      setSlots(result.slots.filter(item => item.start_at !== booking.slot.start_at));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Appointments could not be loaded."); }
    finally { setBusy(false); }
  }
  async function reschedule(slot: Slot) {
    if (!booking) return;
    setBusy(true); setError("");
    try {
      const hold = await bookingApi.hold(booking.package_id, booking.address_id, slot.id);
      await bookingApi.reschedule(id, hold.id, booking.version);
      setBooking(await bookingApi.booking(id)); setSlots([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rescheduling failed. Your original booking remains in place."); }
    finally { setBusy(false); }
  }
  async function refreshPayment() {
    setBusy(true); setError("");
    try {
      const latest = await bookingApi.booking(id);
      setBooking(latest);
      setPaymentUncertain(Boolean(latest.payment_attempt_unresolved));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Payment status could not be refreshed."); }
    finally { setBusy(false); }
  }
  async function pay() {
    if (!booking || booking.status !== "AWAITING_PAYMENT" || busy || paymentUncertain) return;
    setBusy(true); setError("");
    setPaymentMessage("Your payment is being verified. Please don't pay again yet.");
    try {
      const order = await bookingApi.paymentOrder(id, `order-${id}`);
      setPaymentUncertain(true);
      await loadCheckout();
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!Razorpay) throw new Error("Payment checkout could not load.");
      new Razorpay({
        key: order.key_id, order_id: order.order_id, amount: order.amount_paise,
        currency: order.currency, name: "NammaPros", description: booking.service,
        handler: async (result: CheckoutResult) => {
          try {
            await bookingApi.verifyPayment(id, result.razorpay_order_id,
                                           result.razorpay_payment_id, result.razorpay_signature);
            const latest = await bookingApi.booking(id);
            setBooking(latest);
            setPaymentUncertain(Boolean(latest.payment_attempt_unresolved));
            setPaymentMessage(latest.status === "CONFIRMED" ? "Payment verified. Your visit is booked." :
                              "Your payment is being verified. Please don't pay again yet.");
          } catch {
            setPaymentMessage("Your payment is being verified. Please don't pay again yet.");
          } finally { setBusy(false); }
        },
        modal: { ondismiss: () => { setBusy(false); setPaymentMessage("Checkout closed. Refresh payment status before trying again."); } },
      }).open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment checkout is unavailable.");
      setBusy(false);
    }
  }
  async function payBalance() {
    if (!booking || busy || paymentUncertain) return;
    setBusy(true); setError("");
    setPaymentMessage("Your balance payment is being processed...");
    try {
      const order = await bookingApi.balancePaymentOrder(id, `balance-${id}-${Date.now()}`);
      setPaymentUncertain(true);
      await loadCheckout();
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!Razorpay) throw new Error("Payment checkout could not load.");
      new Razorpay({
        key: order.key_id, order_id: order.order_id, amount: order.amount_paise,
        currency: order.currency, name: "NammaPros", description: `Balance for ${booking.service}`,
        handler: async (result: CheckoutResult) => {
          try {
            await bookingApi.verifyBalancePayment(id, result.razorpay_order_id,
                                                  result.razorpay_payment_id, result.razorpay_signature);
            const latest = await bookingApi.booking(id);
            setBooking(latest);
            setPaymentUncertain(Boolean(latest.payment_attempt_unresolved));
            setPaymentMessage(latest.payment_status === "PAID" ? "Balance payment verified. Fully paid." :
                              "Your payment is being verified.");
          } catch {
            setPaymentMessage("Your balance payment is being verified. Please refresh in a moment.");
          } finally { setBusy(false); }
        },
        modal: { ondismiss: () => { setBusy(false); setPaymentMessage("Checkout closed. You can pay at visit or retry online."); } },
      }).open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Balance payment checkout is unavailable.");
      setBusy(false);
    }
  }
  async function submitReview() {
    if (!booking || busy) return;
    setBusy(true);
    setError("");
    setReviewMessage("");
    try {
      await bookingApi.submitReview(id, reviewRating, reviewComment);
      setBooking(await bookingApi.booking(id));
      setReviewMessage("Thank you! Your service review has been submitted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit review.");
    } finally {
      setBusy(false);
    }
  }
  return <main className="container simple-page booking-detail">{loading ? <div className="booking-loading" aria-label="Loading booking"><span className="ui-skeleton"/><span className="ui-skeleton"/></div> : error && !booking ? <div className="status-panel" role="alert"><h1>Booking unavailable</h1><p>{error}</p><Link href="/bookings">My Bookings</Link></div> : booking && <>{confirmed && booking.status === "CONFIRMED_UNPAID" && <span className="section-kicker">BOOKING CONFIRMED</span>}<h1>{confirmed && booking.status === "CONFIRMED_UNPAID" ? "Your visit is booked." : "Booking details"}</h1><p>Reference <strong>{booking.reference}</strong></p><div style={{ margin: "24px 0" }}><LiveBookingTracker status={booking.status} technician={booking.technician ?? null} /></div>{booking.start_otp_code && <section className="status-panel" style={{ borderLeft: "4px solid #800020", background: "#fdf6f8" }}><h2>Service Start OTP: <strong style={{ letterSpacing: "0.18em", fontSize: "1.4rem", color: "#800020" }}>{booking.start_otp_code}</strong></h2><p>Share this 4-digit OTP only with your NammaPros technician when they arrive to begin the job.</p></section>}{error && <div className="booking-warning" role="alert">{error}</div>}{paymentMessage && <div className="booking-warning" role="status">{paymentMessage}</div>}{reviewMessage && <div className="booking-warning" role="status">{reviewMessage}</div>}{booking.status === "AWAITING_PAYMENT" && booking.payment_status === "FAILED" && <div className="booking-warning" role="status">The previous payment attempt failed. You can retry before the reservation expires.</div>}{booking.status === "AWAITING_PAYMENT" && <section className="status-panel"><h2>{booking.price.advance_paise ? `Advance payment required: ${money(booking.price.advance_paise)}` : "Payment required"}</h2><p>{booking.price.advance_paise ? `Pay advance of ${money(booking.price.advance_paise)} to confirm. Remaining ${money(booking.price.remaining_balance_paise ?? 0)} is payable at visit. Your appointment is reserved until ` : "Your appointment is reserved until "}{booking.payment_expires_at ? date(booking.payment_expires_at) : "the payment deadline"}. It is confirmed after payment verification.</p><div className="booking-actions"><button className="button" disabled={busy || paymentUncertain} onClick={pay}>{booking.price.advance_paise ? `Pay advance ${money(booking.price.advance_paise)}` : "Pay securely"}</button><button className="button button-outline" disabled={busy} onClick={refreshPayment}>Refresh payment status</button></div></section>}{booking.payment_status === "ADVANCE_PAID" && (booking.price.remaining_balance_paise ?? 0) > 0 && <section className="status-panel"><h2>Remaining balance: {money(booking.price.remaining_balance_paise!)}</h2><p>Advance of {money(booking.price.advance_paise ?? 0)} was paid. You can pay the balance now online or pay the technician during the visit (Cash or UPI).</p><div className="booking-actions"><button className="button" disabled={busy || paymentUncertain} onClick={payBalance}>Pay balance online</button><button className="button button-outline" disabled={busy} onClick={refreshPayment}>Refresh payment status</button></div></section>}{booking.payment_status === "REFUND_PENDING" && <div className="booking-warning" role="status">Your payment needs finance review. Please do not pay again.</div>}<div className="draft-summary"><div><span>Service</span><b>{booking.service} · {booking.package}</b></div><div><span>Address</span><b>{booking.address.line_1}, {booking.address.locality}, {booking.address.city} {booking.address.postal_code}</b></div><div><span>Appointment (IST)</span><b>{date(booking.slot.start_at)}</b></div><div><span>Booking status</span><b>{booking.status.replaceAll("_", " ")}</b></div><div><span>Payment status</span><b>{booking.payment_status.replaceAll("_", " ")}</b></div>{booking.price.lines.filter(line => line.amount_paise > 0).map(line => <div key={line.code}><span>{line.code.toLowerCase()}</span><b>{money(line.amount_paise)}</b></div>)}<div><span>Total</span><b>{money(booking.price.total_paise)}</b></div>{Boolean(booking.price.advance_paise) && <div><span>Advance {booking.payment_status === "ADVANCE_PAID" || booking.payment_status === "PAID" ? "paid" : "required"}</span><b>{money(booking.price.advance_paise!)}</b></div>}{Boolean(booking.price.remaining_balance_paise && booking.price.remaining_balance_paise > 0) && <div><span>Remaining balance</span><b>{money(booking.price.remaining_balance_paise!)}</b></div>}</div><QuotationApproval bookingId={id} />{booking.can_review && <section className="status-panel" style={{ marginTop: "20px" }}><h2>Rate your service experience</h2><div className="booking-actions" style={{ margin: "10px 0" }}>{[1, 2, 3, 4, 5].map(star => <button key={star} type="button" className={reviewRating >= star ? "button" : "button button-outline"} onClick={() => setReviewRating(star)}>{star} ★</button>)}</div><textarea rows={3} value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="Share feedback about the technician and service..." style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #d4c4c8", marginBottom: "10px" }} /><button className="button" disabled={busy} onClick={submitReview}>Submit Review</button></section>}{booking.review && <section className="status-panel" style={{ marginTop: "20px" }}><h2>Your review ({booking.review.rating} ★)</h2><p>{booking.review.comment || "Rated without comment."}</p></section>}<section className="booking-timeline"><h2>Timeline</h2>{booking.events.map((event, index) => <p key={index}>{date(event.created_at)} — {event.to_status.replaceAll("_", " ")}</p>)}</section><p>Support contact details will appear when the support channel is configured.</p><div className="booking-actions"><Link className="button button-outline" href="/bookings">My Bookings</Link>{booking.invoice_available && <a className="button button-outline" href={bookingApi.invoiceUrl(id)}>Download invoice</a>}<Link className="button button-outline" href="/">Back to Home</Link><Link className="button button-outline" href="/services">Rebook a service</Link>{booking.can_cancel && <button className="button button-outline" disabled={busy} onClick={cancel}>Cancel booking</button>}{booking.can_reschedule && <button className="button button-outline" disabled={busy} onClick={findSlots}>Reschedule</button>}</div>{slots.length > 0 && <div className="booking-slot-list"><h3>Choose a new appointment</h3>{slots.map(slot => <button type="button" key={slot.id} disabled={busy} onClick={() => reschedule(slot)}>{date(slot.start_at)}</button>)}</div>}</>}</main>;
}
