"use client";

import type { Service, ServiceCategory, ServicePackage } from "@nammapros/types";
import { BadgeCheck, Check, ChevronRight, Clock, IndianRupee, Minus, Plus, ShieldCheck, ShoppingBag, Star } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { getPackageUnitPaise, pickDefaultPackage, useBookingCart } from "@/components/booking-cart-provider";
import { ServiceDetailModal } from "@/components/service-detail-modal";
import { ServiceImage } from "@/components/service-image";
import { isUnavailableHere, useZoneService } from "@/components/zone-pricing-provider";
import { getCategoryBannerSrc, serviceListImage } from "@/lib/service-images";
import { useServiceLocation } from "@/components/location-provider";
import { citySlug, formatInr } from "@/lib/services";

/**
 * Category page: left = title, rating, warranty and a menu of service GROUPS
 * (Service / Repair / Installation & uninstallation); centre = banner and one section per group with a row per
 * service; right = NammaPros promise and cart. A service's full details live in its pop-up (?service=slug);
 * there is no separate service page.
 */
const REWORK_DAYS = Number(process.env.NEXT_PUBLIC_REWORK_DAYS ?? "30");
type GroupKey = "service" | "repair" | "install";
type Group = { key: GroupKey; label: string; services: Service[] };

function groupKeyOf(service: Service): GroupKey {
  const text = `${service.name} ${service.slug}`.toLowerCase();
  if (/(uninstall|install|mount|fitting|setup)/.test(text)) return "install";
  if (/(repair|gas|refill|inspection|check|diagnos|fix)/.test(text)) return "repair";
  return "service";
}

export function groupServices(category: ServiceCategory, services: Service[]): Group[] {
  const isAc = ["ac", "air-conditioning"].includes(category.slug);
  const labels: Record<GroupKey, string> = {
    service: "Service",
    repair: isAc ? "Repair & gas refill" : "Repair",
    install: "Installation & uninstallation",
  };
  return (["service", "repair", "install"] as GroupKey[])
    .map((key) => ({ key, label: labels[key], services: services.filter((s) => groupKeyOf(s) === key) }))
    .filter((g) => g.services.length > 0);
}

const sectionId = (key: string) => `grp-${key}`;

function ratingOf(services: Service[]) {
  let total = 0;
  let count = 0;
  for (const s of services) {
    const r = s.average_rating ?? s.rating_avg;
    if (r != null && (s.review_count ?? 0) > 0) {
      total += r * (s.review_count ?? 0);
      count += s.review_count ?? 0;
    }
  }
  return count ? { avg: Math.round((total / count) * 100) / 100, count } : null;
}

