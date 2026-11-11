"use client";

import type { PublicReview, Service } from "@nammapros/types";
import { ArrowRight, Check, Clock, ShieldCheck, Sparkles, Star, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useId, useRef, useState } from "react";
import { getPackageUnitPaise, useBookingCart } from "@/components/booking-cart-provider";
import { ServiceImage } from "@/components/service-image";
import { bookingApi } from "@/lib/booking-api";
import { resolveUploadedMediaUrl, servicePopupCoverImage } from "@/lib/service-images";
import { formatInr } from "@/lib/services";

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

export function ServiceDetailModal({ service, onClose, syncUrl = true }: ServiceModalProps) {
  const packages = service.packages ?? [];
  const defaultIdx = Math.max(
    0,
    packages.findIndex((p) => p.is_most_booked)
  );
  const [selectedPkgIndex, setSelectedPkgIndex] = useState(defaultIdx);
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [reviewsState, setReviewsState] = useState<{
    loadedForKey: string | null;
    averageRating: number | null;
    reviewCount: number;
    results: PublicReview[];
  }>({
    loadedForKey: null,
    averageRating: service.rating_avg ?? null,
    reviewCount: service.review_count ?? 0,
    results: [],
  });

  const { addToCart, openSheet } = useBookingCart();
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

  // Fetch service reviews on open
  const reviewKey = service.slug || service.id;
  const reviewsLoading = reviewsState.loadedForKey !== reviewKey;
  useEffect(() => {
    let active = true;
    const targetKey = reviewKey;
    const fetcher = bookingApi.serviceReviews;
    if (!fetcher) {
      const t = window.setTimeout(() => {
        if (active) {
          setReviewsState({
            loadedForKey: targetKey,
            averageRating: service.rating_avg ?? null,
            reviewCount: service.review_count ?? 0,
            results: [],
          });
        }
      }, 0);
      return () => {
        active = false;
        window.clearTimeout(t);
      };
    }

    fetcher(targetKey)
      .then((res) => {
        if (!active) return;
        setReviewsState({
          loadedForKey: targetKey,
          averageRating: res.average_rating ?? service.rating_avg ?? null,
          reviewCount: res.review_count ?? res.results?.length ?? 0,
          results: res.results ?? [],
        });
      })
      .catch(() => {
        if (!active) return;
        setReviewsState({
          loadedForKey: targetKey,
          averageRating: service.rating_avg ?? null,
          reviewCount: service.review_count ?? 0,
          results: [],
        });
      });
    return () => {
      active = false;
    };
  }, [reviewKey, service.rating_avg, service.review_count]);

  const avgRating = reviewsState.averageRating ?? service.rating_avg ?? null;
  const totalReviewCount = reviewsState.reviewCount ?? service.review_count ?? 0;
  const latestReviews = reviewsState.results.slice(0, 5);
  const fullDetailHref = `/services/${encodeURIComponent(service.category)}/${encodeURIComponent(service.slug)}`;

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

            {/* 3. Package selector */}
            {packages.length > 1 && (
              <section aria-label="Package selector" className="space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#57534E]">
                  Choose a package
                </h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {packages.map((p, idx) => {
                    const pUnit = getPackageUnitPaise(service, p);
                    const pOrig = p.original_price_paise;
                    const pStrike = Boolean(pOrig && pUnit != null && pOrig > pUnit);
                    const active = selectedPkgIndex === idx;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedPkgIndex(idx);
                          setAddedFeedback(false);
                        }}
                        className={`min-h-[48px] rounded-md border p-3.5 text-left transition ${
                          active
                            ? "border-2 border-[#800020] bg-[#f5ebe8] text-[#1C1917]"
                            : "border-[#E8E1DB] bg-white text-[#1C1917] hover:border-[#800020]/45"
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-bold">{p.name}</span>
                          {pUnit != null && (
                            <span className="text-xs font-bold text-[#800020]">
                              {formatInr(pUnit)}
                              {pStrike && pOrig != null && (
                                <span className="ml-1 font-normal text-[#78716C] line-through">
                                  {formatInr(pOrig)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <span className="mt-0.5 block text-[11px] text-[#57534E]">
                          {p.duration_minutes} mins
                        </span>
                      </button>
                    );
                  })}
                </div>
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
                <Link
                  href={`${fullDetailHref}#reviews`}
                  onClick={onClose}
                  className="text-xs font-bold text-[#800020] hover:underline"
                >
                  See all reviews
                </Link>
              </div>

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
                  <span className="text-xs text-[#78716C] line-through">{formatInr(originalPaise)}</span>
                )}
              </div>
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
                  onClick={handleAddToCart}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#800020] px-6 text-xs font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
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
