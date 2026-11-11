"use client";

import { MapPin } from "lucide-react";
import { useServiceLocation } from "@/components/location-provider";

/**
 * Interactive hero eyebrow pill linking visitors directly to the location picker.
 */
export function HeroLocationPill() {
  const { location, openPicker } = useServiceLocation();

  const areaLabel = location
    ? [location.locality, location.city].filter(Boolean).slice(0, 2).join(", ") || location.formatted_address
    : null;

  const pillText = areaLabel
    ? location?.supported === false
      ? `${areaLabel} · Outside current zone`
      : `Serving ${areaLabel} · Same-day slots`
    : "Serving Chennai & Tamil Nadu · Same-day slots";

  return (
    <button
      type="button"
      onClick={openPicker}
      aria-label={areaLabel ? `Change service location, currently ${areaLabel}` : "Select your service location"}
      className="inline-flex items-center gap-1.5 rounded-md border border-[#800020]/18 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#800020] shadow-2xs transition hover:border-[#800020] hover:bg-[#FAF6F2]"
    >
      <MapPin size={12} strokeWidth={2} className="shrink-0" />
      <span>{pillText}</span>
    </button>
  );
}