export function CategoryServiceLayout({ category, services, initialService }: { category: ServiceCategory; services: Service[]; initialService?: string }) {
  const { location } = useServiceLocation();
  const groups = useMemo(() => groupServices(category, services), [category, services]);
  const [active, setActive] = useState<string>(groups[0]?.key ?? "");
  const [detail, setDetail] = useState<Service | null>(null);
  const rating = ratingOf(services);
  const banner = getCategoryBannerSrc(category);
  const startsAt = useMemo(() => {
    const prices = services.flatMap((s) => (s.packages ?? []).map((p) => getPackageUnitPaise(s, p))).filter((p): p is number => p != null);
    return prices.length ? Math.min(...prices) : null;
  }, [services]);

  // Keep the address in the form /services?city=<city>&category=<category>[&service=<service>].
  useEffect(() => {
    const url = new URL(window.location.href);
    const city = citySlug(location?.city);
    let changed = false;
    if (city && url.searchParams.get("city") !== city) {
      url.searchParams.set("city", city);
      changed = true;
    }
    if (url.searchParams.get("category") !== category.slug) {
      url.searchParams.set("category", category.slug);
      changed = true;
    }
    if (changed) {
      const ordered = new URLSearchParams();
      for (const key of ["city", "category", "service"]) {
        const v = url.searchParams.get(key);
        if (v) ordered.set(key, v);
      }
      window.history.replaceState(window.history.state, "", `${url.pathname}?${ordered.toString()}${url.hash}`);
    }
  }, [location?.city, category.slug]);

  // ?service=<slug> opens that service's pop-up.
  useEffect(() => {
    const wanted = initialService || new URLSearchParams(window.location.search).get("service");
    if (!wanted) return;
    const match = services.find((s) => s.slug === wanted || s.slug === `${category.slug}-${wanted}`);
    if (!match) return;
    const t = window.setTimeout(() => setDetail(match), 0);
    return () => window.clearTimeout(t);
  }, [services, category.slug, initialService]);

  // Highlight the group in view.
  useEffect(() => {
    const els = groups.map((g) => document.getElementById(sectionId(g.key))).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id.replace(/^grp-/, ""));
    }, { rootMargin: "-120px 0px -60% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [groups]);

  const jump = (key: string) => {
    setActive(key);
    document.getElementById(sectionId(key))?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="bg-white pb-24 xl:pb-12">
      <div className="container grid gap-6 py-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 lg:py-8 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        {/* LEFT */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="text-2xl font-bold tracking-tight text-[#1C1917] sm:text-[28px]">{`${category.name} Service & Repair`}</h1>
          {rating && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[#44403C]">
              <Star size={15} className="fill-[#800020] text-[#800020]" aria-hidden="true" />
              <strong>{rating.avg}</strong> <span className="text-[#57534E]">({rating.count.toLocaleString("en-IN")} reviews)</span>
            </p>
          )}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#EAE3DC] bg-[#FBF8F5] px-4 py-3">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#1F6B44]">
                <ShieldCheck size={13} aria-hidden="true" /> NammaPros cover
              </p>
              <p className="mt-0.5 text-sm text-[#1C1917]">Up to {REWORK_DAYS}-day warranty on repairs</p>
            </div>
            <Link href="/cancellation-policy" aria-label="Warranty details" className="text-[#57534E] hover:text-[#800020]"><ChevronRight size={18} /></Link>
          </div>

          <div className="mt-5 hidden rounded-xl border border-[#EAE3DC] p-4 lg:block">
            <p className="mb-3 text-xs font-semibold text-[#57534E]">Select a service</p>
            <ul className="grid grid-cols-3 gap-x-3 gap-y-4">
              {groups.map((g) => {
                const img = serviceListImage(g.services[0]);
                return (
                  <li key={g.key}>
                    <button type="button" onClick={() => jump(g.key)} aria-current={active === g.key ? "true" : undefined} className="group block w-full text-center">
                      <span className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-[#F3EFEC] ring-2 transition ${active === g.key ? "ring-[#800020]" : "ring-transparent group-hover:ring-[#EAE3DC]"}`}>
                        {img ? <ServiceImage src={img} alt="" fit="cover" /> : null}
                      </span>
                      <span className="mt-1.5 line-clamp-2 block text-[11px] leading-tight text-[#44403C]">{g.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* CENTRE */}
        <div className="min-w-0">
          <div className="relative overflow-hidden rounded-2xl bg-[#F6E7EB]">
            <div className="grid min-h-[180px] items-center sm:grid-cols-2">
              <div className="relative z-10 p-6 sm:p-8">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#800020] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  <BadgeCheck size={13} aria-hidden="true" /> Verified pros
                </span>
                {/* Wording is editable in admin: banner title = headline, banner subtitle = second line ({price} = lowest price). */}
                <p className="mt-3 text-xl font-bold leading-tight text-[#1C1917] sm:text-2xl xl:text-3xl">{category.banner_title || `${category.name} at your doorstep`}</p>
                {(() => {
                  const price = startsAt != null ? formatInr(startsAt) : "";
                  const line = category.banner_subtitle
                    ? category.banner_subtitle.replaceAll("{price}", price)
                    : price ? `Starts at ${price}` : "";
                  return line ? <p className="mt-2 text-base text-[#44403C]">{line}</p> : null;
                })()}
              </div>
              {banner && (
                <div className="relative hidden h-full min-h-[200px] sm:block">
                  <ServiceImage src={banner} alt="" fit="cover" priority />
                </div>
              )}
            </div>
          </div>

          <div className="sticky top-14 z-20 -mx-4 mt-4 flex gap-2 overflow-x-auto border-b border-[#EAE3DC] bg-white px-4 py-2.5 lg:hidden" role="tablist" aria-label="Service groups">
            {groups.map((g) => (
              <button key={g.key} type="button" role="tab" aria-selected={active === g.key} onClick={() => jump(g.key)}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold ${active === g.key ? "border-[#800020] bg-[#800020] text-white" : "border-[#EAE3DC] bg-white text-[#44403C]"}`}>
                {g.label}
              </button>
            ))}
          </div>

          <div className="lg:mt-2 lg:border-x lg:border-[#F0EBE7] lg:px-6">
            {groups.map((g) => (
              <section key={g.key} id={sectionId(g.key)} aria-labelledby={`${sectionId(g.key)}-h`} className="scroll-mt-32 border-b-8 border-[#F3EFEC] py-6 last:border-b-0">
                <h2 id={`${sectionId(g.key)}-h`} className="text-xl font-bold text-[#1C1917]">{g.label}</h2>
                <ul>
                  {g.services.map((s) => <ServiceRow key={s.slug} service={s} onDetails={() => setDetail(s)} />)}
                </ul>
              </section>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <aside className="hidden xl:sticky xl:top-24 xl:block xl:self-start">
          <PromiseCard />
          <CartCard />
        </aside>
      </div>

      {detail && <ServiceDetailModal service={detail} onClose={() => setDetail(null)} />}
    </main>
  );
}

function durationText(min?: number) {
  if (!min) return "";
  return min >= 60 ? `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`;
}

/** One row per service. Single-option services add straight away; multi-option ones open the pop-up to choose. */
function ServiceRow({ service: base, onDetails }: { service: Service; onDetails: () => void }) {
  const service = useZoneService(base);
  const { items, addToCart, updateItemQuantity } = useBookingCart();
  const packages = service.packages ?? [];
  const pkg: ServicePackage | null = pickDefaultPackage(service);
  const options = packages.length;
  const prices = packages.map((p) => getPackageUnitPaise(service, p)).filter((p): p is number => p != null);
  const unit = options > 1 ? (prices.length ? Math.min(...prices) : null) : getPackageUnitPaise(service, pkg);
  const mrp = options > 1 ? null : (pkg?.mrp_paise ?? (pkg?.original_price_paise && unit != null && pkg.original_price_paise > unit ? pkg.original_price_paise : null));
  const inCart = options === 1 && pkg ? items.find((e) => e.pkg.id === pkg.id) : undefined;
  const qtyInCart = items.filter((e) => e.service.id === service.id).reduce((n, e) => n + e.quantity, 0);
  const rating = service.average_rating ?? service.rating_avg;
  const points = (pkg?.inclusions?.length ? pkg.inclusions : service.inclusions ?? []).slice(0, 2);
  const unavailable = options === 1 && isUnavailableHere(pkg);
  const image = serviceListImage(service);

  return (
    <li className="flex gap-4 border-b border-[#F0EBE7] py-5 last:border-b-0">
      <div className="min-w-0 flex-1">
        {packages.some((p) => p.is_most_booked) && <p className="text-[10px] font-bold uppercase tracking-wide text-[#1F6B44]">Most booked</p>}
        <h3 className="mt-0.5 text-[15px] font-semibold text-[#1C1917]">{service.name}</h3>
        {rating != null && (service.review_count ?? 0) > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs text-[#57534E]">
            <Star size={12} className="fill-[#800020] text-[#800020]" aria-hidden="true" />
            <span className="underline decoration-dotted underline-offset-2">{rating} ({service.review_count} reviews)</span>
          </p>
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px] text-[#1C1917]">
          <strong>{unit != null ? `${options > 1 || pkg?.price_is_from ? "Starts at " : ""}${formatInr(unit)}` : "Price on inspection"}</strong>
          {mrp != null && <span className="text-[#78716C] line-through"><span className="sr-only">Original price </span>{formatInr(mrp)}</span>}
          {options === 1 && pkg?.duration_minutes ? (
            <span className="inline-flex items-center gap-1 text-[#57534E]"><span aria-hidden="true">•</span><Clock size={12} aria-hidden="true" />{durationText(pkg.duration_minutes)}</span>
          ) : null}
        </p>
        {points.length > 0 && (
          <ul className="mt-2.5 space-y-1 border-t border-dashed border-[#EAE3DC] pt-2.5">
            {points.map((p) => <li key={p} className="flex gap-1.5 text-xs text-[#57534E]"><span aria-hidden="true">•</span>{p}</li>)}
          </ul>
        )}
        {unavailable && <p className="mt-1.5 text-xs font-semibold text-[#9A3412]">Not offered in your area yet</p>}
        <button type="button" onClick={onDetails} className="mt-2.5 text-xs font-bold text-[#800020] hover:underline">View details</button>
      </div>
      <div className="flex w-[104px] shrink-0 flex-col items-center sm:w-[116px]">
        {image && (
          <div className="relative mb-[-14px] aspect-square w-full overflow-hidden rounded-lg bg-[#F3EFEC]">
            <ServiceImage src={image} alt="" fit="cover" />
          </div>
        )}
        {inCart && pkg ? (
          <div className="relative z-10 flex h-9 w-[84px] items-center justify-between rounded-lg border border-[#800020] bg-[#F6E7EB] text-sm font-bold text-[#800020] shadow-sm">
            <button type="button" aria-label={`Remove one ${service.name}`} onClick={() => updateItemQuantity(pkg.id, inCart.quantity - 1)} className="grid h-full w-7 place-items-center"><Minus size={14} /></button>
            <span aria-live="polite">{inCart.quantity}</span>
            <button type="button" aria-label={`Add one more ${service.name}`} onClick={() => updateItemQuantity(pkg.id, inCart.quantity + 1)} className="grid h-full w-7 place-items-center"><Plus size={14} /></button>
          </div>
        ) : (
          <button type="button" disabled={unavailable || !pkg}
            onClick={() => (options > 1 ? onDetails() : pkg && addToCart(service, pkg, 1, "", false))}
            aria-label={options > 1 ? `Choose an option for ${service.name}` : `Add ${service.name}`}
            className="relative z-10 h-9 w-[84px] rounded-lg border border-[#D6CBC4] bg-white text-sm font-bold text-[#800020] shadow-sm transition hover:border-[#800020] disabled:opacity-50">
            {options > 1 && qtyInCart > 0 ? `${qtyInCart} added` : "Add"}
          </button>
        )}
        {options > 1 && <span className="mt-1 text-[11px] text-[#78716C]">{options} options</span>}
      </div>
    </li>
  );
}

function PromiseCard() {
  return (
    <div className="rounded-xl border border-[#EAE3DC] p-5">
      <h2 className="text-base font-bold text-[#1C1917]">NammaPros Promise</h2>
      <ul className="mt-3 space-y-2 text-sm text-[#44403C]">
        {["Verified professionals", "Price shown before you book", `${REWORK_DAYS}-day rework on repairs`].map((t) => (
          <li key={t} className="flex items-center gap-2"><Check size={15} className="text-[#1F6B44]" aria-hidden="true" />{t}</li>
        ))}
      </ul>
    </div>
  );
}

function CartCard() {
  const { items, totalCount, totalPaise, openSheet } = useBookingCart();
  return (
    <div className="mt-4 rounded-xl border border-[#EAE3DC] p-5">
      {totalCount === 0 ? (
        <div className="py-4 text-center text-sm text-[#78716C]">
          <ShoppingBag size={28} className="mx-auto mb-2 text-[#D6CBC4]" aria-hidden="true" />
          No items in your cart
        </div>
      ) : (
        <>
          <h2 className="text-base font-bold text-[#1C1917]">Cart</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {items.map((e) => (
              <li key={e.pkg.id} className="flex justify-between gap-2">
                <span className="min-w-0 truncate text-[#44403C]">{e.quantity} × {e.pkg.name || e.service.name}</span>
                <span className="shrink-0 font-semibold">{formatInr((getPackageUnitPaise(e.service, e.pkg) ?? 0) * e.quantity)}</span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={openSheet}
            className="mt-4 flex min-h-[48px] w-full items-center justify-between rounded-lg bg-[#800020] px-4 text-sm font-bold text-white hover:bg-[#5e0017]">
            <span className="inline-flex items-center gap-1"><IndianRupee size={14} aria-hidden="true" />{(totalPaise / 100).toLocaleString("en-IN")}</span>
            <span>View cart</span>
          </button>
        </>
      )}
    </div>
  );
}
