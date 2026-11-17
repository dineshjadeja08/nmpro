"use client";

import type { Service } from "@nammapros/types";
import {
  CalendarClock,
  Check,
  ChevronRight,
  CreditCard,
  Home,
  MapPin,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sun,
  Sunrise,
  Sunset,
  Tag,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { getPackageUnitPaise, pickDefaultPackage, useBookingCart } from "@/components/booking-cart-provider";
import { GoogleMapsLocationPicker, type PickedLocationResult } from "@/components/google-maps-location-picker";
import { useServiceLocation } from "@/components/location-provider";
import { QuickOtpSheet } from "@/components/quick-otp-sheet";
import {
  EMPTY_ADDRESS,
  formatFullSlot,
  formatRupees,
  formatSlotTime,
  getIstDayKey,
  getIstHour,
  loadRazorpayCheckout,
  type CheckoutResult,
  type RazorpayWindow,
} from "@/components/slot-first-checkout";
import { bookingApi, BookingApiError, type Address, type Booking, type Hold, type Quote, type QuoteItem, type Slot } from "@/lib/booking-api";

/* ------------------------------------------------------------------------------------------------
 * Checkout page: steps on the left (contact → address → visit time → payment), cart and bill on the
 * right. The visit time and the address are chosen in pop-ups. Booking logic (hold → quote → confirm →
 * Razorpay) is the same as the older in-sheet checkout.
 * ---------------------------------------------------------------------------------------------- */

type FormAddress = Omit<Address, "id" | "line_1">;

function dayParts(dayKey: string) {
  const d = new Date(`${dayKey}T06:00:00+05:30`);
  const today = getIstDayKey(new Date().toISOString());
  const tomorrow = getIstDayKey(new Date(Date.now() + 86400000).toISOString());
  const top = dayKey === today ? "Today" : dayKey === tomorrow ? "Tomorrow" : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" }).format(d);
  const date = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric" }).format(d);
  const month = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short" }).format(d);
  return { top, date, month };
}

/** One key per booking attempt so a double click can't create two bookings. */
function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `np-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function addressLine(a: Address) {
  return [a.house_flat, a.street, a.locality, a.city].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : "");
}

export function CheckoutView({ services, requestedService }: { services: Service[]; requestedService?: string }) {
  const router = useRouter();
  const { location: headerLocation } = useServiceLocation();
  const { items, addToCart, updateItemQuantity, clearCart } = useBookingCart();

  // Opened from a "Book" link with ?service=…: put that service in the cart once.
  const requestedDone = useRef(false);
  useEffect(() => {
    if (requestedDone.current || !requestedService) return;
    requestedDone.current = true;
    const svc = services.find((s) => s.slug === requestedService);
    const pkg = svc ? pickDefaultPackage(svc) : null;
    if (!svc || !pkg) return;
    // Wait for the stored cart to load so the service is added to it, not replaced by it.
    const t = window.setTimeout(() => addToCart(svc, pkg, 1, "", false), 120);
    return () => window.clearTimeout(t);
  }, [requestedService, services, addToCart]);

  const primary = items[0] ?? null;

  /* ---- account ---- */
  const [phone, setPhone] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const checkSession = useCallback(() => {
    bookingApi
      .me()
      .then((me) => {
        setAuthenticated(true);
        setPhone(me.phone_e164 || null);
      })
      .catch(() => {
        setAuthenticated(false);
        setPhone(null);
      });
  }, []);
  useEffect(() => {
    checkSession();
    window.addEventListener("nammapros:auth-changed", checkSession);
    return () => window.removeEventListener("nammapros:auth-changed", checkSession);
  }, [checkSession]);

  /* ---- addresses ---- */
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    bookingApi
      .addresses()
      .then((res) => {
        if (!active) return;
        setAddresses(res.addresses);
        setSelectedAddress((curr) => curr ?? res.addresses.find((a) => a.is_default) ?? res.addresses[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [authenticated]);

  /* ---- slot, hold, quote ---- */
  const [slotOpen, setSlotOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const quoteItemsRef = useRef<QuoteItem[] | undefined>(undefined);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState(primary?.problemDescription ?? "");

  const quoteItems = useCallback((): QuoteItem[] | undefined => {
    return items.length > 1 || (items[0]?.quantity ?? 1) > 1
      ? items.map((ci) => ({ package_id: ci.pkg.id, quantity: ci.quantity }))
      : undefined;
  }, [items]);

  const resetBooking = useCallback(() => {
    if (hold) void bookingApi.release(hold.id).catch(() => undefined);
    setHold(null);
    setQuote(null);
    setSelectedSlot(null);
  }, [hold]);

  async function holdAndQuote(slot: Slot, addr: Address) {
    if (!primary) return;
    setPreparing(true);
    setMessage("");
    try {
      const coverage = await bookingApi.serviceability(primary.pkg.id, addr.id);
      if (!coverage.supported) {
        setMessage(coverage.reason ?? "This address is outside our service areas for now.");
        return;
      }
      if (hold) await bookingApi.release(hold.id).catch(() => undefined);
      const nextHold = await bookingApi.hold(primary.pkg.id, addr.id, slot.id);
      setHold(nextHold);
      setSelectedSlot(slot);
      const payload = quoteItems();
      quoteItemsRef.current = payload;
      setQuote(await bookingApi.quote(nextHold.id, payload));
      setIdempotencyKey(newKey());
    } catch (err) {
      if (err instanceof BookingApiError && (err.status === 401 || err.status === 403)) {
        setAuthenticated(false);
        setOtpOpen(true);
      } else {
        setMessage(err instanceof Error ? err.message : "That time could not be held. Please pick another.");
      }
      setSelectedSlot(null);
    } finally {
      setPreparing(false);
    }
  }

  // Cart quantities changed after the bill was made: ask for a fresh quote on the same hold.
  const cartKey = items.map((i) => `${i.pkg.id}:${i.quantity}`).join("|");
  useEffect(() => {
    if (!hold || !quote) return;
    const payload = quoteItems();
    const sameAsBefore = JSON.stringify(payload) === JSON.stringify(quoteItemsRef.current);
    if (sameAsBefore) return;
    const t = window.setTimeout(() => {
      quoteItemsRef.current = payload;
      bookingApi
        .quote(hold.id, payload, quote.coupon_code ?? undefined)
        .then(setQuote)
        .catch((err) => setMessage(err instanceof Error ? err.message : "Could not update the bill."));
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey]);

  /* ---- referral code ---- */
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  async function applyCode(raw: string) {
    if (!hold) return;
    const code = raw.trim().toUpperCase();
    setCodeError("");
    setCodeBusy(true);
    try {
      setQuote(await bookingApi.quote(hold.id, quoteItemsRef.current, code || undefined));
      setCodeInput(code);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "This code could not be applied.");
    } finally {
      setCodeBusy(false);
    }
  }

  /* ---- confirm and pay ---- */
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [paying, setPaying] = useState(false);
  const [pending, setPending] = useState<Booking | null>(null);
  const [payNote, setPayNote] = useState("");
  const [payUncertain, setPayUncertain] = useState(false);

  const finish = useCallback(
    (b: Booking) => {
      clearCart();
      router.push(`/bookings/${b.id}?confirmed=1`);
    },
    [clearCart, router]
  );

  async function openRazorpay(target: Booking) {
    if (payUncertain) return;
    setPaying(true);
    setPayNote("Opening secure payment…");
    try {
      const order = await bookingApi.paymentOrder(target.id, `order-${target.id}`);
      setPayUncertain(true);
      await loadRazorpayCheckout();
      const Razorpay = (window as RazorpayWindow).Razorpay;
      if (!Razorpay) throw new Error("Payment checkout could not load.");
      new Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: "NammaPros",
        description: target.service,
        handler: async (result: CheckoutResult) => {
          try {
            await bookingApi.verifyPayment(target.id, result.razorpay_order_id, result.razorpay_payment_id, result.razorpay_signature);
            const latest = await bookingApi.booking(target.id);
            setPending(latest);
            setPayUncertain(Boolean(latest.payment_attempt_unresolved));
            if (latest.status === "CONFIRMED") finish(latest);
            else setPayNote("We're confirming your payment. Please don't pay again yet.");
          } catch {
            setPayNote("We're confirming your payment. Please don't pay again yet.");
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            setPayNote("Payment window closed. Check the status before trying again.");
          },
        },
      }).open();
    } catch (err) {
      setPayUncertain(false);
      setPayNote(err instanceof Error ? err.message : "Payment could not open right now.");
      setPaying(false);
    }
  }

  async function confirmAndPay() {
    if (!hold || !quote) return;
    if (pending) return void openRazorpay(pending);
    setPaying(true);
    setMessage("");
    try {
      let active = quote;
      if (new Date(quote.expires_at).getTime() - Date.now() < 30000) {
        active = await bookingApi.quote(hold.id, quoteItemsRef.current, quote.coupon_code ?? undefined);
        setQuote(active);
      }
      const created = await bookingApi.confirm(hold.id, active.id, active.total_paise, idempotencyKey || newKey(), problem);
      setPending(created);
      setPayUncertain(Boolean(created.payment_attempt_unresolved));
      if (created.status === "AWAITING_PAYMENT") {
        await openRazorpay(created);
        return;
      }
      finish(created);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not confirm the booking. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  async function refreshStatus() {
    if (!pending) return;
    setPaying(true);
    try {
      const latest = await bookingApi.booking(pending.id);
      setPending(latest);
      setPayUncertain(Boolean(latest.payment_attempt_unresolved));
      if (latest.status === "CONFIRMED") finish(latest);
      else setPayNote(latest.payment_attempt_unresolved ? "Your payment is still being checked." : "Payment not received yet. You can try again.");
    } catch (err) {
      setPayNote(err instanceof Error ? err.message : "Could not check the payment status.");
    } finally {
      setPaying(false);
    }
  }

  /* ---- money ---- */
  const itemTotal = items.reduce((s, i) => s + (getPackageUnitPaise(i.service, i.pkg) ?? 0) * i.quantity, 0);
  const mrpTotal = items.reduce((s, i) => s + (i.pkg.mrp_paise ?? getPackageUnitPaise(i.service, i.pkg) ?? 0) * i.quantity, 0);
  const payNow = quote
    ? quote.payment_policy === "ADVANCE"
      ? quote.advance_paise ?? quote.total_paise
      : quote.payment_policy === "PAY_AT_VISIT"
        ? 0
        : quote.total_paise
    : null;
  const atVisit = quote ? (quote.payment_policy === "ADVANCE" ? quote.remaining_balance_paise ?? 0 : quote.payment_policy === "PAY_AT_VISIT" ? quote.total_paise : 0) : null;

  /* ---- grouped cart ---- */
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; rows: typeof items }>();
    for (const it of items) {
      const g = map.get(it.service.id) ?? { name: it.service.name, rows: [] };
      g.rows.push(it);
      map.set(it.service.id, g);
    }
    return [...map.values()];
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#F7EEF0] text-[#800020]">
          <CalendarClock size={28} strokeWidth={1.5} />
        </span>
        <h1 className="mt-4 text-xl font-bold text-[#1C1917]">Your cart is empty</h1>
        <p className="mt-1 text-sm text-[#57534E]">Add a service to pick a visit time and book.</p>
        <Link href="/#categories" className="mt-5 inline-flex h-11 items-center rounded-lg bg-[#800020] px-5 text-sm font-bold text-white hover:bg-[#5e0017]">
          Browse services
        </Link>
      </div>
    );
  }

  const step = !authenticated ? 1 : !selectedAddress ? 2 : !quote ? 3 : 4;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      {/* ---------- left: steps ---------- */}
      <div className="order-2 space-y-5 lg:order-1">
        <ol className="overflow-hidden rounded-xl border border-[#E8E1DB] bg-white">
          <StepRow icon={Smartphone} title="Booking updates to" done={Boolean(authenticated)}>
            {authenticated ? (
              <p className="text-sm text-[#57534E]">{phone || "Your verified number"}</p>
            ) : (
              <>
                <p className="text-sm text-[#57534E]">Verify your mobile number to continue.</p>
                <button type="button" onClick={() => setOtpOpen(true)} className="mt-3 h-11 w-full rounded-lg bg-[#800020] text-sm font-bold text-white hover:bg-[#5e0017]">
                  Continue with mobile number
                </button>
              </>
            )}
          </StepRow>

          <StepRow
            icon={Home}
            title="Visit address"
            muted={step < 2}
            done={Boolean(selectedAddress)}
            action={selectedAddress ? <SmallButton onClick={() => setAddressOpen(true)}>Change</SmallButton> : null}
          >
            {selectedAddress ? (
              <p className="text-sm text-[#57534E]">
                <span className="font-semibold text-[#1C1917]">{selectedAddress.label}</span> · {addressLine(selectedAddress)}
              </p>
            ) : step === 2 ? (
              <button type="button" onClick={() => setAddressOpen(true)} className="mt-1 h-11 w-full rounded-lg bg-[#800020] text-sm font-bold text-white hover:bg-[#5e0017]">
                Add visit address
              </button>
            ) : null}
          </StepRow>

          <StepRow
            icon={CalendarClock}
            title="Visit time"
            muted={step < 3}
            done={Boolean(quote && selectedSlot)}
            action={quote && selectedSlot ? <SmallButton onClick={() => setSlotOpen(true)}>Change</SmallButton> : null}
          >
            {quote && selectedSlot ? (
              <p className="text-sm text-[#57534E]">{formatFullSlot(selectedSlot.start_at)}</p>
            ) : step === 3 ? (
              <button type="button" disabled={preparing} onClick={() => setSlotOpen(true)} className="mt-1 h-11 w-full rounded-lg bg-[#800020] text-sm font-bold text-white hover:bg-[#5e0017] disabled:opacity-60">
                {preparing ? "Reserving your time…" : "Choose date & time"}
              </button>
            ) : null}
          </StepRow>

          <StepRow icon={CreditCard} title="Payment" muted={step < 4} last>
            {step === 4 && quote ? (
              <div className="space-y-3">
                <p className="text-sm text-[#57534E]">
                  {quote.payment_policy === "ADVANCE"
                    ? `Pay ${formatRupees(payNow ?? 0)} online now to lock the visit. Pay the remaining ${formatRupees(atVisit ?? 0)} to the professional after the job.`
                    : quote.payment_policy === "PAY_AT_VISIT"
                      ? "Nothing to pay now. Pay the professional after the job."
                      : `Pay ${formatRupees(payNow ?? 0)} online now.`}
                </p>
                {payNote && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{payNote}</p>}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {!payUncertain && (
                    <button type="button" disabled={paying} onClick={() => void confirmAndPay()}
                      className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-[#800020] px-5 text-sm font-bold text-white hover:bg-[#5e0017] disabled:opacity-60">
                      <Check size={16} />
                      {paying ? "Please wait…" : quote.payment_policy === "PAY_AT_VISIT" ? "Confirm booking" : `Pay ${formatRupees(payNow ?? 0)} & book`}
                    </button>
                  )}
                  {pending && (
                    <button type="button" disabled={paying} onClick={() => void refreshStatus()}
                      className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-[#D6CEC6] bg-white px-5 text-sm font-bold text-[#1C1917] hover:border-[#800020] disabled:opacity-60">
                      <RefreshCw size={15} /> Check payment status
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </StepRow>
        </ol>

        {message && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">{message}</p>}

        <section className="rounded-xl border border-[#E8E1DB] bg-white p-5">
          <h2 className="text-base font-bold text-[#1C1917]">Cancellation &amp; reschedule</h2>
          <p className="mt-1 text-sm text-[#57534E]">
            Change or cancel free of charge before the cut-off shown on your booking. If we can&apos;t serve you, you get your money back.
          </p>
          <Link href="/cancellation-policy" className="mt-2 inline-block text-sm font-bold text-[#800020] underline underline-offset-2">
            Read the policy
          </Link>
        </section>
      </div>

      {/* ---------- right: cart and bill ---------- */}
      <aside className="order-1 space-y-4 lg:sticky lg:top-24 lg:order-2">
        <section className="rounded-xl border border-[#E8E1DB] bg-white p-5">
          {groups.map((g) => (
            <div key={g.name} className="border-b border-[#F1ECE7] pb-4 last:border-0 last:pb-0 [&+&]:pt-4">
              <h2 className="text-lg font-bold text-[#1C1917]">{g.name}</h2>
              <ul className="mt-3 space-y-3">
                {g.rows.map((r) => {
                  const unit = getPackageUnitPaise(r.service, r.pkg);
                  const mrp = r.pkg.mrp_paise;
                  return (
                    <li key={r.pkg.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 text-sm text-[#1C1917]">{r.pkg.name}</span>
                      <span className="inline-flex h-8 items-center rounded-lg border border-[#800020]/30 bg-[#FBF4F5] text-[#800020]">
                        <button type="button" aria-label={`One less ${r.pkg.name}`} onClick={() => updateItemQuantity(r.pkg.id, r.quantity - 1)} className="grid h-8 w-8 place-items-center">
                          <Minus size={14} />
                        </button>
                        <span className="min-w-[18px] text-center text-sm font-bold">{r.quantity}</span>
                        <button type="button" aria-label={`One more ${r.pkg.name}`} disabled={r.quantity >= 10} onClick={() => updateItemQuantity(r.pkg.id, r.quantity + 1)} className="grid h-8 w-8 place-items-center disabled:opacity-40">
                          <Plus size={14} />
                        </button>
                      </span>
                      <span className="w-[72px] text-right">
                        <span className="block text-sm font-semibold text-[#1C1917]">{unit != null ? formatRupees(unit * r.quantity) : "On visit"}</span>
                        {mrp != null && unit != null && mrp > unit && (
                          <span className="block text-xs text-[#A8A29E] line-through">{formatRupees(mrp * r.quantity)}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <label htmlFor="pro-note" className="mt-4 block text-xs font-semibold text-[#57534E]">Note for the professional (optional)</label>
          <input id="pro-note" value={problem} maxLength={240} onChange={(e) => setProblem(e.target.value)}
            placeholder="E.g. bedroom AC is not cooling"
            className="mt-1.5 h-11 w-full rounded-lg border border-[#E8E1DB] px-3 text-sm outline-none focus:border-[#800020]" />
        </section>

        <section className="rounded-xl border border-[#E8E1DB] bg-white p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#1C1917]"><Tag size={15} className="text-[#800020]" /> Referral code</h2>
          {!hold ? (
            <p className="mt-1 text-xs text-[#78716C]">Choose a visit time first, then apply a friend&apos;s code. It comes off the online amount.</p>
          ) : quote?.coupon_code ? (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-[#E7F3EC] px-3 py-2 text-xs">
              <span className="font-semibold text-[#1F6B44]">{quote.coupon_code} applied · you save {formatRupees(quote.discount_paise ?? 0)}</span>
              <button type="button" disabled={codeBusy} onClick={() => { setCodeInput(""); void applyCode(""); }} className="font-bold text-[#800020] hover:underline">Remove</button>
            </div>
          ) : (
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (codeInput.trim()) void applyCode(codeInput); }}>
              <label htmlFor="ref-code" className="sr-only">Referral code</label>
              <input id="ref-code" value={codeInput} maxLength={24} autoComplete="off" placeholder="Enter code"
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                aria-invalid={Boolean(codeError)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-[#E8E1DB] px-3 text-sm uppercase outline-none focus:border-[#800020]" />
              <button type="submit" disabled={codeBusy || !codeInput.trim()} className="h-10 rounded-lg bg-[#1C1917] px-4 text-xs font-bold text-white disabled:opacity-50">
                {codeBusy ? "Checking…" : "Apply"}
              </button>
            </form>
          )}
          {codeError && <p role="alert" className="mt-1.5 text-xs font-semibold text-[#B42318]">{codeError}</p>}
        </section>

        <section className="rounded-xl border border-[#E8E1DB] bg-white p-5">
          <h2 className="text-base font-bold text-[#1C1917]">Bill details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {quote ? (
              quote.lines
                .filter((l) => l.amount_paise !== 0)
                .map((l, i) => (
                  <div key={`${l.code}-${l.package_id ?? i}`} className={`flex justify-between gap-3 ${l.amount_paise < 0 ? "font-semibold text-[#1F6B44]" : "text-[#57534E]"}`}>
                    <dt>{l.name || l.code.toLowerCase().replaceAll("_", " ")}{l.quantity && l.quantity > 1 ? ` × ${l.quantity}` : ""}</dt>
                    <dd>{l.amount_paise < 0 ? `−${formatRupees(-l.amount_paise)}` : formatRupees(l.amount_paise)}</dd>
                  </div>
                ))
            ) : (
              <div className="flex justify-between text-[#57534E]">
                <dt>Item total</dt>
                <dd>
                  {mrpTotal > itemTotal && <span className="mr-1.5 text-[#A8A29E] line-through">{formatRupees(mrpTotal)}</span>}
                  {formatRupees(itemTotal)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-dashed border-[#E8E1DB] pt-2 font-bold text-[#1C1917]">
              <dt>Total</dt>
              <dd>{formatRupees(quote ? quote.total_paise : itemTotal)}</dd>
            </div>
            {quote && atVisit != null && atVisit > 0 && (
              <div className="flex justify-between text-[#57534E]">
                <dt>Pay the professional after the job</dt>
                <dd>{formatRupees(atVisit)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex items-baseline justify-between rounded-lg bg-[#FBF4F5] px-4 py-3">
            <span className="text-sm font-bold text-[#1C1917]">{quote ? "Pay online now" : "Estimated total"}</span>
            <span className="text-xl font-bold text-[#800020]">{formatRupees(quote ? payNow ?? 0 : itemTotal)}</span>
          </div>
          {!quote && <p className="mt-2 text-xs text-[#78716C]">The exact amount, and how much is paid online now, shows once you pick a visit time.</p>}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-[#57534E]">
            <ShieldCheck size={14} className="shrink-0 text-[#800020]" /> Verified professionals · 30-day service warranty
          </p>
        </section>
      </aside>

      {addressOpen && (
        <AddressDialog
          addresses={addresses}
          selectedId={selectedAddress?.id ?? null}
          headerLocation={headerLocation}
          onSaved={(saved, isNew) => setAddresses((curr) => (isNew ? [saved, ...curr] : curr.map((a) => (a.id === saved.id ? saved : a))))}
          onClose={() => setAddressOpen(false)}
          onUse={(a) => {
            if (a.id !== selectedAddress?.id) resetBooking();
            setSelectedAddress(a);
            setAddressOpen(false);
          }}
        />
      )}

      {slotOpen && primary && selectedAddress && (
        <SlotDialog
          packageId={primary.pkg.id}
          address={selectedAddress}
          initial={selectedSlot}
          onClose={() => setSlotOpen(false)}
          onConfirm={(slot) => {
            setSlotOpen(false);
            void holdAndQuote(slot, selectedAddress);
          }}
        />
      )}

      <QuickOtpSheet
        open={otpOpen}
        onClose={() => setOtpOpen(false)}
        title="Verify your mobile number"
        subtitle="We'll send booking updates and the visit code to this number."
        onAuthenticated={() => {
          setOtpOpen(false);
          checkSession();
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

function StepRow({ icon: Icon, title, children, action, muted, done, last }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  muted?: boolean;
  done?: boolean;
  last?: boolean;
}) {
  return (
    <li className={`flex gap-4 px-5 py-4 ${last ? "" : "border-b border-[#F1ECE7]"} ${muted ? "opacity-50" : ""}`}>
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${done ? "bg-[#800020] text-white" : "bg-[#F7EEF0] text-[#800020]"}`}>
        {done ? <Check size={16} strokeWidth={2.5} /> : <Icon size={17} strokeWidth={1.75} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold text-[#1C1917]">{title}</h2>
          {action}
        </div>
        {children && <div className="mt-1">{children}</div>}
      </div>
    </li>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E2D9D0] px-3 text-xs font-bold text-[#800020] hover:border-[#800020]">
      <Pencil size={12} /> {children}
    </button>
  );
}

