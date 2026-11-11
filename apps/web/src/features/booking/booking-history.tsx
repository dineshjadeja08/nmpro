"use client";

import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  KeyRound,
  MapPin,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomerHubHeader } from "@/components/customer-hub-header";
import { QuickOtpSheet } from "@/components/quick-otp-sheet";
import { bookingApi, type Booking } from "@/lib/booking-api";
import { formatInr } from "@/lib/services";

type FilterTab = "ALL" | "UPCOMING" | "PAYMENT" | "COMPLETED" | "CANCELLED";

const UPCOMING_STATUSES = new Set([
  "REQUESTED",
  "CONFIRMED",
  "CONFIRMED_UNPAID",
  "TECHNICIAN_ASSIGNED",
  "TECHNICIAN_EN_ROUTE",
  "TECHNICIAN_ARRIVED",
  "IN_PROGRESS",
]);

const PAYMENT_STATUSES = new Set(["DRAFT", "AWAITING_PAYMENT", "PENDING_PAYMENT", "PAYMENT_FAILED"]);
const COMPLETED_STATUSES = new Set(["COMPLETED", "SERVICE_COMPLETED", "CLOSED"]);
const CANCELLED_STATUSES = new Set(["CANCELLED", "EXPIRED"]);

function formatSlotDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getStatusMeta(status: string): {
  label: string;
  badgeClass: string;
  accentBorderClass: string;
} {
  if (PAYMENT_STATUSES.has(status)) {
    return {
      label: status === "PAYMENT_FAILED" ? "Payment retry needed" : "Awaiting payment",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-900",
      accentBorderClass: "border-l-amber-500",
    };
  }
  if (COMPLETED_STATUSES.has(status)) {
    return {
      label: "Completed",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
      accentBorderClass: "border-l-emerald-600",
    };
  }
  if (CANCELLED_STATUSES.has(status)) {
    return {
      label: status === "EXPIRED" ? "Expired" : "Cancelled",
      badgeClass: "border-[#E2D9D0] bg-[#F4EFE9] text-[#57534E]",
      accentBorderClass: "border-l-[#D6CEC6]",
    };
  }
  if (status === "TECHNICIAN_EN_ROUTE") {
    return {
      label: "Pro on the way",
      badgeClass: "border-[#800020]/30 bg-[#FBECEF] text-[#800020]",
      accentBorderClass: "border-l-[#800020]",
    };
  }
  if (status === "TECHNICIAN_ARRIVED" || status === "IN_PROGRESS") {
    return {
      label: "Visit in progress",
      badgeClass: "border-[#800020]/30 bg-[#FBECEF] text-[#800020]",
      accentBorderClass: "border-l-[#800020]",
    };
  }
  if (status === "TECHNICIAN_ASSIGNED") {
    return {
      label: "Pro assigned",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
      accentBorderClass: "border-l-[#800020]",
    };
  }
  return {
    label: status === "REQUESTED" ? "Requested" : "Confirmed",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
    accentBorderClass: "border-l-[#800020]",
  };
}

function matchesTab(booking: Booking, tab: FilterTab): boolean {
  if (tab === "ALL") return true;
  if (tab === "UPCOMING") return UPCOMING_STATUSES.has(booking.status);
  if (tab === "PAYMENT") return PAYMENT_STATUSES.has(booking.status);
  if (tab === "COMPLETED") return COMPLETED_STATUSES.has(booking.status);
  if (tab === "CANCELLED") return CANCELLED_STATUSES.has(booking.status);
  return true;
}

