"use client";

import type { Service, ServicePackage } from "@nammapros/types";
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  MessageCircle,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getPackageUnitPaise, pickDefaultPackage } from "@/components/booking-cart-provider";
import { GoogleMapsLocationPicker, type PickedLocationResult } from "@/components/google-maps-location-picker";
import { useServiceLocation } from "@/components/location-provider";
import { QuickOtpSheet } from "@/components/quick-otp-sheet";
import { ServiceImage } from "@/components/service-image";
import { bookingApi, BookingApiError, type Address, type Booking, type Hold, type Quote, type Slot } from "@/lib/booking-api";
import { serviceHeroImage } from "@/lib/service-images";

const STEPS = ["1. Slot", "2. Address", "3. Confirm"] as const;

type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayWindow = Window & { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } };

function loadRazorpayCheckout() {
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

const EMPTY_ADDRESS: Omit<Address, "id" | "line_1"> = {
  label: "Home",
  contact_name: "",
  contact_phone: "",
  house_flat: "",
  street: "",
  locality: "",
  city: "",
  state: "Tamil Nadu",
  postal_code: "",
  landmark: "",
  latitude: null,
  longitude: null,
  is_default: false,
};

function formatRupees(paise: number) {
  const rupees = paise / 100;
  const hasDecimals = rupees % 1 !== 0;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function getIstDayKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function formatDayChipLabel(dayKey: string) {
  const todayKey = getIstDayKey(new Date().toISOString());
  const tomorrowKey = getIstDayKey(new Date(Date.now() + 86400000).toISOString());
  if (dayKey === todayKey) return "Today";
  if (dayKey === tomorrowKey) return "Tomorrow";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
  }).format(new Date(`${dayKey}T06:00:00+05:30`));
}