function Dialog({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#F1ECE7] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-[#1C1917]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-[#78716C]">{subtitle}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F3EFEC] text-[#1C1917] hover:bg-[#EAE3DC]">
            <X size={17} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-[#F1ECE7] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---- visit time ---- */

function SlotDialog({ packageId, address, initial, onClose, onConfirm }: {
  packageId: string; address: Address; initial: Slot | null; onClose: () => void; onConfirm: (s: Slot) => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState("");
  const [day, setDay] = useState<string>(initial ? getIstDayKey(initial.start_at) : "");
  const [picked, setPicked] = useState<Slot | null>(initial);

  useEffect(() => {
    let active = true;
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 86400000);
    bookingApi
      .slots(packageId, address.id, start.toISOString(), end.toISOString())
      .then((res) => active && setSlots(res.slots ?? []))
      .catch((err) => {
        if (!active) return;
        setSlots([]);
        setError(err instanceof Error ? err.message : "Could not load visit times.");
      });
    return () => {
      active = false;
    };
  }, [packageId, address.id]);

  const days = useMemo(() => Array.from(new Set((slots ?? []).map((s) => getIstDayKey(s.start_at)))), [slots]);
  const activeDay = day && days.includes(day) ? day : days[0] ?? "";
  const groups = useMemo(() => {
    const list = (slots ?? []).filter((s) => getIstDayKey(s.start_at) === activeDay);
    const g = [
      { key: "m", label: "Morning", icon: Sunrise, items: [] as Slot[] },
      { key: "a", label: "Afternoon", icon: Sun, items: [] as Slot[] },
      { key: "e", label: "Evening", icon: Sunset, items: [] as Slot[] },
    ];
    for (const s of list) {
      const h = getIstHour(s.start_at);
      g[h < 12 ? 0 : h < 17 ? 1 : 2].items.push(s);
    }
    return g.filter((x) => x.items.length > 0);
  }, [slots, activeDay]);

  return (
    <Dialog
      title="Pick a visit time"
      subtitle={`For ${address.locality || address.city}. The professional arrives within the time you pick.`}
      onClose={onClose}
      footer={
        <button type="button" disabled={!picked} onClick={() => picked && onConfirm(picked)}
          className="h-12 w-full rounded-lg bg-[#800020] text-sm font-bold text-white hover:bg-[#5e0017] disabled:opacity-45">
          {picked ? `Confirm ${formatFullSlot(picked.start_at)}` : "Select a time"}
        </button>
      }
    >
      {slots === null ? (
        <div className="space-y-3" aria-label="Loading visit times">
          <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <span key={i} className="ui-skeleton h-[68px] w-16 rounded-xl" />)}</div>
          <div className="grid grid-cols-3 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="ui-skeleton h-11 rounded-lg" />)}</div>
        </div>
      ) : days.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#D6CEC6] bg-[#FBF8F5] p-4 text-sm text-[#57534E]">
          {error || "No visit times are open for this address this week. Please try another address or check back soon."}
        </p>
      ) : (
        <>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#78716C]">Day</h3>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Day">
            {days.map((d) => {
              const p = dayParts(d);
              const on = d === activeDay;
              return (
                <button key={d} type="button" role="radio" aria-checked={on}
                  onClick={() => { setDay(d); setPicked(null); }}
                  className={`flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 transition ${on ? "border-[#800020] bg-[#800020] text-white" : "border-[#E8E1DB] bg-white text-[#1C1917] hover:border-[#800020]"}`}>
                  <span className={`text-[11px] font-semibold ${on ? "text-white/85" : "text-[#78716C]"}`}>{p.top}</span>
                  <span className="text-lg font-bold leading-tight">{p.date}</span>
                  <span className={`text-[10px] ${on ? "text-white/80" : "text-[#A8A29E]"}`}>{p.month}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-4">
            {groups.map(({ key, label, icon: Icon, items }) => (
              <div key={key}>
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#78716C]">
                  <Icon size={14} className="text-[#800020]" /> {label}
                </h3>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={`${label} times`}>
                  {items.map((s) => {
                    const full = s.remaining <= 0;
                    const on = picked?.id === s.id;
                    return (
                      <button key={s.id} type="button" role="radio" aria-checked={on} disabled={full}
                        onClick={() => setPicked(s)}
                        className={`h-11 rounded-lg border text-sm font-semibold transition ${
                          full ? "cursor-not-allowed border-transparent bg-stone-100 text-stone-400 line-through"
                            : on ? "border-[#800020] bg-[#FBF4F5] text-[#800020] ring-1 ring-[#800020]"
                              : "border-[#E8E1DB] bg-white text-[#1C1917] hover:border-[#800020]"}`}>
                        {formatSlotTime(s.start_at)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}

/* ---- address ---- */

function AddressDialog({ addresses, selectedId, headerLocation, onSaved, onUse, onClose }: {
  addresses: Address[];
  selectedId: string | null;
  headerLocation: ReturnType<typeof useServiceLocation>["location"];
  onSaved: (a: Address, isNew: boolean) => void;
  onUse: (a: Address) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(selectedId ?? addresses[0]?.id ?? null);
  const [formOpen, setFormOpen] = useState(addresses.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormAddress>(() => ({
    ...EMPTY_ADDRESS,
    house_flat: headerLocation?.house_flat || "",
    street: headerLocation?.street || "",
    locality: headerLocation?.locality || "",
    city: headerLocation?.city || "",
    state: headerLocation?.state || EMPTY_ADDRESS.state,
    postal_code: headerLocation?.postal_code || "",
    latitude: headerLocation?.latitude ?? null,
    longitude: headerLocation?.longitude ?? null,
  }));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const set = (k: keyof FormAddress) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function picked(p: PickedLocationResult) {
    setForm((f) => ({
      ...f,
      house_flat: p.house_flat || f.house_flat,
      street: p.street || f.street,
      locality: p.locality || f.locality,
      city: p.city || f.city,
      state: p.state || f.state,
      postal_code: p.postal_code || f.postal_code,
      latitude: p.latitude,
      longitude: p.longitude,
    }));
    setNote(p.serviceability && !p.serviceability.supported ? `We don't serve ${p.locality || p.city} yet.` : "");
  }

  function edit(a: Address) {
    setEditingId(a.id);
    setFormOpen(true);
    setForm({
      label: a.label || "Home", contact_name: a.contact_name || "", contact_phone: a.contact_phone || "",
      house_flat: a.house_flat || "", street: a.street || "", locality: a.locality || "", city: a.city || "",
      state: a.state || "Tamil Nadu", postal_code: a.postal_code || "", landmark: a.landmark || "",
      latitude: a.latitude ?? null, longitude: a.longitude ?? null, is_default: a.is_default,
    });
  }

  async function save() {
    if (!/^\d{6}$/.test(form.postal_code)) return setNote("Enter a valid 6-digit PIN code.");
    if (!form.contact_name.trim() || !form.house_flat.trim() || !form.street.trim() || !form.locality.trim() || !form.city.trim()) {
      return setNote("Fill in name, house/flat, street, area and city.");
    }
    setBusy(true);
    setNote("");
    try {
      const saved = editingId ? await bookingApi.updateAddress(editingId, form) : await bookingApi.createAddress(form);
      onSaved(saved, !editingId);
      onUse(saved);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not save the address.");
    } finally {
      setBusy(false);
    }
  }

  const chosenAddress = addresses.find((a) => a.id === chosen) ?? null;
  const field = "h-11 rounded-lg border border-[#E2D9D0] bg-white px-3 text-sm outline-none focus:border-[#800020]";

  return (
    <Dialog
      title={formOpen ? (editingId ? "Edit address" : "Add a new address") : "Where should we come?"}
      onClose={onClose}
      footer={
        formOpen ? (
          <div className="flex gap-2">
            {addresses.length > 0 && (
              <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); setNote(""); }}
                className="h-12 rounded-lg border border-[#E2D9D0] px-5 text-sm font-bold text-[#1C1917]">Back</button>
            )}
            <button type="button" disabled={busy} onClick={() => void save()}
              className="h-12 flex-1 rounded-lg bg-[#800020] text-sm font-bold text-white hover:bg-[#5e0017] disabled:opacity-60">
              {busy ? "Saving…" : "Save and use this address"}
            </button>
          </div>
        ) : (
          <button type="button" disabled={!chosenAddress} onClick={() => chosenAddress && onUse(chosenAddress)}
            className="h-12 w-full rounded-lg bg-[#800020] text-sm font-bold text-white hover:bg-[#5e0017] disabled:opacity-45">
            Use this address
          </button>
        )
      }
    >
      {note && <p role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{note}</p>}
      {formOpen ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            {["Home", "Work", "Other"].map((l) => (
              <button key={l} type="button" onClick={() => setForm((f) => ({ ...f, label: l }))}
                className={`h-9 rounded-full px-4 text-xs font-bold ${form.label === l ? "bg-[#800020] text-white" : "border border-[#E2D9D0] text-[#1C1917]"}`}>{l}</button>
            ))}
          </div>
          <GoogleMapsLocationPicker
            key={editingId ?? "new"}
            checkServiceability
            initialQuery={editingId ? [form.street, form.locality, form.city, form.postal_code].filter(Boolean).join(", ") : ""}
            onLocationSelected={picked}
          />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <input aria-label="Contact name" placeholder="Contact name *" value={form.contact_name} onChange={set("contact_name")} className={field} />
            <input aria-label="House or flat number" placeholder="House / flat no. *" value={form.house_flat} onChange={set("house_flat")} className={field} />
            <input aria-label="Street or building" placeholder="Street / building *" value={form.street} onChange={set("street")} className={field} />
            <input aria-label="Area" placeholder="Area / locality *" value={form.locality} onChange={set("locality")} className={field} />
            <input aria-label="City" placeholder="City *" value={form.city} onChange={set("city")} className={field} />
            <input aria-label="PIN code" placeholder="PIN code *" inputMode="numeric" maxLength={6} value={form.postal_code}
              onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value.replace(/\D/g, "").slice(0, 6) }))} className={field} />
            <input aria-label="Landmark" placeholder="Landmark (optional)" value={form.landmark} onChange={set("landmark")} className={`${field} sm:col-span-2`} />
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <ul className="space-y-2" role="radiogroup" aria-label="Saved addresses">
            {addresses.map((a) => {
              const on = a.id === chosen;
              return (
                <li key={a.id} className={`flex items-start gap-3 rounded-xl border p-3.5 ${on ? "border-[#800020] bg-[#FBF4F5]" : "border-[#E8E1DB]"}`}>
                  <button type="button" role="radio" aria-checked={on} onClick={() => setChosen(a.id)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-[#800020]" : "border-[#C9BFB6]"}`}>
                      {on && <span className="h-2.5 w-2.5 rounded-full bg-[#800020]" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-bold text-[#1C1917]"><MapPin size={13} className="text-[#800020]" />{a.label}</span>
                      <span className="mt-0.5 block text-xs text-[#57534E]">{addressLine(a)}</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => edit(a)} aria-label={`Edit ${a.label} address`} className="text-xs font-bold text-[#800020] hover:underline">Edit</button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => { setEditingId(null); setFormOpen(true); }}
            className="flex h-12 w-full items-center justify-between rounded-xl border border-dashed border-[#C9BFB6] px-4 text-sm font-bold text-[#800020] hover:border-[#800020]">
            <span className="inline-flex items-center gap-2"><Plus size={16} /> Add a new address</span>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </Dialog>
  );
}
