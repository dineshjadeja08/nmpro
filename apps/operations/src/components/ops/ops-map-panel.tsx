"use client";

import { MapPin } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { getStatusMeta } from "@/lib/status";

export type MapPinItem = {
  id: string;
  label: string;
  subtitle?: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
  addressText?: string;
  onSelect?: () => void;
};

type GoogleMapsApi = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
      fitBounds: (b: unknown) => void;
      setCenter: (pos: { lat: number; lng: number }) => void;
    };
    LatLngBounds: new () => { extend: (pos: { lat: number; lng: number }) => void };
    Marker: new (opts: Record<string, unknown>) => {
      addListener: (event: string, cb: () => void) => void;
      setMap: (map: unknown) => void;
    };
    SymbolPath: { CIRCLE: unknown };
  };
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
  }
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function loadGoogleMapsScript(apiKey: string): Promise<GoogleMapsApi> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-op-gmaps='1']");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google);
        else reject(new Error("Google Maps loaded without maps API."));
      });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps.")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.dataset.opGmaps = "1";
    script.onload = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps unavailable."));
    };
    script.onerror = () => reject(new Error("Could not load Google Maps JS API."));
    document.body.appendChild(script);
  });
}

export function MapPanel({
  title = "Live operations map",
  pins,
  heightClass = "h-64",
}: {
  title?: string;
  pins: MapPinItem[];
  heightClass?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState("");
  const pinnedCoords = pins.filter((p) => typeof p.lat === "number" && typeof p.lng === "number");

  useEffect(() => {
    if (!MAPS_KEY || pinnedCoords.length === 0 || !containerRef.current) return;
    let cancelled = false;
    const markers: { setMap: (m: unknown) => void }[] = [];

    loadGoogleMapsScript(MAPS_KEY)
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        const first = pinnedCoords[0];
        const map = new g.maps.Map(containerRef.current, {
          center: { lat: first.lat as number, lng: first.lng as number },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
        });
        const bounds = new g.maps.LatLngBounds();
        for (const pin of pinnedCoords) {
          const meta = getStatusMeta(pin.status);
          const pos = { lat: pin.lat as number, lng: pin.lng as number };
          bounds.extend(pos);
          const marker = new g.maps.Marker({
            position: pos,
            map,
            title: `${pin.label}${pin.subtitle ? ` · ${pin.subtitle}` : ""}`,
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: meta.dotColor,
              fillOpacity: 1,
              strokeColor: "#FFFFFF",
              strokeWeight: 2,
            },
          });
          if (pin.onSelect) {
            marker.addListener("click", pin.onSelect);
          }
          markers.push(marker);
        }
        if (pinnedCoords.length > 1) {
          map.fitBounds(bounds);
        }
      })
      .catch((err) => {
        if (!cancelled) setMapError(err instanceof Error ? err.message : "Map unavailable.");
      });

    return () => {
      cancelled = true;
      for (const m of markers) m.setMap(null);
    };
  }, [pinnedCoords]);

  return (
    <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-3 shadow-[var(--op-shadow)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--op-text)]">
          <MapPin className="h-4 w-4 text-[var(--op-brand)]" />
          <span>{title}</span>
        </div>
        <span className="text-[11px] text-[var(--op-muted)]">
          {pinnedCoords.length} geolocated · {pins.length} total
        </span>
      </div>

      {MAPS_KEY && pinnedCoords.length > 0 && !mapError ? (
        <div ref={containerRef} className={`${heightClass} w-full rounded border border-[var(--op-border)]`} />
      ) : (
        <div className="rounded border border-dashed border-[var(--op-border)] bg-[var(--op-surface-alt)] p-3">
          <p className="text-[12px] text-[var(--op-muted)]">
            {mapError
              ? mapError
              : !MAPS_KEY
                ? "Google Maps key not configured (set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in apps/operations/.env.local). Showing live job locations below."
                : "Today's booking & technician endpoints do not include GPS coordinates yet; click any job below to open its drawer."}
          </p>
          {pins.length > 0 && (
            <div className="mt-2.5 grid max-h-44 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {pins.slice(0, 12).map((pin) => {
                const meta = getStatusMeta(pin.status);
                return (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={pin.onSelect}
                    className="flex items-start gap-2 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1.5 text-left hover:border-[var(--op-brand)]"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: meta.dotColor }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold text-[var(--op-text)]">
                        {pin.label}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--op-muted)]">
                        {pin.addressText || pin.subtitle || meta.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