function formatSlotTime(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function formatFullSlot(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function getIstHour(iso: string) {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return Number.parseInt(h, 10);
}

function downloadCalendarIcs(booking: Booking) {
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
    `DESCRIPTION:Package: ${booking.package}. Reference: ${booking.reference}.`,
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

export function SlotFirstCheckout({
  services,
  initialService,
  initialPackage,
  initialQuantity = 1,
  initialProblem = "",
  compactSheet = false,
  onCloseSheet,
  onBookingCompleted,
}: {
  services?: Service[];
  initialService?: Service | null;
  initialPackage?: ServicePackage | null;
  initialQuantity?: number;
  initialProblem?: string;
  compactSheet?: boolean;
  onCloseSheet?: () => void;
  onBookingCompleted?: (booking: Booking) => void;
}) {
  const { location: headerLocation } = useServiceLocation();

  const availableServices = useMemo(() => {
    if (services && services.length > 0) return services;
    return initialService ? [initialService] : [];
  }, [services, initialService]);

  const [selectedServiceSlug, setSelectedServiceSlug] = useState(
    initialService?.slug ?? availableServices[0]?.slug ?? ""
  );
  const selectedService = useMemo(
    () => availableServices.find((s) => s.slug === selectedServiceSlug) ?? initialService ?? availableServices[0] ?? null,
    [availableServices, selectedServiceSlug, initialService]
  );

  const [selectedPackageId, setSelectedPackageId] = useState(
    initialPackage?.id ?? (selectedService ? pickDefaultPackage(selectedService)?.id ?? "" : "")
  );
  const selectedPackage = useMemo(() => {
    const pkgs = selectedService?.packages ?? [];
    return pkgs.find((p) => p.id === selectedPackageId) ?? (selectedService ? pickDefaultPackage(selectedService) : null);
  }, [selectedService, selectedPackageId]);

  const [quantity, setQuantity] = useState(Math.max(1, initialQuantity));
  const [problem, setProblem] = useState(initialProblem);

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [otpModalOpen, setOtpModalOpen] = useState(false);

  // Slots state (Step 0)
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Addresses state (Step 1)
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<Address, "id" | "line_1">>(EMPTY_ADDRESS);

  // Hold, Quote, Confirmation (Step 2)
  const [hold, setHold] = useState<Hold | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [paymentPendingNote, setPaymentPendingNote] = useState("");
  const [paymentUncertain, setPaymentUncertain] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const [whatsappSaved, setWhatsappSaved] = useState(false);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    bookingApi
      .me()
      .then(() => {
        if (active) setAuthenticated(true);
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadAddresses = useCallback(async () => {
    try {
      const res = await bookingApi.addresses();
      setAddresses(res.addresses);
      if (res.addresses.length > 0) {
        setSelectedAddress((curr) => curr ?? res.addresses.find((a) => a.is_default) ?? res.addresses[0]);
      } else {
        setShowAddressForm(true);
      }
    } catch {
      // ignore if signed out
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    bookingApi
      .addresses()
      .then((res) => {
        if (!active) return;
        setAddresses(res.addresses);
        if (res.addresses.length > 0) {
          setSelectedAddress((curr) => curr ?? res.addresses.find((a) => a.is_default) ?? res.addresses[0]);
        } else {
          setShowAddressForm(true);
        }
      })
      .catch(() => {
        // ignore if signed out
      });
    return () => {
      active = false;
    };
  }, [authenticated]);

  useEffect(() => {
    if (!headerLocation || editingAddressId) return;
    const t = window.setTimeout(() => {
      setAddressForm((curr) => {
        if (curr.street || curr.locality || curr.city || curr.postal_code) return curr;
        return {
          ...curr,
          house_flat: headerLocation.house_flat || curr.house_flat,
          street: headerLocation.street || curr.street,
          locality: headerLocation.locality || curr.locality,
          city: headerLocation.city || curr.city,
          state: headerLocation.state || curr.state,
          postal_code: headerLocation.postal_code || curr.postal_code,
          latitude: headerLocation.latitude,
          longitude: headerLocation.longitude,
        };
      });
    }, 0);
    return () => window.clearTimeout(t);
  }, [headerLocation, editingAddressId]);

  useEffect(() => {
    if (!selectedPackage) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      if (!active) return;
      setSlotsLoading(true);
      setMessage("");
      try {
        let fetched: Slot[] = [];
        if (authenticated && selectedAddress) {
          const start = new Date();
          const end = new Date(start.getTime() + 14 * 86400000);
          const res = await bookingApi.slots(
            selectedPackage.id,
            selectedAddress.id,
            start.toISOString(),
            end.toISOString()
          );
          fetched = res.slots ?? [];
        } else {
          const res = await bookingApi.publicSlots({
            package_id: selectedPackage.id,
            postal_code: headerLocation?.postal_code || undefined,
            city: headerLocation?.city || undefined,
            include_full: true,
          });
          fetched = res.slots ?? [];
        }
        if (!active) return;
        setSlots(fetched);
        const dayKeys = Array.from(new Set(fetched.map((s) => getIstDayKey(s.start_at))));
        setSelectedDay((prev) => (prev && dayKeys.includes(prev) ? prev : dayKeys[0] ?? ""));
      } catch {
        if (active) setSlots([]);
      } finally {
        if (active) setSlotsLoading(false);
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selectedPackage, authenticated, selectedAddress, headerLocation]);

  const dayChips = useMemo(() => {
    return Array.from(new Set(slots.map((s) => getIstDayKey(s.start_at))));
  }, [slots]);

  const daySlots = useMemo(() => {
    if (!selectedDay) return [];
    return slots.filter((s) => getIstDayKey(s.start_at) === selectedDay);
  }, [slots, selectedDay]);

  const slotGroups = useMemo(() => {
    const morning: Slot[] = [];
    const afternoon: Slot[] = [];
    const evening: Slot[] = [];
    for (const s of daySlots) {
      const hr = getIstHour(s.start_at);
      if (hr < 12) morning.push(s);
      else if (hr < 17) afternoon.push(s);
      else evening.push(s);
    }
    return [
      { key: "morning", label: "Morning", icon: Sunrise, items: morning },
      { key: "afternoon", label: "Afternoon", icon: Sun, items: afternoon },
      { key: "evening", label: "Evening", icon: Sunset, items: evening },
    ].filter((g) => g.items.length > 0);
  }, [daySlots]);

  const unitPaise = selectedService ? getPackageUnitPaise(selectedService, selectedPackage) : null;
  const estimatedTotalPaise = quote ? quote.total_paise : unitPaise != null ? unitPaise * quantity : null;
  const dueNowPaise = quote
    ? quote.payment_policy === "ADVANCE"
      ? quote.advance_paise ?? quote.total_paise
      : quote.payment_policy === "PAY_AT_VISIT"
        ? 0
        : quote.total_paise
    : estimatedTotalPaise;

  async function continueFromSlot() {
    if (!selectedPackage || !selectedSlot || selectedSlot.remaining <= 0) {
      setMessage("Choose an available time slot to continue.");
      return;
    }
    setMessage("");
    if (!authenticated) {
      setOtpModalOpen(true);
      return;
    }
    setStep(1);
    await loadAddresses();
  }

  function applyPickedLocation(picked: PickedLocationResult) {
    setAddressForm((curr) => ({
      ...curr,
      house_flat: picked.house_flat || curr.house_flat,
      street: picked.street || curr.street,
      locality: picked.locality || curr.locality,
      city: picked.city || curr.city,
      state: picked.state || curr.state,
      postal_code: picked.postal_code || curr.postal_code,
      latitude: picked.latitude,
      longitude: picked.longitude,
    }));
    if (picked.serviceability && !picked.serviceability.supported) {
      setMessage(`We’re expanding to ${picked.locality || picked.city} soon — not covered yet.`);
    } else {
      setMessage(`Namma area, namma pros — available in ${picked.locality || picked.city}!`);
    }
  }

  function startEditAddress(item: Address) {
    setEditingAddressId(item.id);
    setShowAddressForm(true);
    setAddressForm({
      label: item.label || "Home",
      contact_name: item.contact_name || "",
      contact_phone: item.contact_phone || "",
      house_flat: item.house_flat || "",
      street: item.street || "",
      locality: item.locality || "",
      city: item.city || "",
      state: item.state || "Tamil Nadu",
      postal_code: item.postal_code || "",
      landmark: item.landmark || "",
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
      is_default: item.is_default,
    });
  }

  async function saveAddressForm() {
    if (!/^\d{6}$/.test(addressForm.postal_code)) {
      setMessage("Enter a valid 6-digit PIN code.");
      return;
    }
    if (
      !addressForm.contact_name.trim() ||
      !addressForm.house_flat.trim() ||
      !addressForm.street.trim() ||
      !addressForm.locality.trim() ||
      !addressForm.city.trim()
    ) {
      setMessage("Please fill house/flat, street, area, city, and contact name.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (editingAddressId) {
        const updated = await bookingApi.updateAddress(editingAddressId, addressForm);
        setAddresses((curr) => curr.map((a) => (a.id === updated.id ? updated : a)));
        setSelectedAddress(updated);
        setEditingAddressId(null);
      } else {
        const created = await bookingApi.createAddress(addressForm);
        setAddresses((curr) => [created, ...curr]);
        setSelectedAddress(created);
      }
      setShowAddressForm(false);
      setAddressForm(EMPTY_ADDRESS);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save address.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareReview(addressOverride?: Address) {
    const addr = addressOverride ?? selectedAddress;
    if (!selectedPackage || !addr || !selectedSlot) {
      setMessage("Please choose or save a service address.");
      return;
    }
    setBusy(true);
    setMessage("Hold on, we’re saving your slot...");
    try {
      const coverage = await bookingApi.serviceability(selectedPackage.id, addr.id);
      if (!coverage.supported) {
        setMessage(coverage.reason ?? "This address is outside our active service zones.");
        setBusy(false);
        return;
      }

      const start = new Date();
      const end = new Date(start.getTime() + 14 * 86400000);
      const liveSlotsRes = await bookingApi.slots(selectedPackage.id, addr.id, start.toISOString(), end.toISOString());
      const matchingSlot =
        liveSlotsRes.slots.find((s) => s.id === selectedSlot.id || s.start_at === selectedSlot.start_at) ??
        liveSlotsRes.slots[0] ??
        selectedSlot;

      if (hold) {
        await bookingApi.release(hold.id).catch(() => {});
      }
      const nextHold = await bookingApi.hold(selectedPackage.id, addr.id, matchingSlot.id);
      setSelectedSlot(matchingSlot);
      setHold(nextHold);
      const nextQuote = await bookingApi.quote(nextHold.id);
      setQuote(nextQuote);
      setIdempotencyKey(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `np-${Date.now()}`);
      setMessage("");
      setStep(2);
    } catch (err) {
      if (err instanceof BookingApiError && (err.status === 401 || err.status === 403)) {
        setAuthenticated(false);
        setOtpModalOpen(true);
        setMessage("");
      } else {
        setMessage(err instanceof Error ? err.message : "Could not hold this slot. Please try another window.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function launchRazorpayForBooking(target: Booking) {
    if (paymentUncertain) return;
    setBusy(true);
    setMessage("");
    setPaymentPendingNote("Opening secure Razorpay checkout...");
    try {
      const order = await bookingApi.paymentOrder(target.id, `order-${target.id}`);
      setPaymentUncertain(true);
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
            await bookingApi.verifyPayment(
              target.id,
              result.razorpay_order_id,
              result.razorpay_payment_id,
              result.razorpay_signature
            );
            const latest = await bookingApi.booking(target.id);
            setConfirmedBooking(latest);
            setPaymentUncertain(Boolean(latest.payment_attempt_unresolved));
            if (latest.status === "CONFIRMED") {
              setPaymentPendingNote("");
              onBookingCompleted?.(latest);
            } else {
              setPaymentPendingNote("Your payment is being verified. Please don't pay again yet.");
            }
          } catch {
            setPaymentPendingNote("Your payment is being verified. Please don't pay again yet.");
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setPaymentPendingNote("Checkout closed. Refresh status before trying payment again.");
          },
        },
      }).open();
    } catch (err) {
      setPaymentUncertain(false);
      setPaymentPendingNote(
        err instanceof Error ? err.message : "Payment checkout could not open right now."
      );
      setBusy(false);
    }
  }

  async function refreshConfirmedStatus() {
    if (!confirmedBooking) return;
    setBusy(true);
    setMessage("");
    try {
      const latest = await bookingApi.booking(confirmedBooking.id);
      setConfirmedBooking(latest);
      setPaymentUncertain(Boolean(latest.payment_attempt_unresolved));
      if (latest.status === "CONFIRMED") {
        setPaymentPendingNote("");
        onBookingCompleted?.(latest);
      }
    } catch (err) {
      setPaymentPendingNote(err instanceof Error ? err.message : "Could not refresh payment status.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmBooking() {
    if (!hold || !quote || !termsAccepted) return;
    setBusy(true);
    setMessage("");
    try {
      // Silently refresh the quote in the background if close to expiry
      let activeQuote = quote;
      if (new Date(quote.expires_at).getTime() - Date.now() < 30000) {
        activeQuote = await bookingApi.quote(hold.id);
        setQuote(activeQuote);
      }
      const key = idempotencyKey || `np-${Date.now()}`;
      const created = await bookingApi.confirm(
        hold.id,
        activeQuote.id,
        activeQuote.total_paise,
        key,
        problem
      );
      setConfirmedBooking(created);
      setPaymentUncertain(Boolean(created.payment_attempt_unresolved));
      if (created.status === "AWAITING_PAYMENT") {
        await launchRazorpayForBooking(created);
        return;
      }
      onBookingCompleted?.(created);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not confirm booking. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleWhatsappUpdates(checked: boolean) {
    setWhatsappOptIn(checked);
    try {
      await bookingApi.saveNotificationPreferences({
        whatsapp_opt_in: checked,
        sms_opt_in: true,
        email_opt_in: true,
      });
      setWhatsappSaved(true);
    } catch {
      // silent non-blocking preference save
    }
  }

  if (confirmedBooking) {
    const awaitingPayment = confirmedBooking.status === "AWAITING_PAYMENT";
    const payNowPaise =
      confirmedBooking.price.advance_paise && confirmedBooking.price.advance_paise > 0
        ? confirmedBooking.price.advance_paise
        : confirmedBooking.price.total_paise;
    const balanceAtVisitPaise = confirmedBooking.price.remaining_balance_paise ?? 0;

    return (
      <div className="space-y-5 p-1">
        {awaitingPayment ? (
          <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 p-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-amber-600 text-white">
              <CreditCard size={26} strokeWidth={1.75} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-amber-800">
              Payment needed to lock slot
            </span>
            <h2 className="mt-1 font-serif text-2xl font-bold text-[#1C1917]">
              Complete your payment ({formatRupees(payNowPaise)})
            </h2>
            {balanceAtVisitPaise > 0 && (
              <p className="mt-1 text-xs font-medium text-[#57534E]">
                Remaining balance of {formatRupees(balanceAtVisitPaise)} is payable at visit.
              </p>
            )}
            <p className="mt-1 text-sm text-[#57534E]">
              Booking ID: <strong className="font-mono text-[#1C1917]">{confirmedBooking.reference}</strong>
            </p>
            {paymentPendingNote && (
              <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold text-amber-900">
                {paymentPendingNote}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
              {!paymentUncertain && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void launchRazorpayForBooking(confirmedBooking)}
                  className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-full bg-[#800020] px-5 text-sm font-bold text-white hover:bg-[#5e0017] disabled:opacity-50"
                >
                  <CreditCard size={16} strokeWidth={1.75} />
                  <span>{busy ? "Processing..." : `Pay ${formatRupees(payNowPaise)} now`}</span>
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshConfirmedStatus()}
                className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-full border border-[#D6CEC6] bg-white px-5 text-sm font-bold text-[#1C1917] hover:border-[#800020] disabled:opacity-50"
              >
                <RefreshCw size={15} strokeWidth={1.75} />
                <span>Refresh payment status</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 p-6 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-600 text-white animate-[popInOnce_.32s_ease-out]">
              <CheckCircle2 size={28} strokeWidth={1.75} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-800">
              Slot locked
            </span>
            <h2 className="mt-1 font-serif text-2xl font-bold text-[#1C1917]">
              You’re booked!
            </h2>
            <p className="mt-1 text-sm text-[#57534E]">
              Booking ID: <strong className="font-mono text-[#1C1917]">{confirmedBooking.reference}</strong>
            </p>
          </div>
        )}

        <div className="rounded-[18px] bg-white p-5 shadow-[0_6px_24px_rgba(28,25,23,0.05)] space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-[#E8E1DB] pb-2.5">
            <span className="text-[#57534E]">Service</span>
            <strong className="text-right text-[#1C1917]">{confirmedBooking.service} · {confirmedBooking.package}</strong>
          </div>
          <div className="flex justify-between gap-4 border-b border-[#E8E1DB] pb-2.5">
            <span className="text-[#57534E]">When</span>
            <strong className="text-right text-[#1C1917]">{formatFullSlot(confirmedBooking.slot.start_at)}</strong>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[#57534E]">Where</span>
            <strong className="text-right text-[#1C1917]">
              {confirmedBooking.address.line_1}, {confirmedBooking.address.locality}
            </strong>
          </div>
        </div>

        {confirmedBooking.technician && (
          <div className="flex items-center gap-3.5 rounded-[18px] bg-white p-4 shadow-[0_6px_24px_rgba(28,25,23,0.05)]">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#f5ebe8] text-[#800020] font-bold">
              <UserRound size={20} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#800020]">Assigned Pro</p>
              <p className="text-sm font-bold text-[#1C1917]">{confirmedBooking.technician.name}</p>
            </div>
          </div>
        )}

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[16px] bg-white p-4 shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
          <span className="flex items-center gap-2.5 text-sm font-medium text-[#1C1917]">
            <MessageCircle size={18} strokeWidth={1.5} className="text-emerald-700" />
            <span>Send slot & pro arrival updates on WhatsApp</span>
          </span>
          <input
            type="checkbox"
            checked={whatsappOptIn}
            onChange={(e) => void toggleWhatsappUpdates(e.target.checked)}
            className="h-5 w-5 accent-[#800020]"
          />
        </label>
        {whatsappSaved && <p className="text-center text-xs font-semibold text-emerald-700">WhatsApp preference saved.</p>}

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={() => downloadCalendarIcs(confirmedBooking)}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full border border-[#D6CEC6] bg-white px-5 text-sm font-bold text-[#1C1917] hover:border-[#800020]"
          >
            <CalendarPlus size={16} strokeWidth={1.5} className="text-[#800020]" />
            <span>Add to calendar</span>
          </button>
          <Link
            href={`/bookings/${confirmedBooking.id}?confirmed=1`}
            onClick={onCloseSheet}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-[#800020] px-5 text-sm font-bold text-white hover:bg-[#5e0017]"
          >
            <span>Track your booking</span>
            <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={compactSheet ? "space-y-5" : "space-y-6"}>
      {/* Thin 3-segment progress bar */}
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {STEPS.map((label, idx) => (
            <button
              key={label}
              type="button"
              disabled={idx > step}
              onClick={() => idx < step && setStep(idx as 0 | 1 | 2)}
              className="text-left disabled:cursor-default"
            >
              <div
                className={`h-1.5 w-full rounded-full transition-colors ${
                  idx <= step ? "bg-[#800020]" : "bg-[#E8E1DB]"
                }`}
              />
              <span
                className={`mt-1.5 block text-xs font-semibold ${
                  idx === step ? "text-[#800020]" : idx < step ? "text-[#1C1917]" : "text-[#57534E]"
                }`}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs font-semibold text-amber-950"
        >
          {message}
        </div>
      )}

      <div className={compactSheet ? "space-y-5" : "grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"}>
        {/* Left Main Workspace */}
        <div className="space-y-5">
          {/* Selected Item Summary Strip */}
          {selectedService && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-white p-4 shadow-[0_6px_24px_rgba(28,25,23,0.05)]">
              <div className="min-w-0 flex-1">
                {availableServices.length > 1 && step === 0 ? (
                  <div className="space-y-2">
                    <label htmlFor="checkout-service-select" className="block text-[11px] font-bold uppercase tracking-wider text-[#57534E]">
                      Service
                    </label>
                    <select
                      id="checkout-service-select"
                      value={selectedService.slug}
                      onChange={(e) => {
                        const next = availableServices.find((s) => s.slug === e.target.value);
                        setSelectedServiceSlug(e.target.value);
                        setSelectedPackageId(next ? pickDefaultPackage(next)?.id ?? "" : "");
                        setSelectedSlot(null);
                      }}
                      className="min-h-[44px] w-full rounded-xl border border-[#E8E1DB] bg-[#FBF8F5] px-3 text-sm font-semibold text-[#1C1917]"
                    >
                      {availableServices.map((s) => (
                        <option key={s.id} value={s.slug}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <p className="font-serif text-lg font-bold text-[#1C1917]">{selectedService.name}</p>
                    <p className="text-xs text-[#57534E]">
                      {selectedPackage?.name} · {selectedPackage?.duration_minutes ?? 60} min
                    </p>
                  </>
                )}

                {selectedService.packages && selectedService.packages.length > 1 && step === 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {selectedService.packages.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPackageId(p.id);
                          setSelectedSlot(null);
                        }}
                        className={`min-h-[38px] rounded-full px-3.5 text-xs font-semibold transition ${
                          selectedPackage?.id === p.id
                            ? "bg-[#800020] text-white"
                            : "bg-[#F4EFE9] text-[#1C1917] hover:bg-[#e9dfd6]"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="inline-flex items-center rounded-full border border-[#E8E1DB] bg-[#FBF8F5]">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1 || step > 0}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="grid h-10 w-9 place-items-center text-[#800020] disabled:opacity-40"
                  >
                    <Minus size={14} strokeWidth={1.5} />
                  </button>
                  <span className="min-w-[20px] text-center text-xs font-bold text-[#1C1917]">{quantity}</span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={quantity >= 10 || step > 0}
                    onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                    className="grid h-10 w-9 place-items-center text-[#800020] disabled:opacity-40"
                  >
                    <Plus size={14} strokeWidth={1.5} />
                  </button>
                </div>
                {unitPaise != null && (
                  <strong className="text-sm font-bold text-[#1C1917]">{formatRupees(unitPaise * quantity)}</strong>
                )}
              </div>
            </div>
          )}

          {/* STEP 0: SLOT FIRST */}
          {step === 0 && (
            <section className="space-y-5 rounded-[20px] bg-white p-5 shadow-[0_6px_24px_rgba(28,25,23,0.05)]">
              <div>
                <h2 className="font-serif text-xl font-bold text-[#1C1917]">When should our pro visit?</h2>
                <p className="mt-1 text-xs text-[#57534E]">
                  Pro arrives in your chosen slot.{" "}
                  {headerLocation?.city ? `Showing slots for ${headerLocation.locality || headerLocation.city}.` : "Choose a convenient day and window."}
                </p>
              </div>

              {slotsLoading ? (
                <div className="space-y-3" aria-label="Loading slots">
                  <div className="flex gap-2">
                    <span className="ui-skeleton h-11 w-24 rounded-full" />
                    <span className="ui-skeleton h-11 w-24 rounded-full" />
                    <span className="ui-skeleton h-11 w-24 rounded-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <span className="ui-skeleton h-12 rounded-xl" />
                    <span className="ui-skeleton h-12 rounded-xl" />
                    <span className="ui-skeleton h-12 rounded-xl" />
                  </div>
                </div>
              ) : dayChips.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D6CEC6] bg-[#FBF8F5] p-5 text-sm text-[#57534E]">
                  <p className="font-semibold text-[#1C1917]">No open visit windows found yet for this selection.</p>
                  <p className="mt-1 text-xs">
                    Try another day after choosing your address, or pick another package.
                  </p>
                  {!authenticated && (
                    <button
                      type="button"
                      onClick={() => setOtpModalOpen(true)}
                      className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#800020] px-4 text-xs font-bold text-white"
                    >
                      Check with your saved address <ArrowRight size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Day chips */}
                  <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Choose date">
                    {dayChips.map((day) => {
                      const active = selectedDay === day;
                      return (
                        <button
                          key={day}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => {
                            setSelectedDay(day);
                            setSelectedSlot(null);
                          }}
                          className={`min-h-[48px] shrink-0 rounded-full px-4 text-xs font-bold transition ${
                            active
                              ? "bg-[#800020] text-white shadow-sm"
                              : "bg-[#F4EFE9] text-[#1C1917] hover:bg-[#eae2d9]"
                          }`}
                        >
                          {formatDayChipLabel(day)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Morning / Afternoon / Evening windows */}
                  <div className="space-y-4">
                    {slotGroups.map(({ key, label, icon: Icon, items }) => (
                      <div key={key}>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#57534E]">
                          <Icon size={14} strokeWidth={1.5} className="text-[#800020]" />
                          <span>{label}</span>
                        </p>
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                          {items.map((slot) => {
                            const full = slot.remaining <= 0;
                            const chosen = selectedSlot?.id === slot.id;
                            return (
                              <button
                                key={slot.id}
                                type="button"
                                disabled={full}
                                aria-pressed={chosen}
                                onClick={() => setSelectedSlot(slot)}
                                className={`min-h-[48px] rounded-2xl px-3 py-2.5 text-center text-xs font-bold transition ${
                                  full
                                    ? "bg-stone-100 text-stone-400 line-through cursor-not-allowed"
                                    : chosen
                                      ? "bg-[#800020] text-white shadow-sm ring-2 ring-[#800020]/25"
                                      : "border border-[#E8E1DB] bg-[#FBF8F5] text-[#1C1917] hover:border-[#800020]"
                                }`}
                              >
                                <span className="block">{formatSlotTime(slot.start_at)}</span>
                                <span className={`block text-[10px] font-medium ${chosen ? "text-white/85" : "text-[#57534E]"}`}>
                                  {full ? "Full" : `${slot.remaining} left`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div>
                <label htmlFor="booking-problem-note" className="mb-1.5 block text-xs font-semibold text-[#57534E]">
                  Quick note for your pro (optional)
                </label>
                <input
                  id="booking-problem-note"
                  type="text"
                  maxLength={240}
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  placeholder="E.g. Bedroom split AC not cooling well"
                  className="min-h-[48px] w-full rounded-2xl border border-[#E8E1DB] bg-[#FBF8F5] px-4 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
                />
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  disabled={!selectedSlot || busy}
                  onClick={() => void continueFromSlot()}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#800020] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#5e0017] disabled:opacity-45"
                >
                  <span>Continue to address</span>
                  <ArrowRight size={16} strokeWidth={1.5} />
                </button>
              </div>
            </section>
          )}

          {/* STEP 1: ADDRESS */}
          {step === 1 && (
            <section className="space-y-5 rounded-[20px] bg-white p-5 shadow-[0_6px_24px_rgba(28,25,23,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#1C1917]">Where should we visit?</h2>
                  <p className="mt-1 text-xs text-[#57534E]">Choose a saved home address or pin a new location.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="inline-flex min-h-[44px] items-center gap-1 text-xs font-bold text-[#800020]"
                >
                  <ArrowLeft size={14} strokeWidth={1.5} /> Change slot
                </button>
              </div>

              {addresses.length > 0 && (
                <div className="space-y-2.5" role="group" aria-label="Saved addresses">
                  {addresses.map((item) => {
                    const active = selectedAddress?.id === item.id;
                    return (
                      <div key={item.id} className="flex items-stretch gap-2">
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedAddress(item)}
                          className={`flex-1 rounded-2xl border p-3.5 text-left text-xs transition min-h-[48px] ${
                            active
                              ? "border-[#800020] bg-[#f5ebe8] text-[#1C1917]"
                              : "border-[#E8E1DB] bg-[#FBF8F5] text-[#1C1917] hover:border-[#800020]/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#800020]">
                              {item.label}
                            </span>
                            {item.is_default && <span className="text-[10px] text-[#57534E]">Default</span>}
                          </div>
                          <p className="mt-1.5 font-medium">
                            {item.line_1}, {item.locality}, {item.city} {item.postal_code}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditAddress(item)}
                          aria-label={`Edit ${item.label} address`}
                          className="inline-flex min-h-[48px] items-center gap-1 rounded-2xl border border-[#E8E1DB] bg-white px-3 text-xs font-bold text-[#800020] hover:bg-[#f5ebe8]"
                        >
                          <Pencil size={13} strokeWidth={1.5} /> Edit
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {!showAddressForm ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAddressId(null);
                    setAddressForm(EMPTY_ADDRESS);
                    setShowAddressForm(true);
                  }}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#CBBFBB] bg-[#FBF8F5] text-xs font-bold text-[#800020] hover:border-[#800020]"
                >
                  <Plus size={15} strokeWidth={1.5} /> Add a new address
                </button>
              ) : (
                <div className="space-y-4 rounded-2xl border border-[#E8E1DB] bg-[#FBF8F5] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#1C1917]">
                      {editingAddressId ? "Update saved address" : "Add service address"}
                    </h3>
                    {addresses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddressForm(false);
                          setEditingAddressId(null);
                        }}
                        className="text-xs font-bold text-[#57534E] hover:text-[#1C1917]"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {/* Home / Work / Other labels */}
                  <div className="flex flex-wrap gap-2">
                    {["Home", "Work", "Other"].map((lbl) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => setAddressForm((f) => ({ ...f, label: lbl }))}
                        className={`min-h-[40px] rounded-full px-4 text-xs font-bold transition ${
                          addressForm.label === lbl
                            ? "bg-[#800020] text-white"
                            : "border border-[#E8E1DB] bg-white text-[#1C1917]"
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  <GoogleMapsLocationPicker
                    key={editingAddressId ?? "checkout-add-addr"}
                    checkServiceability={true}
                    initialQuery={
                      editingAddressId
                        ? [addressForm.street, addressForm.locality, addressForm.city, addressForm.postal_code].filter(Boolean).join(", ")
                        : ""
                    }
                    onLocationSelected={applyPickedLocation}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      placeholder="Contact name *"
                      value={addressForm.contact_name}
                      onChange={(e) => setAddressForm((f) => ({ ...f, contact_name: e.target.value }))}
                      className="min-h-[46px] rounded-xl border border-[#D6CEC6] bg-white px-3.5 text-sm"
                    />
                    <input
                      placeholder="House / Flat No. *"
                      value={addressForm.house_flat}
                      onChange={(e) => setAddressForm((f) => ({ ...f, house_flat: e.target.value }))}
                      className="min-h-[46px] rounded-xl border border-[#D6CEC6] bg-white px-3.5 text-sm"
                    />
                    <input
                      placeholder="Street / Building *"
                      value={addressForm.street}
                      onChange={(e) => setAddressForm((f) => ({ ...f, street: e.target.value }))}
                      className="min-h-[46px] rounded-xl border border-[#D6CEC6] bg-white px-3.5 text-sm"
                    />
                    <input
                      placeholder="Area / Locality *"
                      value={addressForm.locality}
                      onChange={(e) => setAddressForm((f) => ({ ...f, locality: e.target.value }))}
                      className="min-h-[46px] rounded-xl border border-[#D6CEC6] bg-white px-3.5 text-sm"
                    />
                    <input
                      placeholder="City *"
                      value={addressForm.city}
                      onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))}
                      className="min-h-[46px] rounded-xl border border-[#D6CEC6] bg-white px-3.5 text-sm"
                    />
                    <input
                      placeholder="6-digit PIN code *"
                      maxLength={6}
                      value={addressForm.postal_code}
                      onChange={(e) => setAddressForm((f) => ({ ...f, postal_code: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                      className="min-h-[46px] rounded-xl border border-[#D6CEC6] bg-white px-3.5 text-sm"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveAddressForm()}
                    className="min-h-[46px] rounded-full bg-[#1C1917] px-5 text-xs font-bold text-white hover:bg-black disabled:opacity-50"
                  >
                    {busy ? "Saving..." : editingAddressId ? "Save updated address" : "Save address"}
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={!selectedAddress || busy}
                onClick={() => void prepareReview()}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#800020] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#5e0017] disabled:opacity-45"
              >
                <span>{busy ? "Hold on, saving your slot..." : "Continue to review"}</span>
                <ArrowRight size={16} strokeWidth={1.5} />
              </button>
            </section>
          )}

          {/* STEP 2: CONFIRM & PAY */}
          {step === 2 && quote && selectedSlot && selectedAddress && (
            <section className="space-y-5 rounded-[20px] bg-white p-5 shadow-[0_6px_24px_rgba(28,25,23,0.05)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#1C1917]">Review & confirm</h2>
                  <p className="mt-1 text-xs text-[#57534E]">Pro arrives in your chosen slot. No hidden fees.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex min-h-[44px] items-center gap-1 text-xs font-bold text-[#800020]"
                >
                  <ArrowLeft size={14} strokeWidth={1.5} /> Edit
                </button>
              </div>

              <div className="space-y-3 rounded-2xl bg-[#FBF8F5] p-4 text-sm">
                <div className="flex items-start justify-between gap-3 border-b border-[#E8E1DB] pb-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#57534E]">
                    <Sparkles size={14} strokeWidth={1.5} className="text-[#800020]" /> Service
                  </span>
                  <div className="text-right">
                    <p className="font-bold text-[#1C1917]">{selectedService?.name}</p>
                    <p className="text-xs text-[#57534E]">{selectedPackage?.name} × {quantity}</p>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-3 border-b border-[#E8E1DB] pb-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#57534E]">
                    <Clock size={14} strokeWidth={1.5} className="text-[#800020]" /> When
                  </span>
                  <p className="text-right font-bold text-[#1C1917]">{formatFullSlot(selectedSlot.start_at)}</p>
                </div>

                <div className="flex items-start justify-between gap-3 border-b border-[#E8E1DB] pb-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#57534E]">
                    <MapPin size={14} strokeWidth={1.5} className="text-[#800020]" /> Where
                  </span>
                  <p className="text-right text-xs font-semibold text-[#1C1917]">
                    {selectedAddress.label} · {selectedAddress.line_1}, {selectedAddress.locality}, {selectedAddress.city}{" "}
                    {selectedAddress.postal_code}
                  </p>
                </div>

                <div className="space-y-1.5 pt-1 text-xs">
                  {quote.lines
                    .filter((l) => l.amount_paise > 0)
                    .map((line) => (
                      <div key={line.code} className="flex justify-between text-[#57534E]">
                        <span className="capitalize">{line.code.toLowerCase().replaceAll("_", " ")}</span>
                        <span>{formatRupees(line.amount_paise)}</span>
                      </div>
                    ))}
                  <div className="flex items-baseline justify-between pt-2 text-sm font-bold text-[#1C1917]">
                    <span>
                      {quote.payment_policy === "PAY_AT_VISIT" ? "To pay at visit" : "To pay now"}
                    </span>
                    <span className="text-base text-[#800020]">
                      {quote.payment_policy === "ADVANCE"
                        ? `${formatRupees(quote.advance_paise ?? quote.total_paise)} · ${formatRupees(quote.remaining_balance_paise ?? 0)} at visit`
                        : formatRupees(quote.total_paise)}
                    </span>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-xs text-[#57534E]">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#800020]"
                />
                <span>I confirm this visit slot and transparent NammaPros pricing terms.</span>
              </label>

              <button
                type="button"
                disabled={busy || !termsAccepted}
                onClick={() => void handleConfirmBooking()}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-[#800020] px-6 text-sm font-bold text-white shadow-md transition hover:bg-[#5e0017] disabled:opacity-45"
              >
                <Check size={16} strokeWidth={2} />
                <span>
                  {busy
                    ? "Confirming..."
                    : quote.payment_policy === "PAY_AT_VISIT"
                      ? "Confirm booking"
                      : `Confirm & pay ${formatRupees(dueNowPaise ?? 0)}`}
                </span>
              </button>
            </section>
          )}
        </div>

        {/* Desktop Running Price Summary Sidebar */}
        {!compactSheet && (
          <aside className="rounded-[20px] bg-white p-5 shadow-[0_10px_30px_rgba(28,25,23,0.06)] lg:sticky lg:top-6 space-y-4">
            {selectedService && serviceHeroImage(selectedService) && (
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
                <ServiceImage src={serviceHeroImage(selectedService)} alt={selectedService.name} />
              </div>
            )}
            <h3 className="font-serif text-lg font-bold text-[#1C1917]">Booking summary</h3>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-[#57534E]">Service</dt>
                <dd className="text-right font-bold text-[#1C1917]">{selectedService?.name ?? "Choose service"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#57534E]">Package</dt>
                <dd className="text-right font-semibold text-[#1C1917]">{selectedPackage?.name ?? "Select option"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#57534E]">When</dt>
                <dd className="text-right font-semibold text-[#1C1917]">
                  {selectedSlot ? formatFullSlot(selectedSlot.start_at) : "Pick a slot"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[#57534E]">Where</dt>
                <dd className="text-right font-semibold text-[#1C1917]">
                  {selectedAddress ? `${selectedAddress.locality}, ${selectedAddress.city}` : headerLocation?.locality || "Add address"}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-[#E8E1DB] pt-2.5 text-sm">
                <dt className="font-bold text-[#1C1917]">
                  {quote?.payment_policy === "ADVANCE" ? "To pay now" : "Total"}
                </dt>
                <dd className="font-bold text-[#800020]">
                  {dueNowPaise != null ? formatRupees(dueNowPaise) : "Shared at confirmation"}
                </dd>
              </div>
            </dl>
            <p className="flex items-center gap-1.5 rounded-xl bg-[#F4EFE9] px-3 py-2 text-[11px] font-medium text-[#57534E]">
              <ShieldCheck size={14} strokeWidth={1.5} className="shrink-0 text-[#800020]" />
              <span>30-day service warranty · Verified pros</span>
            </p>
          </aside>
        )}
      </div>

      <QuickOtpSheet
        open={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        onAuthenticated={() => {
          setOtpModalOpen(false);
          setAuthenticated(true);
          setStep(1);
          void loadAddresses();
        }}
      />
    </div>
  );
}
