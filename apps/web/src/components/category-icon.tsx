"use client";

import type { ServiceCategory } from "@nammapros/types";
import {
  AirVent,
  Camera,
  Droplets,
  Flame,
  Hammer,
  Microwave,
  Paintbrush,
  PlugZap,
  Refrigerator,
  Shield,
  Sofa,
  Sparkles,
  Tv,
  WashingMachine,
  Wind,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import React, { useState } from "react";
import { getCategoryIconSrc } from "@/lib/service-images";

const SLUG_PUBLIC_ICON: Record<string, string> = {
  ac: "/images/category-icons/ac.png",
  "ac-service": "/images/category-icons/ac.png",
  "washing-machine": "/images/category-icons/washing-machine.png",
  refrigerator: "/images/category-icons/refrigerator.png",
  tv: "/images/category-icons/tv.png",
  geyser: "/images/category-icons/geyser.png",
  "water-purifier": "/images/category-icons/water-purifier.png",
  "microwave-oven": "/images/category-icons/microwave-oven.png",
  dishwasher: "/images/category-icons/dishwasher.png",
  cctv: "/images/category-icons/cctv.png",
  chimney: "/images/category-icons/chimney.png",
  "water-tank-cleaning": "/images/category-icons/water-tank-cleaning.png",
  "mosquito-net": "/images/category-icons/mosquito-net.png",
  sofa: "/images/category-icons/sofa.png",
};

const SLUG_LUCIDE_ICON: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  ac: AirVent,
  "ac-service": AirVent,
  "washing-machine": WashingMachine,
  refrigerator: Refrigerator,
  tv: Tv,
  "tv-repair": Tv,
  "water-purifier": Droplets,
  "water-tank": Droplets,
  "water-tank-cleaning": Droplets,
  geyser: Flame,
  microwave: Microwave,
  chimney: Wind,
  sofa: Sofa,
  "sofa-repair": Sofa,
  "mosquito-net": Shield,
  cctv: Camera,
  plumbing: Droplets,
  electrical: PlugZap,
  electrician: PlugZap,
  carpentry: Hammer,
  painting: Paintbrush,
  cleaning: Sparkles,
  appliances: Wrench,
};

function isLocalBackendUrl(src?: string | null) {
  return Boolean(src?.startsWith("http://127.0.0.1:8000/") || src?.startsWith("http://localhost:8000/"));
}

export function CategoryIcon({
  category,
  size = 44,
  fillContainer = false,
}: {
  category: Pick<ServiceCategory, "slug" | "name" | "icon_url">;
  size?: number;
  fillContainer?: boolean;
}) {
  const uploadedIcon = getCategoryIconSrc(category);
  const slugKey = category.slug.toLowerCase();
  const builtInPublicIcon = SLUG_PUBLIC_ICON[slugKey] ?? null;
  const src = uploadedIcon || builtInPublicIcon;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    if (fillContainer) {
      return (
        <Image
          src={src}
          alt=""
          fill
          sizes="(min-width: 1024px) 160px, 120px"
          unoptimized={isLocalBackendUrl(src) || src.endsWith(".svg")}
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
        />
      );
    }
    return (
      <span
        className="relative grid place-items-center overflow-hidden rounded-md bg-[#FAF6F2]"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          unoptimized={isLocalBackendUrl(src) || src.endsWith(".svg")}
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-contain"
        />
      </span>
    );
  }

  const LucideIcon = SLUG_LUCIDE_ICON[slugKey];
  if (LucideIcon) {
    return (
      <span
        className={
          fillContainer
            ? "grid h-full w-full place-items-center rounded-md bg-[#F5E6EA] text-[#800020]"
            : "grid place-items-center rounded-md bg-[#F5E6EA] text-[#800020]"
        }
        style={fillContainer ? undefined : { width: size, height: size }}
        aria-hidden="true"
      >
        <LucideIcon size={fillContainer ? 40 : Math.round(size * 0.52)} strokeWidth={1.75} />
      </span>
    );
  }

  const initial = (category.name?.trim().charAt(0) || category.slug?.trim().charAt(0) || "N").toUpperCase();
  return (
    <span
      className={
        fillContainer
          ? "grid h-full w-full place-items-center rounded-md bg-[#F5E6EA] font-serif text-3xl font-bold text-[#800020]"
          : "grid place-items-center rounded-md bg-[#F5E6EA] font-serif text-lg font-bold text-[#800020]"
      }
      style={fillContainer ? undefined : { width: size, height: size }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
