"use client";

import { MapPin, Navigation } from "lucide-react";
import React, { useEffect, useState } from "react";
import { bookingApi, type TechnicianLocation } from "@/lib/booking-api";

const POLL_MS = 15000;
const CITY_SPEED_KMH = 18;

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Shows where the technician is while they travel to the customer (polls every 15 seconds). */
export function TechnicianLiveLocation({ bookingId, status }: { bookingId: string; status: string }) {
  const travelling = status === "TECHNICIAN_EN_ROUTE";
  const [location, setLocation] = useState<TechnicianLocation | null>(null);

  useEffect(() => {
    if (!travelling) return;
    let active = true;
    const load = () =>
      bookingApi
        .technicianLocation(bookingId)
        .then((data) => active && setLocation(data))
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [bookingId, travelling]);

  if (!travelling || !location) return null;
  if (!location.sharing || location.latitude == null || location.longitude == null) {
    return (
      <p className="rounded-md bg-[#FBF8F5] px-3 py-2 text-xs text-[#57534E]" role="status">
        Your pro is on the way. Live location will appear here once their phone shares it.
      </p>
    );
  }
  const here = { latitude: location.latitude, longitude: location.longitude };
  const km = location.destination ? distanceKm(here, location.destination) : null;
  const minutes = km != null ? Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60)) : null;
  const updated = location.updated_at
    ? new Date(location.updated_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : "";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${here.latitude},${here.longitude}`;

  return (
    <section
      aria-label="Technician live location"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E8E1DB] bg-white p-3"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F3EAF8] text-[#6B3FA0]" aria-hidden="true">
          <Navigation size={18} strokeWidth={1.75} />
        </span>
        <div aria-live="polite">
          <p className="text-sm font-bold text-[#1C1917]">
            {minutes != null ? `About ${minutes} min away` : "On the way"}
            {km != null && <span className="font-normal text-[#57534E]"> · {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</span>}
          </p>
          {updated && <p className="text-[11px] text-[#78716C]">Location updated at {updated}</p>}
        </div>
      </div>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[#D6CEC6] px-3 text-xs font-bold text-[#1C1917]"
      >
        <MapPin size={14} strokeWidth={1.75} className="text-[#800020]" /> View on map
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </section>
  );
}
