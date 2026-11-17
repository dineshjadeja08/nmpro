"use client";

import type { Service, ServiceCategory } from "@nammapros/types";
import { ArrowLeft, ArrowUpRight, Home, Loader2, MapPin, Navigation, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useId, useRef, useState } from "react";
import { useServiceLocation, type SelectedServiceLocation } from "@/components/location-provider";
import { bookingApi, bookingRequest, type Address, type LocationSuggestion } from "@/lib/booking-api";
import { categoryHref, serviceHref } from "@/lib/services";

/** Full-height sheet on phones, centred panel on larger screens. Esc / ✕ / ← close it. */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
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
    <div className="fixed inset-0 z-[80] bg-black/40 sm:flex sm:items-start sm:justify-center sm:pt-[8vh]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-white sm:h-auto sm:max-h-[80vh] sm:max-w-xl sm:rounded-2xl sm:shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder, onClose, busy }: {
  value: string; onChange: (v: string) => void; placeholder: string; onClose: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="flex items-center gap-3 border-b border-[#F0EBE7] p-3 sm:p-4">
      <div className="flex min-h-[52px] flex-1 items-center gap-3 rounded-xl border border-[#57534E]/60 px-3 focus-within:border-[#800020]">
        <button type="button" onClick={onClose} aria-label="Back" className="grid h-9 w-9 place-items-center text-[#1C1917]"><ArrowLeft size={20} /></button>
        <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[#1C1917] outline-none placeholder:text-[#9C928A]" />
        {busy && <Loader2 size={16} className="animate-spin text-[#800020]" aria-hidden="true" />}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#F3EFEC] text-[#1C1917] hover:bg-[#EAE3DC]"><X size={20} /></button>
    </div>
  );
}

