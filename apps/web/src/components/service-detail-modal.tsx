"use client";

import type { PublicReview, Service } from "@nammapros/types";
import { ArrowRight, Check, Clock, Minus, Plus, ShieldCheck, Sparkles, Star, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useId, useRef, useState } from "react";
import { getPackageUnitPaise, useBookingCart } from "@/components/booking-cart-provider";
import { ServiceImage } from "@/components/service-image";
import { bookingApi } from "@/lib/booking-api";
import { resolveUploadedMediaUrl, servicePopupCoverImage } from "@/lib/service-images";
import { formatInr } from "@/lib/services";
import { isUnavailableHere, useZonePincode, useZoneService } from "./zone-pricing-provider";

export type ServiceModalProps = {
  service: Service;
  onClose: () => void;
  syncUrl?: boolean;
};

function formatReviewDate(dateStr?: string) {
  if (!dateStr) return "";
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ServiceDetailModal({ service: baseService, onClose, syncUrl = true }: ServiceModalProps) {
  const zoneService = useZoneService(baseService);
  const pincode = useZonePincode();
  // One call returns area prices, the latest reviews and the rating breakdown for the popup.
  const [quick, setQuick] = useState<{ key: string; data: Service | null } | null>(null);
  const quickKey = `${baseService.slug}|${pincode ?? ""}`;
  useEffect(() => {
    let active = true;
    bookingApi
      .quickView(baseService.slug, pincode ?? undefined)
      .then((data) => active && setQuick({ key: quickKey, data }))
      .catch(() => active && setQuick({ key: quickKey, data: null }));
    return () => {
      active = false;
    };
  }, [baseService.slug, pincode, quickKey]);
  const quickData = quick?.key === quickKey ? quick.data : null;
  const service: Service = quickData ? { ...zoneService, ...quickData } : zoneService;
  const packages = service.packages ?? [];
  const defaultIdx = Math.max(
    0,
    packages.findIndex((p) => p.is_most_booked)
  );
  const [selectedPkgIndex, setSelectedPkgIndex] = useState(defaultIdx);
  const [addedFeedback, setAddedFeedback] = useState(false);

  const { items, addToCart, openSheet, updateItemQuantity } = useBookingCart();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const pkg = packages[selectedPkgIndex] ?? packages[0] ?? null;
  const unitPaise = getPackageUnitPaise(service, pkg);
  const originalPaise = pkg?.original_price_paise ?? null;
  const showStrike = Boolean(originalPaise && unitPaise != null && originalPaise > unitPaise);
  const discountPct = showStrike && originalPaise && unitPaise != null
    ? Math.round(((originalPaise - unitPaise) * 100) / originalPaise)
    : null;
  const unavailableHere = isUnavailableHere(pkg);
  const popupCover = servicePopupCoverImage(service);

  const inclusions =
    (pkg?.inclusions && pkg.inclusions.length > 0 ? pkg.inclusions : service.inclusions) ?? [];
  const exclusions =
    (pkg?.exclusions && pkg.exclusions.length > 0 ? pkg.exclusions : service.exclusions) ?? [];
  const brands = (service.brands ?? []).filter((b) => Boolean(b?.name?.trim()));
  const fullDescription = service.description || service.full_description || service.summary;

  // Body scroll lock, focus save/restore, Esc & focus trap
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // Sync URL ?service=<slug> while open
  useEffect(() => {
    if (!syncUrl || typeof window === "undefined") return;
    const currentUrl = new URL(window.location.href);
    const hadService = currentUrl.searchParams.get("service");
    if (hadService !== service.slug) {
      currentUrl.searchParams.set("service", service.slug);
      window.history.replaceState(window.history.state, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    }
    return () => {
      const cleanupUrl = new URL(window.location.href);
      if (cleanupUrl.searchParams.get("service") === service.slug) {
        cleanupUrl.searchParams.delete("service");
        const nextSearch = cleanupUrl.searchParams.toString();
        window.history.replaceState(
          window.history.state,
          "",
          `${cleanupUrl.pathname}${nextSearch ? `?${nextSearch}` : ""}${cleanupUrl.hash}`
        );
      }
    };
  }, [service.slug, syncUrl]);

  const reviewsLoading = quick?.key !== quickKey;
  const avgRating = service.average_rating ?? service.rating_avg ?? null;
  const totalReviewCount = service.review_count ?? 0;
  // "See all reviews" loads more reviews here, 10 at a time. The pop-up is the service's only page.
  const [allReviews, setAllReviews] = useState<{ items: PublicReview[]; nextPage: number | null; loading: boolean; error: string } | null>(null);
  const loadReviews = async (page: number) => {
    setAllReviews((cur) => ({ items: cur?.items ?? [], nextPage: cur?.nextPage ?? page, loading: true, error: "" }));
    try {
      const res = await bookingApi.serviceReviewsPage(service.slug || service.id, page);
      setAllReviews((cur) => ({
        items: page === 1 ? res.results : [...(cur?.items ?? []), ...res.results],
        nextPage: res.next ? page + 1 : null,
        loading: false,
        error: "",
      }));
    } catch {
      setAllReviews((cur) => ({ items: cur?.items ?? [], nextPage: cur?.nextPage ?? page, loading: false, error: "Could not load reviews. Try again." }));
    }
  };
  const latestReviews: PublicReview[] = allReviews ? allReviews.items : (service.recent_reviews ?? []).slice(0, 5);
  const breakdown = service.rating_breakdown;

  const handleAddToCart = () => {
    if (!pkg) return;
    addToCart(service, pkg, 1, "", false);
    setAddedFeedback(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="relative flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-lg bg-[#FBF8F5] shadow-2xl sm:rounded-lg animate-[slideUpSheet_.22s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* 1. Image at the top + X button on image */}
          <div className="relative aspect-[16/7] w-full overflow-hidden rounded-t-lg bg-[#EFE9E2]">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="absolute right-3.5 top-3.5 z-10 grid h-11 w-11 place-items-center rounded-md bg-white/95 text-[#1C1917] shadow-md transition hover:bg-white"
            >
              <X size={18} strokeWidth={1.75} />
            </button>

            {popupCover ? (
              <ServiceImage src={popupCover} alt={service.name} fit="contain" priority />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#F5E6EA] to-[#EFE9E2] text-[#800020]/70"
              >
                <Sparkles size={32} strokeWidth={1.5} />
                <span className="text-xs font-semibold">{service.category_name || "NammaPros Verified"}</span>
              </div>
            )}
          </div>

          <div className="space-y-6 p-5 sm:p-6">
            {/* 2. Title and key info */}
            <section aria-label="Service overview" className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 id={titleId} className="font-serif text-2xl font-bold text-[#1C1917]">
                    {service.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#57534E]">
                    {avgRating != null && (
                      <span className="inline-flex items-center gap-1 font-semibold text-[#1C1917]">
                        <Star size={13} className="fill-[#C8A35B] text-[#C8A35B]" />
                        <span>{avgRating}</span>
                        <span className="font-normal text-[#57534E]">({totalReviewCount} reviews)</span>
                      </span>
                    )}
                    {pkg && (
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Clock size={13} strokeWidth={1.75} className="text-[#800020]" />
                        <span>{pkg.duration_minutes} mins</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-baseline justify-end gap-2">
                    <span className="font-serif text-2xl font-bold text-[#800020]">
                      {unitPaise != null ? formatInr(unitPaise) : "Quote"}
                    </span>
                    {showStrike && originalPaise != null && (
                      <span className="text-xs text-[#78716C] line-through">
                        {formatInr(originalPaise)}
                      </span>
                    )}
                  </div>
                  {service.price_note && (
                    <span className="block text-[11px] text-[#57534E]">{service.price_note}</span>
                  )}
                </div>
              </div>
            </section>

            {/* 3. Options (e.g. TV size): a card each with its price and its own Add */}
            {packages.length > 1 && (
              <section aria-labelledby={`${titleId}-options`} className="space-y-2.5">
                <h3 id={`${titleId}-options`} className="text-base font-bold text-[#1C1917]">
                  {packages.every((p) => /inch/i.test(p.name)) ? "Choose your TV size" : "Choose an option"}
                </h3>
                <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:thin] sm:-mx-6 sm:scroll-px-6 sm:px-6">
                  {packages.map((p, idx) => {
                    const pUnit = getPackageUnitPaise(service, p);
                    const pOrig = p.original_price_paise;
                    const pStrike = Boolean(pOrig && pUnit != null && pOrig > pUnit);
                    const active = selectedPkgIndex === idx;
                    const inCart = items.find((i) => i.pkg.id === p.id);
                    const pUnavailable = isUnavailableHere(p);
                    return (
                      <li key={p.id} className="w-[148px] shrink-0 snap-start">
                        <div
                          className={`flex h-full flex-col rounded-xl border bg-white p-3 transition ${
                            active ? "border-[#800020] ring-1 ring-[#800020]" : "border-[#E8E1DB]"
                          }`}
                        >
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                              setSelectedPkgIndex(idx);
                              setAddedFeedback(false);
                            }}
                            className="flex-1 text-left"
                          >
                            <span className="block text-sm font-semibold leading-snug text-[#1C1917]">{p.name}</span>
                            <span className="mt-1.5 block text-sm">
                              <span className="font-bold text-[#1C1917]">{pUnit != null ? formatInr(pUnit) : "Quote"}</span>
                              {pStrike && pOrig != null && (
                                <span className="ml-1.5 text-xs text-[#78716C] line-through">{formatInr(pOrig)}</span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-[#78716C]">{p.duration_minutes} mins</span>
                          </button>
                          {inCart ? (
                            <span className="mt-2.5 inline-flex h-9 items-center justify-between rounded-lg border border-[#800020] bg-[#F6E7EB] text-sm font-bold text-[#800020]">
                              <button type="button" aria-label={`One less ${p.name}`} onClick={() => updateItemQuantity(p.id, inCart.quantity - 1)} className="grid h-9 w-9 place-items-center">
                                <Minus size={14} />
                              </button>
                              <span aria-live="polite">{inCart.quantity}</span>
                              <button type="button" aria-label={`One more ${p.name}`} disabled={inCart.quantity >= 10} onClick={() => updateItemQuantity(p.id, inCart.quantity + 1)} className="grid h-9 w-9 place-items-center disabled:opacity-40">
                                <Plus size={14} />
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={pUnavailable}
                              onClick={() => {
                                setSelectedPkgIndex(idx);
                                addToCart(service, p, 1, "", false);
                                setAddedFeedback(true);
                              }}
                              aria-label={`Add ${p.name}`}
                              className="mt-2.5 h-9 rounded-lg border border-[#D6CBC4] bg-white text-sm font-bold text-[#800020] transition hover:border-[#800020] disabled:opacity-50"
                            >
                              Add
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* 4. Description */}
            {fullDescription && (
              <section aria-label="Description" className="space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#57534E]">
                  About this service
                </h3>
                {fullDescription.includes("<") ? (
                  <div
                    className="prose prose-sm max-w-none text-xs leading-relaxed text-[#57534E]"
                    dangerouslySetInnerHTML={{ __html: fullDescription }}
                  />
                ) : (
                  <p className="text-xs leading-relaxed text-[#57534E]">{fullDescription}</p>
                )}
              </section>
            )}

            {/* 5. What's included */}
            {inclusions.length > 0 && (
              <section aria-label="What's included" className="rounded-lg bg-white p-4 shadow-2xs">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
                  <ShieldCheck size={15} strokeWidth={1.75} className="text-emerald-700" /> What&apos;s included
                </h3>
                <ul className="space-y-2 text-xs text-[#1C1917]">
                  {inclusions.map((inc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-emerald-700" />
                      <span>{inc}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 6. Not included (+ important notes if provided) */}
            {(exclusions.length > 0 || service.important_notes) && (
              <section aria-label="Not included" className="rounded-lg bg-[#F4EFE9] p-4 space-y-3">
                {exclusions.length > 0 && (
                  <div>
                    <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[#57534E]">
                      Not included
                    </h3>
                    <ul className="space-y-2 text-xs text-[#57534E]">
                      {exclusions.map((exc, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <X size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-red-600" />
                          <span>{exc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {service.important_notes && (
                  <p className="border-t border-[#E4DCD3] pt-2.5 text-[11px] leading-relaxed text-[#57534E]">
                    <strong className="text-[#1C1917]">Important note:</strong> {service.important_notes}
                  </p>
                )}
              </section>
            )}

            {/* 7. Reviews */}
            <section aria-label="Reviews" className="space-y-3 rounded-lg bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#57534E]">Reviews</h3>
                  {avgRating != null && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF6F2] px-2.5 py-0.5 text-xs font-bold text-[#1C1917]">
                      <Star size={12} className="fill-[#C8A35B] text-[#C8A35B]" />
                      {avgRating}
                    </span>
                  )}
                </div>
                {!allReviews && totalReviewCount > latestReviews.length && (
                  <button type="button" onClick={() => void loadReviews(1)} className="text-xs font-bold text-[#800020] hover:underline">
                    See all reviews
                  </button>
                )}
              </div>

              {!reviewsLoading && breakdown && totalReviewCount > 0 && (
                <div className="mb-3 space-y-1" aria-label="Rating breakdown">
                  {(["5", "4", "3", "2", "1"] as const).map((star) => {
                    const count = breakdown[star] ?? 0;
                    const pct = totalReviewCount ? Math.round((count * 100) / totalReviewCount) : 0;
                    return (
                      <div key={star} className="flex items-center gap-2 text-[11px] text-[#57534E]">
                        <span className="w-6">{star}★</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F4EFE9]" aria-hidden="true">
                          <span className="block h-full rounded-full bg-[#C8A35B]" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {reviewsLoading ? (
                <div className="space-y-2" aria-busy="true">
                  <div className="h-10 animate-pulse rounded-md bg-[#F4EFE9]" />
                  <div className="h-10 animate-pulse rounded-md bg-[#F4EFE9]" />
                </div>
              ) : latestReviews.length > 0 ? (
                <div className="divide-y divide-[#F4EFE9]">
                  {latestReviews.map((rev) => (
                    <article key={rev.id} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <strong className="text-[#1C1917]">{rev.customer_name}</strong>
                          <span className="inline-flex items-center gap-0.5 text-[#C8A35B]" aria-label={`${rev.rating} stars`}>
                            {Array.from({ length: rev.rating }).map((_, idx) => (
                              <Star key={idx} size={11} className="fill-[#C8A35B] text-[#C8A35B]" />
                            ))}
                          </span>
                        </div>
                        {rev.created_at && (
                          <span className="text-[11px] text-[#78716C]">{formatReviewDate(rev.created_at)}</span>
                        )}
                      </div>
                      {rev.comment && <p className="mt-1 text-xs leading-relaxed text-[#57534E]">{rev.comment}</p>}
                    </article>
                  ))}
                  {allReviews?.error && <p role="alert" className="pt-2 text-xs font-semibold text-red-700">{allReviews.error}</p>}
                  {allReviews?.nextPage && (
                    <button type="button" disabled={allReviews.loading} onClick={() => void loadReviews(allReviews.nextPage!)}
                      className="mt-2 min-h-[40px] w-full rounded-md border border-[#EAE3DC] text-xs font-bold text-[#1C1917] disabled:opacity-50">
                      {allReviews.loading ? "Loading…" : "Show more reviews"}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#78716C]">No reviews yet</p>
              )}
            </section>

            {/* 8. Brands we service (LAST section — hidden if empty) */}
            {brands.length > 0 && (
              <section aria-label="Brands we service" className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#57534E]">
                  Brands we service
                </h3>
                <div className="flex flex-wrap gap-2">
                  {brands.map((brand) => {
                    const logo = resolveUploadedMediaUrl(brand.logo_url);
                    return (
                      <span
                        key={brand.name}
                        className="inline-flex min-h-[38px] items-center gap-2 rounded-md border border-[#EAE3DC] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1C1917]"
                      >
                        {logo && (
                          <Image
                            src={logo}
                            alt=""
                            width={18}
                            height={18}
                            unoptimized
                            className="h-4 w-4 object-contain"
                          />
                        )}
                        <span>{brand.name}</span>
                      </span>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Sticky bottom bar */}
        <div className="shrink-0 border-t border-[#E8E1DB] bg-white px-5 py-3.5 shadow-[0_-6px_18px_rgba(28,25,23,0.06)] sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="block text-[11px] text-[#57534E]">
                {pkg?.name || service.name}
              </span>
              <div className="flex items-baseline gap-2">
                <strong className="font-serif text-lg font-bold text-[#1C1917]">
                  {unitPaise != null ? formatInr(unitPaise) : "Quote on inspection"}
                </strong>
                {showStrike && originalPaise != null && (
                  <span className="text-xs text-[#78716C] line-through">
                    <span className="sr-only">Original price </span>
                    {formatInr(originalPaise)}
                  </span>
                )}
                {discountPct != null && discountPct > 0 && (
                  <span className="rounded bg-[#E7F3EC] px-1.5 py-0.5 text-[10px] font-bold text-[#1F6B44]">{discountPct}% off</span>
                )}
              </div>
              {unavailableHere && (
                <span className="block text-[11px] font-semibold text-[#9A3412]">Not offered in your area yet</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {addedFeedback ? (
                <>
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-emerald-700 bg-emerald-50 px-5 text-xs font-bold text-emerald-800"
                  >
                    Added ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openSheet();
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm hover:bg-[#5e0017]"
                  >
                    <span>View cart</span>
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </button>
                </>
              ) : pkg ? (
                <button
                  type="button"
                  disabled={unavailableHere}
                  onClick={handleAddToCart}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#800020] px-6 text-xs font-bold text-white shadow-sm transition hover:bg-[#5e0017] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>Add to cart</span>
                  <ArrowRight size={15} strokeWidth={1.75} />
                </button>
              ) : (
                <Link
                  href={`/book?service=${encodeURIComponent(service.slug)}`}
                  onClick={onClose}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#800020] px-6 text-xs font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
                >
                  <span>Book visit</span>
                  <ArrowRight size={15} strokeWidth={1.75} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
