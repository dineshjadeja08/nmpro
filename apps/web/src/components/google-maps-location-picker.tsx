"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, LocateFixed, Loader2, MapPin } from "lucide-react";
import { bookingApi, type LocationSuggestion, type ServiceAreaCheckResult } from "@/lib/booking-api";

export type PickedLocationResult = {
  formatted_address: string;
  house_flat: string;
  street: string;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  serviceability?: ServiceAreaCheckResult | null;
};

function roundCoord(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(6));
}

export function GoogleMapsLocationPicker({
  onLocationSelected,
  initialQuery = "",
  checkServiceability = false,
  title = "Search area, street or landmark (Google Maps)",
}: {
  onLocationSelected: (address: PickedLocationResult) => void;
  initialQuery?: string;
  checkServiceability?: boolean;
  title?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "warn" | "error"; text: string } | null>(null);
  const reqId = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const checkCoverageIfNeeded = async (resolved: {
    postal_code?: string;
    city?: string;
    locality?: string;
  }): Promise<ServiceAreaCheckResult | null> => {
    if (!checkServiceability) return null;
    try {
      return await bookingApi.serviceAreaCheck({
        postal_code: resolved.postal_code,
        city: resolved.city,
        locality: resolved.locality,
      });
    } catch {
      return null;
    }
  };

  const handleSearch = (val: string) => {
    setQuery(val);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const clean = val.trim();
    const currentReq = ++reqId.current;
    if (clean.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = window.setTimeout(async () => {
      try {
        const res = await bookingApi.locationAutocomplete(clean);
        if (reqId.current === currentReq) {
          setSuggestions(res.suggestions || []);
        }
      } catch {
        if (reqId.current === currentReq) setSuggestions([]);
      } finally {
        if (reqId.current === currentReq) setLoading(false);
      }
    }, 250);
  };

  const applyResolved = async (
    resolved: {
      formatted_address?: string;
      house_flat?: string;
      street?: string;
      locality?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      latitude?: number | null;
      longitude?: number | null;
    },
    fallbackLabel = "",
    fromGps = false
  ) => {
    const coverage = await checkCoverageIfNeeded({
      postal_code: resolved.postal_code,
      city: resolved.city,
      locality: resolved.locality || fallbackLabel,
    });
    const result: PickedLocationResult = {
      formatted_address: resolved.formatted_address || fallbackLabel || [resolved.locality, resolved.city, resolved.postal_code].filter(Boolean).join(", "),
      house_flat: resolved.house_flat || "",
      street: resolved.street || "",
      locality: resolved.locality || fallbackLabel,
      city: resolved.city || "Chennai",
      state: resolved.state || "Tamil Nadu",
      postal_code: resolved.postal_code || "",
      latitude: roundCoord(resolved.latitude),
      longitude: roundCoord(resolved.longitude),
      serviceability: coverage,
    };
    onLocationSelected(result);
    setSuggestions([]);
    setQuery(result.formatted_address);

    const areaLabel = result.locality || result.city;
    const pinSuffix = result.postal_code ? ` (${result.postal_code})` : "";
    if (coverage) {
      if (coverage.supported) {
        const zoneLabel = coverage.service_area?.name || areaLabel;
        setNotice({
          kind: "success",
          text: `${fromGps ? "Current location detected" : "Pinned"}: ${zoneLabel}${pinSuffix} — Service available`,
        });
      } else {
        setNotice({
          kind: "warn",
          text: `${fromGps ? "Current location detected" : "Pinned"}: ${areaLabel}${pinSuffix} — Not serviceable yet`,
        });
      }
    } else {
      setNotice({
        kind: "success",
        text: `${fromGps ? "Location detected" : "Pinned"}: ${areaLabel}${pinSuffix}`,
      });
    }
  };

  const handleSelectSuggestion = async (s: LocationSuggestion) => {
    setLoading(true);
    setNotice(null);
    try {
      const resolved = await bookingApi.locationGeocode(s.id);
      await applyResolved(resolved, s.main_text, false);
    } catch {
      setNotice({ kind: "error", text: "Could not resolve location. Please enter manually." });
    } finally {
      setLoading(false);
    }
  };

  const handleDetectGPS = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setNotice({ kind: "error", text: "Geolocation is not supported by your browser." });
      return;
    }
    setDetecting(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));
          const resolved = await bookingApi.locationReverseGeocode(lat, lng);
          await applyResolved(resolved, "", true);
        } catch {
          setNotice({ kind: "error", text: "Could not resolve GPS address. Please search above." });
        } finally {
          setDetecting(false);
        }
      },
      () => {
        setNotice({ kind: "error", text: "Location permission denied. Search for your area or landmark." });
        setDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[#ebd0d7] bg-[#fdf8f9] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#800020]">
          <MapPin className="h-4 w-4" />
          <span>{title}</span>
        </label>
        <button
          type="button"
          disabled={detecting}
          onClick={handleDetectGPS}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-[#800020] hover:bg-[#f6e7eb] disabled:opacity-50"
        >
          {detecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LocateFixed className="h-3.5 w-3.5" />
          )}
          <span>{detecting ? "Detecting location..." : "Use current location"}</span>
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search area, street, landmark, or 6-digit PIN..."
          autoComplete="off"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 pr-9 text-sm font-medium text-slate-900 outline-none focus:border-[#800020]"
        />
        {loading && (
          <div className="absolute right-3 top-3">
            <Loader2 className="h-4 w-4 animate-spin text-[#800020]" />
          </div>
        )}
      </div>

      {notice && (
        <p
          className={`flex items-center gap-1.5 text-xs font-semibold ${
            notice.kind === "error"
              ? "text-red-700"
              : notice.kind === "warn"
                ? "text-amber-800"
                : "text-emerald-800"
          }`}
        >
          {notice.kind === "success" ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>{notice.text}</span>
        </p>
      )}

      {suggestions.length > 0 && (
        <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => handleSelectSuggestion(s)}
                className="flex w-full items-start gap-2.5 p-3 text-left text-xs transition hover:bg-[#f6e7eb]"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#800020]" />
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{s.main_text}</p>
                  <p className="truncate text-[11px] text-slate-500">{s.secondary_text || s.description}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