function Row({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-4 border-b border-[#F3EFEC] px-4 py-3.5 text-left hover:bg-[#FBF8F5] sm:px-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F3EFEC] text-[#1C1917]">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-[#1C1917]">{title}</span>
          {subtitle && <span className="block truncate text-xs text-[#57534E]">{subtitle}</span>}
        </span>
        <ArrowUpRight size={18} className="shrink-0 text-[#9C928A]" aria-hidden="true" />
      </button>
    </li>
  );
}

const FALLBACK_TRENDING = ["AC service", "Water tank cleaning", "Washing machine repair", "Refrigerator repair", "Water purifier", "Sofa repair"];

/** Service search pop-up: trending searches, then live results (categories and services) as you type. */
export function ServiceSearchSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const city = useServiceLocation().location?.city;
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [trending, setTrending] = useState<Service[]>([]);
  const [results, setResults] = useState<Service[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bookingRequestSafe<{ categories: ServiceCategory[] }>("/service-categories/").then((r) => r && setCategories(r.categories));
    bookingRequestSafe<{ services: Service[] }>("/services/?popular=true&limit=6").then((r) => r && setTrending(r.services));
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = window.setTimeout(() => {
      setBusy(true);
      bookingRequestSafe<{ services: Service[] }>(`/services/?q=${encodeURIComponent(term)}&limit=12`)
        .then((r) => setResults(r?.services ?? []))
        .finally(() => setBusy(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const go = (href: string) => { onClose(); router.push(href); };
  const term = q.trim().toLowerCase();
  const matchedCats = term.length >= 2 ? categories.filter((c) => c.name.toLowerCase().includes(term)).slice(0, 4) : [];

  return (
    <Sheet label="Search for services" onClose={onClose}>
      <SearchBar value={q} onChange={setQ} placeholder="Search for services (e.g. AC, Cleaning…)" onClose={onClose} busy={busy} />
      <div className="flex-1 overflow-y-auto pb-6">
        {term.length < 2 ? (
          <>
            <h2 className="px-4 pt-5 pb-2 text-lg font-bold text-[#1C1917] sm:px-5">Trending searches</h2>
            <ul>
              {trending.length > 0
                ? trending.map((s) => <Row key={s.id} icon={<Search size={17} />} title={s.name} onClick={() => go(serviceHref(s, city))} />)
                : FALLBACK_TRENDING.map((t) => <Row key={t} icon={<Search size={17} />} title={t} onClick={() => setQ(t)} />)}
            </ul>
          </>
        ) : (
          <ul aria-live="polite">
            {matchedCats.map((c) => <Row key={c.id} icon={<Search size={17} />} title={c.name} subtitle="Category" onClick={() => go(categoryHref(c.slug, city))} />)}
            {results.map((s) => <Row key={s.id} icon={<Search size={17} />} title={s.name} subtitle={s.category_name} onClick={() => go(serviceHref(s, city))} />)}
            {!busy && matchedCats.length === 0 && results.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-[#57534E]">No services match “{q.trim()}”. Try another word, like “AC” or “cleaning”.</li>
            )}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

async function bookingRequestSafe<T>(path: string): Promise<T | null> {
  try {
    return await bookingRequest<T>(path);
  } catch {
    return null;
  }
}

/** Location pop-up: search location/society/apartment, use current location, saved addresses. */
export function LocationSearchSheet({ onClose }: { onClose: () => void }) {
  const { setLocation } = useServiceLocation();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [saved, setSaved] = useState<Address[] | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const savedId = useId();

  useEffect(() => {
    bookingApi.addresses().then((r) => setSaved(r.addresses)).catch(() => { setSignedIn(false); setSaved([]); });
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) return;
    const t = window.setTimeout(() => {
      setBusy(true);
      bookingApi.locationAutocomplete(term).then((r) => setSuggestions(r.suggestions)).catch(() => setSuggestions([])).finally(() => setBusy(false));
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  async function choose(resolved: Omit<SelectedServiceLocation, "supported" | "service_area_name">) {
    setBusy(true);
    setMessage("");
    let supported: boolean | null = null;
    let areaName: string | null = null;
    try {
      const check = await bookingApi.serviceAreaCheck({ postal_code: resolved.postal_code, city: resolved.city, locality: resolved.locality });
      supported = check.supported;
      areaName = check.service_area?.name ?? null;
    } catch {
      supported = null;
    }
    setLocation({ ...resolved, supported, service_area_name: areaName });
    setBusy(false);
    onClose();
  }

  const pickSuggestion = async (s: LocationSuggestion) => {
    setBusy(true);
    try {
      await choose(await bookingApi.locationGeocode(s.id));
    } catch {
      setBusy(false);
      setMessage("Could not find that place. Try another search.");
    }
  };

  const useCurrent = () => {
    if (!navigator.geolocation) { setMessage("Location is not available on this device."); return; }
    setBusy(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await choose(await bookingApi.locationReverseGeocode(pos.coords.latitude, pos.coords.longitude));
        } catch {
          setBusy(false);
          setMessage("Could not read your current location. Search instead.");
        }
      },
      (err) => {
        setBusy(false);
        setMessage(err.code === err.PERMISSION_DENIED ? "Location permission is blocked. Allow it in your browser, or search instead." : "Could not get your location. Search instead.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const pickSaved = (a: Address) => choose({
    formatted_address: [a.house_flat, a.street, a.locality, a.city, a.postal_code].filter(Boolean).join(", "),
    house_flat: a.house_flat, street: a.street, locality: a.locality, city: a.city, state: a.state,
    postal_code: a.postal_code, latitude: a.latitude ?? null, longitude: a.longitude ?? null,
  });

  return (
    <Sheet label="Choose your location" onClose={onClose}>
      <SearchBar value={q} onChange={setQ} placeholder="Search for your location/society/apartment" onClose={onClose} busy={busy} />
      <div className="flex-1 overflow-y-auto pb-6">
        {q.trim().length >= 3 ? (
          <ul aria-live="polite">
            {suggestions.map((s) => (
              <Row key={s.id} icon={<MapPin size={17} />} title={s.main_text || s.description} subtitle={s.secondary_text} onClick={() => void pickSuggestion(s)} />
            ))}
            {!busy && suggestions.length === 0 && <li className="px-5 py-8 text-center text-sm text-[#57534E]">No places found. Try a nearby landmark or your PIN code.</li>}
          </ul>
        ) : (
          <>
            <button type="button" onClick={useCurrent} disabled={busy}
              className="flex w-full items-center gap-3 border-b-8 border-[#F3EFEC] px-4 py-4 text-left text-[15px] font-semibold text-[#800020] sm:px-5 disabled:opacity-60">
              <Navigation size={18} aria-hidden="true" /> Use current location
            </button>
            {message && <p role="alert" className="px-5 pt-3 text-sm font-semibold text-[#9A3412]">{message}</p>}
            {signedIn && (
              <section aria-labelledby={savedId}>
                <h2 id={savedId} className="px-4 pt-5 pb-2 text-lg font-bold text-[#1C1917] sm:px-5">Saved</h2>
                {saved === null ? (
                  <p className="flex items-center justify-center gap-2 py-6 text-sm text-[#57534E]"><Loader2 size={16} className="animate-spin text-[#800020]" aria-hidden="true" /> Loading saved addresses…</p>
                ) : saved.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-[#57534E]">No saved addresses yet.</p>
                ) : (
                  <ul>
                    {saved.map((a) => (
                      <Row key={a.id} icon={<Home size={17} />} title={a.label || a.locality}
                        subtitle={[a.house_flat, a.street, a.locality, a.city].filter(Boolean).join(", ")} onClick={() => void pickSaved(a)} />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
