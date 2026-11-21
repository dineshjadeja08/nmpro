"use client";

import type { Service, ServiceCategory } from "@nammapros/types";
import { Sparkles, X, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useId, useRef, useState } from "react";
import { useServiceLocation } from "@/components/location-provider";
import { categoryHref, serviceHref } from "@/lib/services";

/**
 * Home page category tiles (3 columns). Each tile either opens a sheet of service categories or links straight
 * to its category. Targets are matched against the live catalogue by slug.
 */
export type Target = { kind: "category" | "service"; slug: string };
type Sub = { label: string; target: Target; image?: string; icon?: LucideIcon };
export type Tile = { key: string; label: string; image?: string; icon?: LucideIcon; subs?: Sub[]; target?: Target };

const CAT = (slug: string): Target => ({ kind: "category", slug });
/** Appliance pictures with the grey square removed (transparent copies of the category icons). */
const IMG = (name: string) => `/images/home-icons/appliances/${name}.png`;
/** NammaPros home and pop-up icons (transparent PNGs). */
const HOME = (name: string) => `/images/home-icons/${name}.png`;

export const HOME_TILES: Tile[] = [
  {
    key: "deep-cleaning", label: "Deep Cleaning", image: HOME("deep-cleaning"),
    subs: [
      { label: "Bathroom Cleaning", target: CAT("bathroom-cleaning"), image: HOME("bathroom-cleaning") },
      { label: "Kitchen Cleaning", target: CAT("kitchen-cleaning"), image: HOME("kitchen-cleaning") },
      { label: "Full House Cleaning", target: CAT("full-house-cleaning"), image: HOME("full-house-cleaning") },
    ],
  },
  {
    key: "handyman", label: "Handyman", image: HOME("handyman"),
    subs: [
      { label: "Electrician", target: CAT("electrician"), image: HOME("electrician") },
      { label: "Plumber", target: CAT("plumber"), image: HOME("plumber") },
      { label: "Carpenter", target: CAT("carpenter"), image: HOME("carpenter") },
    ],
  },
  {
    key: "appliances", label: "Appliance Services", image: HOME("appliance-services"),
    subs: [
      { label: "AC", target: CAT("ac"), image: IMG("ac") },
      { label: "Washing Machine", target: CAT("washing-machine"), image: IMG("washing-machine") },
      { label: "Geyser", target: CAT("geyser"), image: IMG("geyser") },
      { label: "Refrigerator", target: CAT("refrigerator"), image: IMG("refrigerator") },
      { label: "TV", target: CAT("tv"), image: IMG("tv") },
      { label: "Water Purifier", target: CAT("water-purifier"), image: IMG("water-purifier") },
      { label: "CCTV", target: CAT("cctv"), image: IMG("cctv") },
      { label: "Microwave", target: CAT("microwave-oven"), image: IMG("microwave-oven") },
      { label: "Dishwasher", target: CAT("dishwasher"), image: IMG("dishwasher") },
    ],
  },
  { key: "water-tank", label: "Water Tank Cleaning", image: HOME("water-tank-cleaning"), target: CAT("water-tank-cleaning") },
  { key: "mosquito", label: "Mosquito Net", image: HOME("mosquito-net"), target: CAT("mosquito-net") },
  { key: "sofa", label: "Sofa Repair", image: HOME("sofa-repair"), target: CAT("sofa") },
];

export function useResolver(categories: ServiceCategory[], services: Service[]) {
  const city = useServiceLocation().location?.city;
  const cats = new Set(categories.filter((c) => c.is_active !== false).map((c) => c.slug));
  const svcs = new Map(services.filter((s) => s.is_active !== false).map((s) => [s.slug, s]));
  return (t: Target): string | null => {
    if (t.kind === "category") return cats.has(t.slug) ? categoryHref(t.slug, city) : null;
    const s = svcs.get(t.slug);
    return s ? serviceHref(s, city) : null;
  };
}

function Picture({ image, icon: Icon, label, size }: { image?: string; icon?: LucideIcon; label: string; size: number }) {
  if (image) {
    return <Image src={image} alt="" width={size} height={size} className={`h-full w-full object-contain p-1.5 ${image.includes("/home-icons/") ? "" : "mix-blend-multiply"}`} unoptimized />;
  }
  const I = Icon ?? Sparkles;
  return <I aria-hidden="true" size={Math.round(size * 0.42)} strokeWidth={1.5} className="text-[#800020]" data-label={label} />;
}

export function HomeCategoryGrid({ categories, services }: { categories: ServiceCategory[]; services: Service[] }) {
  const resolve = useResolver(categories, services);
  const [open, setOpen] = useState<Tile | null>(null);

  return (
    <>
      <ul className="grid grid-cols-3 gap-x-3 gap-y-3 sm:gap-x-4 sm:gap-y-4">
        {HOME_TILES.map((tile) => {
          const direct = tile.target ? resolve(tile.target) : null;
          const inner = (
            <>
              <span className="flex aspect-[4/3] w-full items-center justify-center">
                <span className="flex h-[82%] w-[82%] items-center justify-center transition-transform duration-200 ease-out group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                  <Picture image={tile.image} icon={tile.icon} label={tile.label} size={96} />
                </span>
              </span>
              <span className="mt-1 block text-center text-[12px] font-semibold leading-tight text-[#1C1917] sm:text-[13px]">{tile.label}</span>
            </>
          );
          return (
            <li key={tile.key}>
              {tile.subs ? (
                <button type="button" onClick={() => setOpen(tile)} className="group block w-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#800020]/40" aria-haspopup="dialog">
                  {inner}
                </button>
              ) : direct ? (
                <Link href={direct} className="group block">{inner}</Link>
              ) : (
                <span className="group block opacity-60" aria-disabled="true">
                  {inner}
                  <span className="mt-0.5 block text-center text-[10px] font-semibold text-[#9A3412]">Coming soon</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {open && <SubSheet tile={open} resolve={resolve} onClose={() => setOpen(null)} />}
    </>
  );
}

export function SubSheet({ tile, resolve, onClose }: { tile: Tile; resolve: (t: Target) => string | null; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 shadow-xl sm:rounded-2xl sm:pb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-[#1C1917]">{tile.label}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="grid h-10 w-10 place-items-center rounded-full bg-[#F3EFEC] text-[#1C1917] hover:bg-[#EAE3DC]">
            <X size={18} />
          </button>
        </div>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-4">
          {tile.subs!.map((sub) => {
            const href = resolve(sub.target);
            const boxless = Boolean(sub.image?.includes("/home-icons/"));
            const inner = (
              <>
                <span className={`flex w-full items-center justify-center ${boxless ? "aspect-[4/3]" : "aspect-square overflow-hidden rounded-xl bg-[#F3EFEC] transition group-hover:bg-[#EFE6E1]"}`}>
                  <span className={`flex items-center justify-center ${boxless ? "h-[82%] w-[82%]" : "h-[74%] w-[74%]"} transition-transform duration-200 ease-out group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100`}>
                    <Picture image={sub.image} icon={sub.icon} label={sub.label} size={80} />
                  </span>
                </span>
                <span className="mt-1.5 block text-center text-[12px] font-semibold leading-tight text-[#1C1917]">{sub.label}</span>
              </>
            );
            return (
              <li key={sub.label}>
                {href ? (
                  <Link href={href} onClick={onClose} className="group block">{inner}</Link>
                ) : (
                  <span className="block opacity-60" aria-disabled="true">
                    {inner}
                    <span className="mt-0.5 block text-center text-[10px] font-semibold text-[#9A3412]">Coming soon</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
