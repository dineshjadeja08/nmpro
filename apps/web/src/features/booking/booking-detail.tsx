"use client";

import { CalendarPlus, Camera, CheckCircle2, Download, MessageCircle, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LiveBookingTracker } from "@/components/live-booking-tracker";
import { ServiceImage } from "@/components/service-image";
import { bookingApi, type Booking, type Slot } from "@/lib/booking-api";
import { resolveUploadedMediaUrl } from "@/lib/service-images";
import { QuotationApproval } from "./quotation-approval";

const date = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const REVIEW_TAGS = ["On time", "Clean work", "Polite", "Clear pricing", "Solved quickly"] as const;

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

function downloadBookingIcs(booking: Booking) {
  const startUtc = new Date(booking.slot.start_at).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const endUtc = new Date(booking.slot.end_at).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const location = `${booking.address.line_1}, ${booking.address.locality}, ${booking.address.city} ${booking.address.postal_code}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NammaPros//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${booking.id}@nammapros`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:NammaPros — ${booking.service} (${booking.reference})`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nammapros-${booking.reference}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BookingDetail({ id, confirmed }: { id: string; confirmed: boolean }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentUncertain, setPaymentUncertain] = useState(false);

  // Post-job review state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTags, setReviewTags] = useState<string[]>([]);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewPhoto, setReviewPhoto] = useState<File | null>(null);
  const [reviewMessage, setReviewMessage] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const [whatsappNotice, setWhatsappNotice] = useState("");

  useEffect(() => {
    let active = true;
    bookingApi
      .booking(id)
      .then((result) => {
        if (active) {
          setBooking(result);
          setPaymentUncertain(Boolean(result.payment_attempt_unresolved));
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("This booking is unavailable or you are signed out.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function cancel() {
    if (!booking || !window.confirm("Cancel this booking?")) return;
    setBusy(true);
    setError("");
    try {
      await bookingApi.cancel(id, booking.version);
      setBooking(await bookingApi.booking(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancellation failed. Refresh and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function findSlots() {
    if (!booking) return;
    setBusy(true);
    setError("");
    try {
      const start = new Date();
      const end = new Date(start.getTime() + 14 * 86400000);
      const result = await bookingApi.slots(booking.package_id, booking.address_id, start.toISOString(), end.toISOString());
      setSlots(result.slots.filter((item) => item.start_at !== booking.slot.start_at));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Appointments could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function reschedule(slot: Slot) {
    if (!booking) return;
    setBusy(true);
    setError("");
    try {
      const hold = await bookingApi.hold(booking.package_id, booking.address_id, slot.id);
      await bookingApi.reschedule(id, hold.id, booking.version);
      setBooking(await bookingApi.booking(id));
      setSlots([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rescheduling failed. Your original booking remains in place.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshPayment() {
    setBusy(true);
    setError("");
    try {
      const latest = await bookingApi.booking(id);
      setBooking(latest);
      setPaymentUncertain(Boolean(latest.payment_attempt_unresolved));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment status could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!booking || booking.status !== "AWAITING_PAYMENT" || busy || paymentUncertain) return;
    setBusy(true);
    setError("");
    setPaymentMessage("Your payment is being verified. Please don't pay again yet.");
    try {
      const order = await bookingApi.paymentOrder(id, `order-${id}`);
      setPaymentUncertain(true);
      await loadCheckout();
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!Razorpay) throw new Error("Payment checkout could not load.");
      new Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: "NammaPros",
        description: booking.service,
        handler: async (result: CheckoutResult) => {
          try {
            await bookingApi.verifyPayment(id, result.razorpay_order_id, result.razorpay_payment_id, result.razorpay_signature);
            const latest = await bookingApi.booking(id);
            setBooking(latest);
            setPaymentUncertain(Boolean(latest.payment_attempt_unresolved));
            setPaymentMessage(
              latest.status === "CONFIRMED"
                ? "Payment verified. Your visit is booked."
                : "Your payment is being verified. Please don't pay again yet."
            );
          } catch {
            setPaymentMessage("Your payment is being verified. Please don't pay again yet.");
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setPaymentMessage("Checkout closed. Check payment status before trying again.");
          },
        },
      }).open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment checkout is unavailable.");
      setBusy(false);
    }
  }

  async function payBalance() {
    if (!booking || busy || paymentUncertain) return;
    setBusy(true);
    setError("");
    setPaymentMessage("Processing your balance payment...");
    try {
      const order = await bookingApi.balancePaymentOrder(id, `balance-${id}-${Date.now()}`);
      setPaymentUncertain(true);
      await loadCheckout();
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!Razorpay) throw new Error("Payment checkout could not load.");
      new Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: "NammaPros",
        description: `Balance for ${booking.service}`,
        handler: async (result: CheckoutResult) => {
          try {
            await bookingApi.verifyBalancePayment(id, result.razorpay_order_id, result.razorpay_payment_id, result.razorpay_signature);
            const latest = await bookingApi.booking(id);
            setBooking(latest);
            setPaymentUncertain(Boolean(latest.payment_attempt_unresolved));
            setPaymentMessage(
              latest.payment_status === "PAID" ? "Balance verified. Fully paid." : "Balance payment is being verified."
            );
          } catch {
            setPaymentMessage("Balance verification pending. Please check again shortly.");
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setPaymentMessage("Checkout closed. You can pay at visit or retry online.");
          },
        },
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
      await bookingApi.submitReview(id, reviewRating, reviewComment, reviewTags, reviewPhoto);
      setBooking(await bookingApi.booking(id));
      setReviewPhoto(null);
      setReviewMessage("Thank you! Your review has been saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit review.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWhatsappPref(checked: boolean) {
    setWhatsappOptIn(checked);
    try {
      await bookingApi.saveNotificationPreferences({
        whatsapp_opt_in: checked,
        sms_opt_in: true,
        email_opt_in: true,
      });
      setWhatsappNotice("WhatsApp notification preference saved.");
    } catch {
      // ignore non-blocking pref failure
    }
  }

  return (
    <main className="container simple-page booking-detail pb-28 md:pb-16 space-y-6">
      {loading ? (
        <div className="booking-loading" aria-label="Loading booking">
          <span className="ui-skeleton" />
          <span className="ui-skeleton" />
        </div>
      ) : error && !booking ? (
        <div className="status-panel" role="alert">
          <h1>Booking unavailable</h1>
          <p>{error}</p>
          <Link href="/bookings">My Bookings</Link>
        </div>
      ) : (
        booking && (
          <>
            {confirmed && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-emerald-50/90 p-5 text-emerald-950">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-emerald-600 text-white animate-[popInOnce_.32s_ease-out]">
                    <CheckCircle2 size={22} strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-800">
                      Booking confirmed
                    </p>
                    <h2 className="font-serif text-xl font-bold">Pro arrives in your chosen slot</h2>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadBookingIcs(booking)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-white px-4 text-xs font-bold text-[#1C1917] shadow-xs"
                  >
                    <CalendarPlus size={15} strokeWidth={1.5} className="text-[#800020]" /> Add to calendar
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-serif text-3xl font-bold text-[#1C1917] sm:text-4xl">
                  {confirmed && booking.status === "CONFIRMED_UNPAID" ? "Your visit is booked." : "Booking details"}
                </h1>
                <p className="mt-1 text-sm text-[#57534E]">
                  Booking ID: <strong className="font-mono text-[#1C1917]">{booking.reference}</strong>
                </p>
              </div>
              {!confirmed && (
                <button
                  type="button"
                  onClick={() => downloadBookingIcs(booking)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[#D6CEC6] bg-white px-4 text-xs font-bold text-[#1C1917]"
                >
                  <CalendarPlus size={15} strokeWidth={1.5} className="text-[#800020]" /> Add to calendar
                </button>
              )}
            </div>

            <LiveBookingTracker
              status={booking.status}
              technician={booking.technician ?? null}
              startOtpCode={booking.start_otp_code}
            />

            {error && <div className="booking-warning" role="alert">{error}</div>}
            {paymentMessage && <div className="booking-warning" role="status">{paymentMessage}</div>}
            {reviewMessage && (
              <div className="rounded-lg bg-emerald-50 p-4 text-xs font-semibold text-emerald-900" role="status">
                {reviewMessage}
              </div>
            )}

            {booking.status === "AWAITING_PAYMENT" && booking.payment_status === "FAILED" && (
              <div className="booking-warning" role="status">
                The previous payment attempt did not complete. Retry before your slot hold closes.
              </div>
            )}

            {booking.status === "AWAITING_PAYMENT" && (
              <section className="status-panel space-y-3">
                <h2 className="font-serif text-xl font-bold">
                  {booking.price.advance_paise
                    ? `To pay now: ${money(booking.price.advance_paise)} · ${money(booking.price.remaining_balance_paise ?? 0)} at visit`
                    : "Payment required"}
                </h2>
                <p className="text-xs text-[#57534E]">
                  {booking.payment_expires_at
                    ? `Complete before ${date(booking.payment_expires_at)} to keep this slot locked.`
                    : "Complete checkout to lock this visit."}
                </p>
                <div className="booking-actions">
                  <button className="button button-primary" disabled={busy || paymentUncertain} onClick={pay}>
                    {booking.price.advance_paise ? `Pay ${money(booking.price.advance_paise)} now` : "Pay securely"}
                  </button>
                  <button className="button button-outline" disabled={busy} onClick={refreshPayment}>
                    Check payment status
                  </button>
                </div>
              </section>
            )}

            {booking.payment_status === "ADVANCE_PAID" && (booking.price.remaining_balance_paise ?? 0) > 0 && (
              <section className="status-panel space-y-3">
                <h2 className="font-serif text-xl font-bold">
                  Remaining balance: {money(booking.price.remaining_balance_paise!)}
                </h2>
                <p className="text-xs text-[#57534E]">
                  You paid {money(booking.price.advance_paise ?? 0)} advance. Pay the balance online or at visit via Cash/UPI.
                </p>
                <div className="booking-actions">
                  <button className="button button-primary" disabled={busy || paymentUncertain} onClick={payBalance}>
                    Pay balance online
                  </button>
                  <button className="button button-outline" disabled={busy} onClick={refreshPayment}>
                    Check payment status
                  </button>
                </div>
              </section>
            )}

            <div className="rounded-lg bg-white p-6 shadow-[0_8px_28px_rgba(28,25,23,0.05)]">
              <div className="draft-summary">
                <div><span>Service</span><b>{booking.service} · {booking.package}</b></div>
                <div>
                  <span>Where</span>
                  <b>{booking.address.line_1}, {booking.address.locality}, {booking.address.city} {booking.address.postal_code}</b>
                </div>
                <div><span>When</span><b>{date(booking.slot.start_at)}</b></div>
                <div><span>Visit status</span><b>{booking.status.replaceAll("_", " ")}</b></div>
                <div><span>Payment</span><b>{booking.payment_status.replaceAll("_", " ")}</b></div>
                {booking.price.lines.filter((line) => line.amount_paise > 0).map((line) => (
                  <div key={line.code}>
                    <span className="capitalize">{line.code.toLowerCase()}</span>
                    <b>{money(line.amount_paise)}</b>
                  </div>
                ))}
                <div><span>Total</span><b>{money(booking.price.total_paise)}</b></div>
              </div>
            </div>

            <QuotationApproval bookingId={id} technicianPhone={booking.technician?.phone} />

            {/* Post-job One-Tap Rating + Tags + Photo Upload */}
            {booking.can_review && (
              <section className="rounded-lg bg-white p-6 shadow-[0_10px_30px_rgba(28,25,23,0.06)] space-y-4">
                <h2 className="font-serif text-xl font-bold text-[#1C1917]">How did your visit go?</h2>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className={`inline-flex min-h-[48px] items-center gap-1 rounded-md px-4 text-sm font-bold transition ${
                        reviewRating >= star
                          ? "bg-[#C8A35B] text-white"
                          : "bg-[#F4EFE9] text-[#57534E]"
                      }`}
                    >
                      <Star size={15} strokeWidth={1.5} className={reviewRating >= star ? "fill-white" : ""} />
                      <span>{star}</span>
                    </button>
                  ))}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-[#57534E]">Quick highlights (optional)</p>
                  <div className="flex flex-wrap gap-2">
                    {REVIEW_TAGS.map((tag) => {
                      const active = reviewTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            setReviewTags((curr) => (curr.includes(tag) ? curr.filter((t) => t !== tag) : [...curr, tag]))
                          }
                          className={`min-h-[40px] rounded-md px-3.5 text-xs font-semibold transition ${
                            active ? "bg-[#800020] text-white" : "bg-[#F4EFE9] text-[#1C1917]"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <textarea
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share a quick note about your pro or work quality..."
                  className="w-full rounded-lg border border-[#D6CEC6] bg-[#FBF8F5] p-3.5 text-sm outline-none focus:border-[#800020]"
                />

                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-[#D6CEC6] bg-[#FBF8F5] px-4 text-xs font-bold text-[#1C1917]">
                  <Camera size={15} strokeWidth={1.5} className="text-[#800020]" />
                  <span>{reviewPhoto ? reviewPhoto.name : "Add a work photo (optional)"}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setReviewPhoto(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>

                <div>
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => void submitReview()}
                  >
                    Submit review
                  </button>
                </div>
              </section>
            )}

            {booking.review && (
              <section className="rounded-lg bg-white p-6 shadow-[0_6px_20px_rgba(28,25,23,0.05)] space-y-2">
                <h2 className="font-serif text-lg font-bold text-[#1C1917]">Your review ({booking.review.rating} ★)</h2>
                <p className="text-sm text-[#57534E]">{booking.review.comment || "Rated without comment."}</p>
                {booking.review.tags && booking.review.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {booking.review.tags.map((t) => (
                      <span key={t} className="rounded-md bg-[#f5ebe8] px-2.5 py-0.5 text-xs font-semibold text-[#800020]">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {booking.review.photo_url && resolveUploadedMediaUrl(booking.review.photo_url) && (
                  <div className="relative h-28 w-40 overflow-hidden rounded-md">
                    <ServiceImage src={booking.review.photo_url} alt="Your uploaded work photo" sizes="160px" />
                  </div>
                )}
              </section>
            )}

            {/* WhatsApp Opt-in */}
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-[0_6px_20px_rgba(28,25,23,0.04)]">
              <span className="flex items-center gap-2.5 text-sm font-medium text-[#1C1917]">
                <MessageCircle size={18} strokeWidth={1.5} className="text-emerald-700" />
                <span>Receive WhatsApp updates for pro arrival &amp; invoice</span>
              </span>
              <input
                type="checkbox"
                checked={whatsappOptIn}
                onChange={(e) => void saveWhatsappPref(e.target.checked)}
                className="h-5 w-5 accent-[#800020]"
              />
            </label>
            {whatsappNotice && <p className="text-xs font-semibold text-emerald-700">{whatsappNotice}</p>}

            <section className="booking-timeline rounded-lg bg-white p-6 shadow-[0_6px_20px_rgba(28,25,23,0.05)]">
              <h2 className="font-serif text-lg font-bold">Timeline</h2>
              <div className="mt-3 space-y-1.5 text-xs text-[#57534E]">
                {booking.events.map((event, index) => (
                  <p key={index}>
                    {date(event.created_at)} — <strong className="text-[#1C1917]">{event.to_status.replaceAll("_", " ")}</strong>
                  </p>
                ))}
              </div>
            </section>

            <div className="booking-actions">
              <Link className="button button-outline" href="/bookings">My Bookings</Link>
              {booking.invoice_available && (
                <a className="button button-outline" href={bookingApi.invoiceUrl(id)}>
                  <Download size={15} strokeWidth={1.5} /> Download invoice
                </a>
              )}
              <Link className="button button-outline" href="/services">Book another service</Link>
              {booking.can_cancel && (
                <button className="button button-outline" disabled={busy} onClick={cancel}>
                  Cancel booking
                </button>
              )}
              {booking.can_reschedule && (
                <button className="button button-outline" disabled={busy} onClick={findSlots}>
                  Reschedule free
                </button>
              )}
            </div>

            {slots.length > 0 && (
              <div className="booking-slot-list">
                <h3 className="w-full font-serif text-lg font-bold">Choose a new appointment</h3>
                {slots.map((slot) => (
                  <button type="button" key={slot.id} disabled={busy} onClick={() => reschedule(slot)}>
                    {date(slot.start_at)}
                  </button>
                ))}
              </div>
            )}
          </>
        )
      )}
    </main>
  );
}