export function BookingHistory() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [tab, setTab] = useState<FilterTab>("ALL");
  const [query, setQuery] = useState("");
  const [showOtpSheet, setShowOtpSheet] = useState(false);

  const reloadBookings = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError("");
    try {
      const result = await bookingApi.bookings(targetPage);
      setBookings(result.results);
      setCount(result.count);
    } catch {
      setError("Sign in to view your upcoming and past service bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    bookingApi
      .bookings(page)
      .then((result) => {
        if (!active) return;
        setBookings(result.results);
        setCount(result.count);
        setError("");
      })
      .catch(() => {
        if (active) setError("Sign in to view your upcoming and past service bookings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const onAuthChanged = () => {
      if (active) void reloadBookings(1);
    };
    window.addEventListener("nammapros:auth-changed", onAuthChanged);
    return () => {
      active = false;
      window.removeEventListener("nammapros:auth-changed", onAuthChanged);
    };
  }, [page, reloadBookings]);

  const tabCounts = useMemo(
    () => ({
      ALL: bookings.length,
      UPCOMING: bookings.filter((b) => UPCOMING_STATUSES.has(b.status)).length,
      PAYMENT: bookings.filter((b) => PAYMENT_STATUSES.has(b.status)).length,
      COMPLETED: bookings.filter((b) => COMPLETED_STATUSES.has(b.status)).length,
      CANCELLED: bookings.filter((b) => CANCELLED_STATUSES.has(b.status)).length,
    }),
    [bookings]
  );

  const filteredBookings = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter((item) => {
      if (!matchesTab(item, tab)) return false;
      if (!q) return true;
      const itemServices = item.items?.map((entry) => entry.service).join(" ") ?? "";
      return (
        item.service.toLowerCase().includes(q) ||
        itemServices.toLowerCase().includes(q) ||
        item.reference.toLowerCase().includes(q) ||
        (item.address?.locality ?? "").toLowerCase().includes(q)
      );
    });
  }, [bookings, tab, query]);

  const totalPages = Math.max(1, Math.ceil(count / 20));

  return (
    <main className="min-h-[75vh] bg-[#FBF8F5] pb-14">
      <CustomerHubHeader
        activeTab="bookings"
        crumb="My Bookings"
        badge="Visit History & Live Tracker"
        title="My Bookings"
        subtitle="Check scheduled visit slots, technician assignments, digital quotes, and 30-day warranty status."
        actions={
          <Link
            href="/book"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#800020] px-4 text-xs font-bold text-white shadow-xs transition hover:bg-[#5e0017]"
          >
            <Plus size={14} />
            <span>Book a service</span>
          </Link>
        }
      />

      <div className="container max-w-5xl space-y-6 pt-6 sm:pt-8">
        {loading ? (
          <div className="space-y-4" aria-label="Loading bookings">
            <div className="grid gap-3.5 sm:grid-cols-4">
              <div className="h-20 animate-pulse rounded-lg border border-[#EAE3DC] bg-white" />
              <div className="h-20 animate-pulse rounded-lg border border-[#EAE3DC] bg-white" />
              <div className="h-20 animate-pulse rounded-lg border border-[#EAE3DC] bg-white" />
              <div className="h-20 animate-pulse rounded-lg border border-[#EAE3DC] bg-white" />
            </div>
            <div className="h-44 animate-pulse rounded-lg border border-[#EAE3DC] bg-white" />
          </div>
        ) : error ? (
          <section
            role="alert"
            className="grid overflow-hidden rounded-lg border border-[#EAE3DC] bg-white shadow-[0_12px_36px_rgba(28,25,23,0.06)] lg:grid-cols-[1.1fr_0.9fr]"
          >
            <div className="p-6 sm:p-8">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FBECEF] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#800020]">
                <Calendar size={12} />
                Bookings & Invoices
              </span>
              <h2 className="mt-3 text-xl font-bold text-[#1C1917] sm:text-2xl">
                Sign in to view your bookings
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[#57534E]">{error}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowOtpSheet(true)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
                >
                  <Phone size={14} />
                  <span>Sign in with Mobile OTP</span>
                </button>
                <Link
                  href="/account"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[#E2D9D0] bg-[#FBF8F5] px-4 text-xs font-semibold text-[#1C1917] hover:border-[#800020]"
                >
                  <span>Go to Account</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <div className="flex flex-col justify-between bg-gradient-to-br from-[#2B0710] via-[#4D0A1B] to-[#800020] p-6 text-white sm:p-8">
              <div>
                <h3 className="text-lg font-bold text-white">Track every visit end-to-end</h3>
                <ul className="mt-5 space-y-4 text-xs">
                  <li className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/12 text-[#FCE7ED]">
                      <UserCheck size={15} />
                    </span>
                    <div>
                      <strong className="block font-bold text-white">Live Technician Status</strong>
                      <span className="text-[#F3DCE2]">See pro assignment, arrival status, and verified contact info.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/12 text-[#FCE7ED]">
                      <KeyRound size={15} />
                    </span>
                    <div>
                      <strong className="block font-bold text-white">Start OTP Security</strong>
                      <span className="text-[#F3DCE2]">Share your visit PIN only when your technician arrives at your doorstep.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/12 text-[#FCE7ED]">
                      <ShieldCheck size={15} />
                    </span>
                    <div>
                      <strong className="block font-bold text-white">Quotes, Payments & Invoices</strong>
                      <span className="text-[#F3DCE2]">Review transparent line-item quotes and download receipts anytime.</span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </section>
        ) : count === 0 ? (
          <section className="rounded-lg border border-[#EAE3DC] bg-white p-8 text-center shadow-[0_8px_28px_rgba(28,25,23,0.05)] sm:p-10">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-[#FBECEF] text-[#800020]">
              <Wrench size={24} />
            </div>
            <h2 className="mt-4 text-xl font-bold text-[#1C1917]">No bookings yet</h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-[#57534E]">
              Pick what needs fixing at home, choose your preferred slot, and track every stage right here.
            </p>
            <Link
              href="/services"
              className="mt-5 inline-flex min-h-[42px] items-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm hover:bg-[#5e0017]"
            >
              <span>Explore services</span>
              <ArrowRight size={14} />
            </Link>
          </section>
        ) : (
          <>
            {/* Interactive Summary Cards */}
            <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4" aria-label="Booking summary">
              {(
                [
                  { key: "ALL", label: "Total shown", value: tabCounts.ALL, tone: "text-[#1C1917]", sub: `of ${count} total` },
                  { key: "UPCOMING", label: "Active & Upcoming", value: tabCounts.UPCOMING, tone: "text-[#800020]", sub: "Scheduled or live" },
                  {
                    key: "PAYMENT",
                    label: "Awaiting Payment",
                    value: tabCounts.PAYMENT,
                    tone: tabCounts.PAYMENT > 0 ? "text-amber-700" : "text-[#1C1917]",
                    sub: tabCounts.PAYMENT > 0 ? "Action needed" : "All settled",
                  },
                  { key: "COMPLETED", label: "Completed", value: tabCounts.COMPLETED, tone: "text-emerald-700", sub: "30-day warranty" },
                ] as const
              ).map((stat) => {
                const selected = tab === stat.key;
                return (
                  <button
                    key={stat.key}
                    type="button"
                    onClick={() => setTab(stat.key)}
                    className={`rounded-lg border bg-white p-4 text-left shadow-[0_4px_16px_rgba(28,25,23,0.04)] transition hover:border-[#800020]/40 ${
                      selected ? "border-[#800020] ring-2 ring-[#800020]/10" : "border-[#EAE3DC]"
                    }`}
                  >
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#78716C]">
                      {stat.label}
                    </span>
                    <strong className={`mt-1 block text-xl font-bold ${stat.tone}`}>{stat.value}</strong>
                    <span className="text-[11px] text-[#57534E]">{stat.sub}</span>
                  </button>
                );
              })}
            </section>

            {/* Filter Tabs + Quick Search */}
            <div className="flex flex-col gap-3 rounded-lg border border-[#EAE3DC] bg-white p-3.5 shadow-[0_4px_16px_rgba(28,25,23,0.04)] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter bookings by status">
                {(
                  [
                    { key: "ALL", label: "All" },
                    { key: "UPCOMING", label: "Active & Upcoming" },
                    { key: "PAYMENT", label: "Awaiting payment" },
                    { key: "COMPLETED", label: "Completed" },
                    { key: "CANCELLED", label: "Cancelled" },
                  ] as const
                ).map((item) => {
                  const active = tab === item.key;
                  const n = tabCounts[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(item.key)}
                      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition ${
                        active
                          ? "bg-[#800020] text-white"
                          : "bg-[#FBF8F5] text-[#57534E] hover:bg-[#f5ebe8] hover:text-[#800020]"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          active ? "bg-white/20 text-white" : "bg-white text-[#57534E]"
                        }`}
                      >
                        {n}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full sm:w-64">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search service, ref, area..."
                  aria-label="Search bookings"
                  className="h-9 w-full rounded-md border border-[#E2D9D0] bg-[#FBF8F5] pl-8 pr-3 text-xs text-[#1C1917] outline-none focus:border-[#800020] focus:bg-white"
                />
              </div>
            </div>

            {/* Dimensional Bookings List */}
            {filteredBookings.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#D6CEC6] bg-white p-8 text-center">
                <p className="text-sm font-bold text-[#1C1917]">No matching bookings found</p>
                <p className="mt-1 text-xs text-[#57534E]">
                  Try clearing your search or switching back to the All tab.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTab("ALL");
                    setQuery("");
                  }}
                  className="mt-4 inline-flex min-h-[36px] items-center rounded-md border border-[#E2D9D0] px-3.5 text-xs font-semibold text-[#1C1917] hover:border-[#800020]"
                >
                  Show all bookings
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredBookings.map((item) => {
                  const statusMeta = getStatusMeta(item.status);
                  const extraItems = Math.max(0, (item.items?.length ?? 1) - 1);
                  const isPaymentNeeded = PAYMENT_STATUSES.has(item.status);
                  const isCompleted = COMPLETED_STATUSES.has(item.status);
                  const isActiveVisit = UPCOMING_STATUSES.has(item.status);

                  return (
                    <article
                      key={item.id}
                      className={`overflow-hidden rounded-lg border border-[#EAE3DC] border-l-4 ${statusMeta.accentBorderClass} bg-white shadow-[0_6px_22px_rgba(28,25,23,0.05)] transition hover:shadow-[0_10px_28px_rgba(28,25,23,0.09)]`}
                    >
                      {/* Tinted Top Header Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4EFE9] bg-[#FCF9F6] px-4 py-2.5 sm:px-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-[#1C1917] ring-1 ring-[#EAE3DC]">
                            {item.reference}
                          </span>
                          <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${statusMeta.badgeClass}`}>
                            {statusMeta.label}
                          </span>
                          {isActiveVisit && item.start_otp_code && (
                            <span className="inline-flex items-center gap-1 rounded bg-[#FBECEF] px-2 py-0.5 text-[11px] font-bold text-[#800020]">
                              <KeyRound size={11} />
                              Start OTP: {item.start_otp_code}
                            </span>
                          )}
                        </div>

                        {item.price?.total_paise != null && (
                          <div className="flex items-baseline gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-[#78716C]">
                              {item.payment_status?.replaceAll("_", " ")}
                            </span>
                            <span className="text-base font-bold text-[#1C1917]">
                              {formatInr(item.price.total_paise)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="p-4 sm:p-5">
                        <div className="flex items-start gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#FBECEF] text-[#800020]">
                            {isCompleted ? <CheckCircle2 size={18} /> : <Wrench size={18} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/bookings/${item.id}`}
                              className="block text-base font-bold text-[#1C1917] transition hover:text-[#800020] sm:text-lg"
                            >
                              {item.service}
                              {extraItems > 0 && (
                                <span className="ml-2 inline-flex rounded bg-[#FBECEF] px-2 py-0.5 text-[11px] font-bold text-[#800020]">
                                  +{extraItems} more services
                                </span>
                              )}
                            </Link>
                            {item.package && (
                              <p className="mt-0.5 text-xs font-medium text-[#57534E]">{item.package}</p>
                            )}
                          </div>
                        </div>

                        {/* Structured Metadata Tiles */}
                        <div className="mt-4 grid gap-2.5 text-xs sm:grid-cols-3">
                          <div className="flex items-center gap-2 rounded-md border border-[#F4EFE9] bg-[#FBF8F5] px-3 py-2 text-[#1C1917]">
                            <Clock size={14} className="shrink-0 text-[#800020]" />
                            <div className="min-w-0">
                              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#78716C]">
                                Scheduled slot
                              </span>
                              <span className="block truncate font-semibold">{formatSlotDate(item.slot.start_at)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 rounded-md border border-[#F4EFE9] bg-[#FBF8F5] px-3 py-2 text-[#1C1917]">
                            <MapPin size={14} className="shrink-0 text-[#800020]" />
                            <div className="min-w-0">
                              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#78716C]">
                                Location
                              </span>
                              <span className="block truncate font-semibold">
                                {[item.address?.label, item.address?.locality, item.address?.city]
                                  .filter(Boolean)
                                  .join(" · ") || "Service address"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 rounded-md border border-[#F4EFE9] bg-[#FBF8F5] px-3 py-2 text-[#1C1917]">
                            <UserCheck size={14} className="shrink-0 text-[#800020]" />
                            <div className="min-w-0">
                              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[#78716C]">
                                Technician
                              </span>
                              <span className="block truncate font-semibold">
                                {item.technician?.name || "Assigned before visit"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-[#F4EFE9] pt-3">
                          <Link
                            href={`/bookings/${item.id}`}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#f5ebe8] px-3.5 text-xs font-bold text-[#800020] transition hover:bg-[#800020] hover:text-white"
                          >
                            <span>View timeline & track</span>
                            <ArrowRight size={13} />
                          </Link>

                          <div className="flex flex-wrap items-center gap-2">
                            {isPaymentNeeded && (
                              <Link
                                href={`/bookings/${item.id}`}
                                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#800020] px-4 text-xs font-bold text-white shadow-2xs hover:bg-[#5e0017]"
                              >
                                <CreditCard size={13} />
                                <span>Complete payment</span>
                              </Link>
                            )}
                            {isCompleted && (
                              <Link
                                href="/services"
                                className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-[#E2D9D0] bg-white px-3.5 text-xs font-semibold text-[#1C1917] hover:border-[#800020]"
                              >
                                <span>Book another service</span>
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {(page > 1 || count > 20) && (
              <div className="flex items-center justify-between rounded-lg border border-[#EAE3DC] bg-white px-4 py-3 text-xs shadow-2xs">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => p - 1);
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-[#E2D9D0] px-3 font-semibold text-[#1C1917] disabled:opacity-45"
                >
                  <ChevronLeft size={14} />
                  <span>Previous</span>
                </button>
                <span className="font-semibold text-[#57534E]">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page * 20 >= count}
                  onClick={() => {
                    setLoading(true);
                    setPage((p) => p + 1);
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-[#E2D9D0] px-3 font-semibold text-[#1C1917] disabled:opacity-45"
                >
                  <span>Next</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <QuickOtpSheet
        open={showOtpSheet}
        onClose={() => setShowOtpSheet(false)}
        onAuthenticated={() => {
          setShowOtpSheet(false);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("nammapros:auth-changed"));
          }
          void reloadBookings(1);
          setPage(1);
        }}
      />
    </main>
  );
}
