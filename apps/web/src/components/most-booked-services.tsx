"use client";

import type { Service } from "@nammapros/types";
import { ChevronLeft, ChevronRight, Minus, Plus, Sparkles } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getPackageUnitPaise, pickDefaultPackage, useBookingCart } from "@/components/booking-cart-provider";
import { ServiceDetailModal } from "@/components/service-detail-modal";
import { ServiceImage } from "@/components/service-image";
import { isUnavailableHere, useZoneService } from "@/components/zone-pricing-provider";
import { serviceListImage } from "@/lib/service-images";
import { formatInr } from "@/lib/services";

/** Home page row: picture, name, price and an Add button per service. The picture or name opens the service pop-up. */
export function MostBookedServices({ services, title = "Most booked services", id = "most-booked" }: { services: Service[]; title?: string; id?: string }) {
  const rowRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [open, setOpen] = useState<Service | null>(null);

  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const t = window.setTimeout(measure, 0);
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(t);
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure, services.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = rowRef.current;
    const card = el?.querySelector("li");
    if (el && card) el.scrollBy({ left: dir * ((card as HTMLElement).offsetWidth + 16) * 2, behavior: "smooth" }); // layout px (the page is zoomed on desktop)
  };

  if (services.length === 0) return null;

  return (
    <section className="container pb-10" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="mb-4 text-xl font-bold text-[#1C1917] sm:text-2xl">{title}</h2>
      <div className="relative">
        <ul ref={rowRef}
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:scroll-px-0 sm:px-0">
          {services.map((s) => (
            <li key={s.id} className="w-[44%] shrink-0 snap-start sm:w-[calc((100%-32px)/3)] lg:w-[calc((100%-64px)/5)]">
              <Card service={s} onOpen={setOpen} />
            </li>
          ))}
        </ul>
        {!edges.start && (
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Previous services"
            className="absolute left-0 top-[38%] hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#E2D9D0] bg-white text-[#1C1917] shadow-md hover:border-[#800020] hover:text-[#800020] sm:grid">
            <ChevronLeft size={20} />
          </button>
        )}
        {!edges.end && (
          <button type="button" onClick={() => scrollBy(1)} aria-label="More services"
            className="absolute right-0 top-[38%] hidden h-11 w-11 -translate-y-1/2 translate-x-1/2 place-items-center rounded-full border border-[#E2D9D0] bg-white text-[#1C1917] shadow-md hover:border-[#800020] hover:text-[#800020] sm:grid">
            <ChevronRight size={20} />
          </button>
        )}
      </div>
      {open && <ServiceDetailModal service={open} syncUrl={false} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Card({ service: base, onOpen }: { service: Service; onOpen: (s: Service) => void }) {
  const service = useZoneService(base);
  const { items, addToCart, updateItemQuantity } = useBookingCart();
  const pkg = pickDefaultPackage(service);
  const options = service.packages?.length ?? 0;
  const unit = getPackageUnitPaise(service, pkg);
  const mrp = pkg?.mrp_paise ?? pkg?.original_price_paise ?? null;
  const inCart = pkg ? items.find((i) => i.pkg.id === pkg.id) : undefined;
  const unavailable = isUnavailableHere(pkg);
  const img = serviceListImage(service);

  const add = () => {
    if (options > 1) return onOpen(base); // several options: choose in the pop-up
    if (pkg) addToCart(service, pkg, 1, "", false);
  };

  return (
    <article>
      <div className="relative">
        <button type="button" onClick={() => onOpen(base)} aria-label={`Open ${service.name}`}
          className="group relative block aspect-square w-full overflow-hidden rounded-2xl bg-[#F4EFE9] outline-none ring-[#800020]/40 focus-visible:ring-2">
          {img ? (
            <ServiceImage src={img} alt="" fit="cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[#800020]/60"><Sparkles size={28} /></span>
          )}
        </button>

        <div className="absolute -bottom-3 right-2 flex flex-col items-center">
          {inCart && options <= 1 ? (
            <span className="inline-flex h-9 items-center rounded-lg border border-[#800020]/30 bg-white text-[#800020] shadow-sm">
              <button type="button" aria-label={`One less ${service.name}`} onClick={() => updateItemQuantity(inCart.pkg.id, inCart.quantity - 1)} className="grid h-9 w-8 place-items-center">
                <Minus size={14} />
              </button>
              <span className="min-w-[16px] text-center text-sm font-bold">{inCart.quantity}</span>
              <button type="button" aria-label={`One more ${service.name}`} disabled={inCart.quantity >= 10} onClick={() => updateItemQuantity(inCart.pkg.id, inCart.quantity + 1)} className="grid h-9 w-8 place-items-center disabled:opacity-40">
                <Plus size={14} />
              </button>
            </span>
          ) : (
            <button type="button" disabled={unavailable || !pkg} onClick={add}
              className="h-9 min-w-[72px] rounded-lg border border-[#E2D9D0] bg-white px-4 text-sm font-bold text-[#800020] shadow-sm transition hover:border-[#800020] disabled:opacity-50">
              Add
            </button>
          )}
          {options > 1 && <span className="mt-0.5 rounded bg-white/90 px-1 text-[10px] text-[#78716C]">{options} options</span>}
        </div>
      </div>

      <button type="button" onClick={() => onOpen(base)} className="mt-5 block text-left">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-[#1C1917] hover:text-[#800020]">{service.name}</h3>
      </button>
      <p className="mt-1 text-sm">
        {unavailable ? (
          <span className="text-[#78716C]">Not available in your area</span>
        ) : unit != null ? (
          <>
            <span className="font-semibold text-[#1C1917]">{pkg?.price_is_from ? "From " : ""}{formatInr(unit)}</span>
            {mrp != null && mrp > unit && <span className="ml-1.5 text-[#A8A29E] line-through">{formatInr(mrp)}</span>}
          </>
        ) : (
          <span className="text-[#57534E]">Price after inspection</span>
        )}
      </p>
    </article>
  );
}
