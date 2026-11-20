"use client";

import type { HomepageBannerItem, Service, ServiceCategory } from "@nammapros/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { HOME_TILES, SubSheet, useResolver, type Target, type Tile } from "@/components/home-category-grid";

export function SpotlightBanners({ categories, services, banners }: { categories: ServiceCategory[]; services: Service[]; banners: HomepageBannerItem[] }) {
  const resolve = useResolver(categories, services);
  const [sheet, setSheet] = useState<Tile | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const items = banners.map((b) => {
    const target = b.target_url || "";
    const [kind, slug] = target.split(":", 2);
    const resolvedTarget: Target | null = kind === "category" || kind === "service" ? { kind, slug } : null;
    return {
      key: b.id,
      image: b.desktop_image_url || b.mobile_image_url || "",
      alt: b.title,
      href: resolvedTarget ? resolve(resolvedTarget) : target.startsWith("/") && !target.startsWith("//") ? target : null,
      tile: kind === "popup" ? HOME_TILES.find((t) => t.key === slug) ?? null : null,
    };
  }).filter((b) => b.image && (b.href || b.tile));

  const rowRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
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
  }, [measure, items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = rowRef.current;
    const card = el?.querySelector("li");
    if (!el || !card) return;
    el.scrollBy({ left: dir * ((card as HTMLElement).offsetWidth + 16), behavior: "smooth" }); // layout px (the page is zoomed on desktop)
  };

  if (items.length === 0) return null;

  const picture = (b: (typeof items)[number]) => (
    <Image src={b.image} alt={b.alt} width={788} height={442} unoptimized
      className="aspect-[788/442] h-auto w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
  );
  const cardClass = "group block w-full overflow-hidden rounded-2xl text-left outline-none ring-[#800020]/40 focus-visible:ring-2";
  const arrow = "absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#E2D9D0] bg-white text-[#1C1917] shadow-md transition hover:border-[#800020] hover:text-[#800020] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[#E2D9D0] disabled:hover:text-[#1C1917] sm:grid";

  return (
    <section className="container pt-10 pb-10" aria-labelledby="spotlight-heading">
      <h2 id="spotlight-heading" className="mb-4 text-xl font-bold text-[#1C1917] sm:text-2xl">In the spotlight</h2>
      <div className="relative">
        <ul ref={rowRef}
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:scroll-px-0 sm:px-0">
          {items.map((b) => (
            <li key={b.key} className="w-[86%] shrink-0 snap-start sm:w-[calc((100%-16px)/2)] lg:w-[calc((100%-32px)/3)]">
              {b.href ? (
                <Link href={b.href} className={cardClass}>{picture(b)}</Link>
              ) : (
                <button type="button" onClick={() => setSheet(b.tile)} aria-haspopup="dialog" className={cardClass}>{picture(b)}</button>
              )}
            </li>
          ))}
        </ul>

        {items.length > 1 && (
          <>
            <button type="button" onClick={() => scrollBy(-1)} disabled={edges.start} aria-label="Previous banner" className={`${arrow} left-0 -translate-x-1/2`}>
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={() => scrollBy(1)} disabled={edges.end} aria-label="Next banner" className={`${arrow} right-0 translate-x-1/2`}>
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>
      {sheet && <SubSheet tile={sheet} resolve={resolve} onClose={closeSheet} />}
    </section>
  );
}
