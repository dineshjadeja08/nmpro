"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronsUpDown,
  Copy,
  Loader2,
  MapPin,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { api } from "../lib/api";

type CategoryItem = {
  id: string;
  name: string;
  is_active: boolean;
};

type ServiceItem = {
  id: string;
  name: string;
  category_id: string;
  category_name?: string;
  starting_price_paise: number;
  is_active: boolean;
};

type ZoneItem = {
  id: string;
  name: string;
  city: string;
  postal_code: string;
  locality_aliases?: string[];
};

type SuggestionItem = {
  id: string;
  description: string;
  main_text: string;
  secondary_text: string;
  city?: string;
  postal_code?: string;
  locality?: string;
  sourceKind: "places" | "zone";
};

export type LeadRecord = {
  id: string;
  lead_reference: string;
  customer_name: string;
  mobile_number: string;
  alternate_mobile?: string;
  email?: string;
  service_category_id: string;
  service_category: string;
  service_id: string;
  service: string;
  service_price_paise?: number;
  service_items?: Array<{ service_id: string; quantity: number }>;
  quoted_amount_paise?: number;
  advance_amount_paise?: number;
  manual_paid_paise?: number;
  payment_status?: string;
  payment_link_url?: string;
  zone_id?: string | null;
  zone_name?: string | null;
  problem_description?: string;
  address?: string;
  landmark?: string;
  area?: string;
  city?: string;
  pincode?: string;
  latitude?: number | null;
  longitude?: number | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  urgency?: string;
  source: string;
  status: string;
  priority: string;
  assigned_to?: number | null;
  assigned_to_phone?: string | null;
  follow_up_at?: string | null;
  internal_notes?: string;
  converted_booking_id?: string | null;
  created_at: string;
  updated_at: string;
  activities?: Array<{
    kind: string;
    detail: Record<string, unknown>;
    created_at: string;
    actor_id?: number | null;
  }>;
};

function formatInrFromPaise(paise: number): string {
  const rupees = (Number(paise) || 0) / 100;
  const hasDecimals = rupees % 1 !== 0;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  return raw.trim();
}

function isValidIndianPhone(raw: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(normalizePhone(raw));
}

function AutoRefreshBar({
  onRefresh,
  refreshing,
  lastUpdated,
}: {
  onRefresh: () => void;
  refreshing?: boolean;
  lastUpdated: Date | null;
}) {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const update = () => {
      if (!lastUpdated) {
        setSecondsAgo(0);
        return;
      }
      setSecondsAgo(Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 5000);
    return () => window.clearInterval(timer);
  }, [lastUpdated]);

  return (
    <div className="mb-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs shadow-xs">
      <div className="flex items-center gap-2 text-slate-600">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-medium text-slate-700">Auto-refresh every 15 seconds</span>
        <span className="text-slate-400">· Last updated {secondsAgo}s ago</span>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-teal-700 disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        <span>Refresh</span>
      </button>
    </div>
  );
}

function LeadServiceCombobox({
  services,
  value,
  onChange,
  loading,
}: {
  services: ServiceItem[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const activeServices = useMemo(
    () =>
      services.filter(
        (s) => s.is_active && s.name.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [services, search]
  );

  const selected = services.find((s) => s.id === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        id="lead-service"
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={loading}
        onClick={() => setOpen((o) => !o)}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
        className="flex h-[48px] w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 text-left text-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15 disabled:bg-slate-50"
      >
        <span className={selected ? "font-medium text-slate-900" : "text-slate-400"}>
          {loading ? "Loading services..." : selected?.name || "Select service"}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services"
              className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-teal-700"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {activeServices.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">No services found.</p>
            ) : (
              activeServices.map((svc) => (
                <button
                  key={svc.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(svc.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm hover:bg-teal-50"
                >
                  <div>
                    <span className="font-medium text-slate-900">{svc.name}</span>
                    {svc.starting_price_paise > 0 && (
                      <span className="ml-2 text-xs text-slate-400">
                        {formatInrFromPaise(svc.starting_price_paise)}
                      </span>
                    )}
                  </div>
                  {svc.id === value && <Check className="h-4 w-4 text-teal-700" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function roundCoord(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(6));
}

function LeadAddressCombobox({
  value,
  zones,
  onChange,
  onResolve,
}: {
  value: string;
  zones: ZoneItem[];
  onChange: (val: string) => void;
  onResolve: (resolved: {
    address: string;
    city: string;
    area: string;
    pincode: string;
    latitude: number | null;
    longitude: number | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [places, setPlaces] = useState<SuggestionItem[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const matchingZones = useMemo<SuggestionItem[]>(() => {
    const q = value.trim().toLowerCase();
    const list = q.length < 2
      ? zones.slice(0, 6)
      : zones.filter(
          (z) =>
            z.name.toLowerCase().includes(q) ||
            z.city.toLowerCase().includes(q) ||
            z.postal_code.includes(q) ||
            (z.locality_aliases ?? []).some((a) => a.toLowerCase().includes(q))
        );
    return list.slice(0, 6).map((z) => ({
      id: `zone_${z.id}`,
      description: `${z.name}, ${z.city}, Tamil Nadu ${z.postal_code}`,
      main_text: z.name,
      secondary_text: `${z.city} · ${z.postal_code}`,
      city: z.city,
      postal_code: z.postal_code,
      locality: z.name,
      sourceKind: "zone",
    }));
  }, [value, zones]);

  useEffect(() => {
    const q = value.trim();
    const current = ++reqId.current;
    if (!open || q.length < 2) {
      setPlaces([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api<{
          suggestions?: Array<{
            id: string;
            description: string;
            main_text?: string;
            secondary_text?: string;
            city?: string;
            postal_code?: string;
            locality?: string;
          }>;
        }>(`/location/autocomplete/?input=${encodeURIComponent(q)}`);
        if (reqId.current !== current) return;
        setPlaces(
          (res.suggestions ?? []).slice(0, 6).map((s) => ({
            id: s.id,
            description: s.description,
            main_text: s.main_text || s.description,
            secondary_text: s.secondary_text || "",
            city: s.city,
            postal_code: s.postal_code,
            locality: s.locality || s.main_text,
            sourceKind: "places",
          }))
        );
      } catch {
        if (reqId.current === current) setPlaces([]);
      } finally {
        if (reqId.current === current) setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, value]);

  const combined = useMemo(() => {
    const seen = new Set<string>();
    const out: SuggestionItem[] = [];
    for (const s of [...places, ...matchingZones]) {
      const k = s.description.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(s);
      }
    }
    return out.slice(0, 8);
  }, [places, matchingZones]);

  const pick = async (item: SuggestionItem) => {
    setSearching(true);
    try {
      let placeId = item.id;
      if (item.sourceKind === "zone") {
        const autoRes = await api<{ suggestions?: Array<{ id: string }> }>(
          `/location/autocomplete/?input=${encodeURIComponent(`${item.locality || item.main_text}, ${item.city || ""} ${item.postal_code || ""}`)}`
        ).catch(() => ({ suggestions: [] }));
        placeId = autoRes.suggestions?.[0]?.id || "";
      }

      if (placeId) {
        const resolved = await api<{
          formatted_address?: string;
          city?: string;
          locality?: string;
          postal_code?: string;
          latitude?: number | null;
          longitude?: number | null;
        }>(`/location/geocode/?place_id=${encodeURIComponent(placeId)}`);
        onResolve({
          address: resolved.formatted_address || item.description,
          city: item.city || resolved.city || "Chennai",
          area: item.locality || resolved.locality || item.main_text,
          pincode: item.postal_code || resolved.postal_code || "",
          latitude: roundCoord(resolved.latitude),
          longitude: roundCoord(resolved.longitude),
        });
      } else {
        onResolve({
          address: item.description,
          city: item.city || "Chennai",
          area: item.locality || item.main_text,
          pincode: item.postal_code || "",
          latitude: null,
          longitude: null,
        });
      }
    } catch {
      onResolve({
        address: item.description,
        city: item.city || "Chennai",
        area: item.locality || item.main_text,
        pincode: item.postal_code || "",
        latitude: null,
        longitude: null,
      });
    } finally {
      setSearching(false);
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="lead-address"
          type="text"
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          placeholder="Start typing an address"
          autoComplete="off"
          className="h-[48px] w-full rounded-lg border border-slate-200 bg-white pl-11 pr-10 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
        />
        {searching && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal-700" />
        )}
      </div>

      {open && combined.length > 0 && (
        <div className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
          {combined.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void pick(item)}
              className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-teal-50/70"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{item.main_text}</p>
                <p className="text-xs text-slate-500 truncate">
                  {item.secondary_text || item.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminLeadCreateScreen({
  onCreated,
  onBack,
}: {
  onCreated: (leadId: string) => void;
  onBack: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [pincode, setPincode] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadMetadata = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const [catRes, svcRes, zoneRes] = await Promise.all([
        api<{ results?: CategoryItem[] }>("/admin/categories/"),
        api<{ results?: ServiceItem[] }>("/admin/services/"),
        api<{ results?: ZoneItem[] }>("/service-areas/").catch(() => ({ results: [] })),
      ]);
      setCategories((catRes.results ?? []).filter((c) => c.is_active));
      setServices((svcRes.results ?? []).filter((s) => s.is_active));
      setZones(zoneRes.results ?? []);
      setLastUpdated(new Date());
    } catch {
      // keep existing state if partial load fails
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  const categoryServices = useMemo(
    () => (categoryId ? services.filter((s) => s.category_id === categoryId) : []),
    [services, categoryId]
  );

  const canSubmit =
    customerName.trim().length > 0 &&
    isValidIndianPhone(mobileNumber) &&
    Boolean(categoryId) &&
    Boolean(serviceId) &&
    address.trim().length > 0 &&
    city.trim().length > 0 &&
    !busy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<{ id: string }>("/operations/leads/", "POST", {
        customer_name: customerName.trim(),
        mobile_number: normalizePhone(mobileNumber),
        service_category_id: categoryId,
        service_id: serviceId,
        address: address.trim().slice(0, 200),
        area: area.trim() || undefined,
        city: city.trim(),
        pincode: /^\d{6}$/.test(pincode.trim()) ? pincode.trim() : undefined,
        latitude,
        longitude,
        source: "PHONE_CALL",
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] flex-col">
      <AutoRefreshBar
        onRefresh={() => void loadMetadata()}
        refreshing={loadingCatalog}
        lastUpdated={lastUpdated}
      />

      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Create Request</h1>

      <form
        id="create-lead-form"
        onSubmit={handleSubmit}
        className="mx-auto mt-6 w-full max-w-[680px] flex-1 space-y-5 pb-24"
      >
        {/* Card 1: Customer & Service */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="lead-customer-name" className="mb-1.5 block text-sm font-semibold text-slate-900">
                Customer Name<span className="text-red-500">*</span>
              </label>
              <input
                id="lead-customer-name"
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-[48px] w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              />
            </div>

            <div>
              <label htmlFor="lead-mobile" className="mb-1.5 block text-sm font-semibold text-slate-900">
                Mobile Number<span className="text-red-500">*</span>
              </label>
              <input
                id="lead-mobile"
                type="tel"
                inputMode="tel"
                required
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="h-[48px] w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              />
              {mobileNumber.trim().length > 0 && !isValidIndianPhone(mobileNumber) && (
                <p className="mt-1 text-xs font-medium text-red-600">Enter a valid 10-digit Indian mobile number.</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="lead-service-category" className="mb-1.5 block text-sm font-semibold text-slate-900">
                Service Category<span className="text-red-500">*</span>
              </label>
              <select
                id="lead-service-category"
                required
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setServiceId("");
                }}
                className="h-[48px] w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              >
                <option value="">Select a service category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="lead-service" className="mb-1.5 block text-sm font-semibold text-slate-900">
                Select Service<span className="text-red-500">*</span>
              </label>
              <LeadServiceCombobox
                services={categoryServices}
                value={serviceId}
                onChange={setServiceId}
                loading={!categoryId || loadingCatalog}
              />
            </div>
          </div>
        </section>

        {/* Card 2: Create Address */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-xl font-medium text-slate-900">Create Address</h2>

          <div className="mt-6 space-y-5">
            <div>
              <label htmlFor="lead-address" className="mb-1.5 block text-sm font-semibold text-slate-900">
                Address<span className="text-red-500">*</span>
              </label>
              <LeadAddressCombobox
                value={address}
                zones={zones}
                onChange={(val) => {
                  setAddress(val);
                  if (!val.trim()) {
                    setPincode("");
                    setArea("");
                    setLatitude(null);
                    setLongitude(null);
                  }
                }}
                onResolve={(resolved) => {
                  setAddress(resolved.address);
                  setCity(resolved.city);
                  setArea(resolved.area);
                  setPincode(resolved.pincode);
                  setLatitude(resolved.latitude);
                  setLongitude(resolved.longitude);
                }}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Choose a Google Maps address suggestion to resolve city, pincode, and coordinates.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="lead-city" className="mb-1.5 block text-sm font-semibold text-slate-900">
                  City<span className="text-red-500">*</span>
                </label>
                <input
                  id="lead-city"
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Choose an address to fill the city"
                  className="h-[48px] w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                />
              </div>

              <div>
                <label htmlFor="lead-pincode" className="mb-1.5 block text-sm font-semibold text-slate-900">
                  Pincode
                </label>
                <input
                  id="lead-pincode"
                  type="text"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Auto-resolved 6-digit PIN"
                  className="h-[48px] w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
                />
              </div>
            </div>

            {latitude !== null && longitude !== null && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3.5 py-2.5 text-xs text-teal-900">
                <span className="font-semibold">
                  Resolved Coordinates: <code className="font-mono">{latitude.toFixed(6)}, {longitude.toFixed(6)}</code>
                </span>
                {area && <span className="text-teal-700">Area: {area}</span>}
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}
      </form>

      {/* Bottom Sticky Mint Action Bar */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-auto border-t border-slate-200 bg-[#edf6f5]/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[680px] items-center justify-center gap-8">
          <button
            type="button"
            onClick={onBack}
            className="min-h-10 px-4 text-sm font-bold text-slate-900 hover:text-teal-700"
          >
            Back
          </button>
          <button
            type="submit"
            form="create-lead-form"
            disabled={!canSubmit}
            className="inline-flex min-w-32 items-center justify-center gap-2 rounded-full bg-[#0f766e] px-6 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-[#115e59] disabled:bg-[#82b6b1] disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating</span>
              </>
            ) : (
              "Create"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminLeadDetailWorkspace({
  leadId,
  canEdit,
  onNavigate,
}: {
  leadId: string;
  canEdit: boolean;
  onNavigate?: (url: string) => void;
}) {
  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  // Edit panel state
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    customer_name: "",
    mobile_number: "",
    service_id: "",
    address: "",
    city: "",
    area: "",
    pincode: "",
    latitude: null as number | null,
    longitude: null as number | null,
    status: "NEW",
    internal_notes: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Close ticket confirm dialog
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingTicket, setClosingTicket] = useState(false);

  // Schedule Job modal
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // Add services draft quantities
  const [draftQuantities, setDraftQuantities] = useState<Record<string, number> | null>(null);
  const [savingServices, setSavingServices] = useState(false);

  // Right card conversion & payment state
  const [conversionNotes, setConversionNotes] = useState("");
  const [paymentChannel, setPaymentChannel] = useState<"SMS" | "WHATSAPP">("SMS");
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [conversionPending, setConversionPending] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadAll = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError("");
      try {
        const [leadRes, svcRes, zoneRes] = await Promise.all([
          api<LeadRecord>(`/operations/leads/${leadId}/`),
          api<{ results?: ServiceItem[] }>("/admin/services/"),
          api<{ results?: ZoneItem[] }>("/service-areas/").catch(() => ({ results: [] })),
        ]);
        setLead(leadRes);
        setServices(svcRes.results ?? []);
        setZones(zoneRes.results ?? []);
        setLastUpdated(new Date());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load lead details.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [leadId]
  );

  useEffect(() => {
    void loadAll(false);
    const interval = window.setInterval(() => void loadAll(true), 15000);
    return () => window.clearInterval(interval);
  }, [loadAll]);

  const startEdit = () => {
    if (!lead) return;
    setEditValues({
      customer_name: lead.customer_name,
      mobile_number: lead.mobile_number,
      service_id: lead.service_id,
      address: lead.address ?? "",
      city: lead.city ?? "",
      area: lead.area ?? "",
      pincode: lead.pincode ?? "",
      latitude: lead.latitude ?? null,
      longitude: lead.longitude ?? null,
      status: lead.status,
      internal_notes: lead.internal_notes ?? "",
    });
    setEditing(true);
  };

  const categoryServices = useMemo(() => {
    if (!lead) return [];
    return services.filter(
      (s) => s.is_active && s.category_id === lead.service_category_id
    );
  }, [lead, services]);

  const savedQuantities = useMemo<Record<string, number>>(() => {
    if (!lead) return {};
    const map: Record<string, number> = {};
    const items = lead.service_items?.length
      ? lead.service_items
      : [{ service_id: lead.service_id, quantity: 1 }];
    for (const item of items) {
      if (item.service_id && item.quantity > 0) {
        map[item.service_id] = item.quantity;
      }
    }
    if (!map[lead.service_id]) {
      map[lead.service_id] = 1;
    }
    return map;
  }, [lead]);

  const effectiveQuantities = draftQuantities ?? savedQuantities;
  const dirtyServices = draftQuantities !== null;

  const lineItems = useMemo(() => {
    const out: Array<{ id: string; name: string; unit: number; unitPaise: number }> = [];
    for (const [sid, qty] of Object.entries(effectiveQuantities)) {
      if (qty <= 0) continue;
      const svc = services.find((s) => s.id === sid);
      if (svc) {
        out.push({ id: svc.id, name: svc.name, unit: qty, unitPaise: svc.starting_price_paise });
      } else if (lead && sid === lead.service_id) {
        out.push({
          id: lead.service_id,
          name: lead.service,
          unit: qty,
          unitPaise: lead.service_price_paise ?? 0,
        });
      }
    }
    return out;
  }, [effectiveQuantities, services, lead]);

  const subTotalPaise = lineItems.reduce((sum, l) => sum + l.unit * l.unitPaise, 0);
  const taxPaise = 0;
  const trainingFeePaise = 0;
  const totalPaise = subTotalPaise + taxPaise + trainingFeePaise;

  const saveEdit = async () => {
    if (!lead) return;
    setSavingEdit(true);
    setActionError("");
    setNotice("");
    try {
      const payload: Record<string, unknown> = {
        customer_name: editValues.customer_name.trim(),
        mobile_number: normalizePhone(editValues.mobile_number),
        service_id: editValues.service_id,
        address: editValues.address.trim(),
        city: editValues.city.trim(),
        area: editValues.area.trim(),
        pincode: /^\d{6}$/.test(editValues.pincode.trim()) ? editValues.pincode.trim() : "",
        latitude: editValues.latitude,
        longitude: editValues.longitude,
        internal_notes: editValues.internal_notes,
      };
      if (editValues.status !== lead.status && editValues.status !== "CONVERTED") {
        payload.status = editValues.status;
        if (editValues.status === "LOST") {
          payload.loss_reason = editValues.internal_notes.trim() || "Marked lost by admin";
        }
      }
      const updated = await api<LeadRecord>(`/operations/leads/${lead.id}/`, "PATCH", payload);
      setLead(updated);
      setEditing(false);
      setNotice("Lead details updated.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not update lead.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!lead) return;
    setClosingTicket(true);
    setActionError("");
    try {
      const updated = await api<LeadRecord>(`/operations/leads/${lead.id}/`, "PATCH", {
        status: "CANCELLED",
      });
      setLead(updated);
      setCloseOpen(false);
      setNotice("Ticket closed.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not close ticket.");
    } finally {
      setClosingTicket(false);
    }
  };

  const handleSaveServices = async () => {
    if (!lead || !draftQuantities) return;
    setSavingServices(true);
    setActionError("");
    setNotice("");
    try {
      const service_items = Object.entries(draftQuantities)
        .filter(([, q]) => q > 0)
        .map(([service_id, quantity]) => ({ service_id, quantity }));
      const updated = await api<LeadRecord>(`/operations/leads/${lead.id}/`, "PATCH", {
        service_items,
      });
      setLead(updated);
      setDraftQuantities(null);
      setNotice("Services updated for this lead.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not update services.");
    } finally {
      setSavingServices(false);
    }
  };

  const handleScheduleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !schedDate) return;
    setScheduling(true);
    setActionError("");
    try {
      const updated = await api<LeadRecord>(`/operations/leads/${lead.id}/schedule/`, "POST", {
        preferred_date: schedDate,
        preferred_time: schedTime || null,
      });
      setLead(updated);
      setScheduleOpen(false);
      setNotice("Job schedule updated.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not schedule job.");
    } finally {
      setScheduling(false);
    }
  };

  const handleSendPaymentLink = async (scope: "FULL" | "ADVANCE") => {
    if (!lead) return;
    setPaymentPending(true);
    setActionError("");
    setNotice("");
    try {
      const amount = scope === "ADVANCE" ? Math.round(totalPaise * 0.25) : totalPaise;
      const res = await api<{ payment_status: string; payment_link_url?: string; payment_delivery_status?: string }>(
        `/operations/leads/${lead.id}/send-payment-link/`,
        "POST",
        {
          channel: paymentChannel,
          payment_scope: scope,
          amount_paise: Math.max(amount, 100),
        }
      );
      setNotice(
        res.payment_link_url
          ? `Payment link created (${res.payment_status}).`
          : `Payment link logged (${res.payment_delivery_status ?? res.payment_status}).`
      );
      await loadAll(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not send payment link.");
    } finally {
      setPaymentPending(false);
    }
  };

  const handleConvertWorkOrder = async () => {
    if (!lead) return;
    setConversionPending(true);
    setActionError("");
    setNotice("");
    try {
      const updated = await api<LeadRecord>(`/operations/leads/${lead.id}/convert/`, "POST", {
        notes: conversionNotes.trim(),
      });
      setLead(updated);
      setNotice("Work order created from lead!");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not create work order.");
    } finally {
      setConversionPending(false);
    }
  };

  const copyPaymentLink = async () => {
    if (!lead?.payment_link_url) return;
    await navigator.clipboard.writeText(lead.payment_link_url);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1500);
  };

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-teal-700" />
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-sm text-red-700">
        {error || "Lead not found."}
      </div>
    );
  }

  const isClosed = ["CANCELLED", "LOST", "CONVERTED"].includes(lead.status);
  const fullLocation = [lead.address, lead.area, lead.city, lead.pincode].filter(Boolean).join(", ");
  const displayStatus = lead.status === "NEW" ? "OPEN" : lead.status;
  const scheduledText = lead.preferred_date
    ? `${lead.preferred_date}${lead.preferred_time ? ` at ${lead.preferred_time.slice(0, 5)}` : ""}`
    : "Not scheduled";

  return (
    <div className="space-y-5">
      <AutoRefreshBar
        onRefresh={() => void loadAll(true)}
        refreshing={refreshing}
        lastUpdated={lastUpdated}
      />

      {/* Top Navigation & Title Row */}
      <header className="space-y-1">
        <a
          href="/leads"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0f766e] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Lead List</span>
        </a>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Lead #{lead.lead_reference}
          </h1>
          {canEdit && lead.status !== "CONVERTED" && (
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : startEdit())}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>{editing ? "Cancel" : "Edit"}</span>
            </button>
          )}
        </div>
      </header>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          {notice}
        </div>
      )}
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {actionError}
        </div>
      )}

      {/* Main 2-Column Workspace */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,1fr)] lg:items-start">
        {/* Left Card: Lead Overview */}
        {editing ? (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Customer</label>
                <input
                  value={editValues.customer_name}
                  onChange={(e) => setEditValues({ ...editValues, customer_name: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Mob Number</label>
                <input
                  value={editValues.mobile_number}
                  onChange={(e) => setEditValues({ ...editValues, mobile_number: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">Service</label>
                <select
                  value={editValues.service_id}
                  onChange={(e) => setEditValues({ ...editValues, service_id: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">Address</label>
                <LeadAddressCombobox
                  value={editValues.address}
                  zones={zones}
                  onChange={(address) => setEditValues({ ...editValues, address })}
                  onResolve={(r) =>
                    setEditValues({
                      ...editValues,
                      address: r.address,
                      city: r.city,
                      area: r.area,
                      pincode: r.pincode,
                      latitude: r.latitude,
                      longitude: r.longitude,
                    })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">City</label>
                <input
                  value={editValues.city}
                  onChange={(e) => setEditValues({ ...editValues, city: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Pincode</label>
                <input
                  value={editValues.pincode}
                  maxLength={6}
                  onChange={(e) => setEditValues({ ...editValues, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Area / Locality</label>
                <input
                  value={editValues.area}
                  onChange={(e) => setEditValues({ ...editValues, area: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Coordinates (Lat, Lng)</label>
                <input
                  readOnly
                  value={
                    editValues.latitude != null && editValues.longitude != null
                      ? `${Number(editValues.latitude).toFixed(6)}, ${Number(editValues.longitude).toFixed(6)}`
                      : "Select a Google Maps suggestion"
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Status</label>
                <select
                  value={editValues.status}
                  onChange={(e) => setEditValues({ ...editValues, status: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                >
                  {["NEW", "CONTACTED", "FOLLOW_UP", "QUALIFIED", "LOST", "CANCELLED"].map((s) => (
                    <option key={s} value={s}>
                      {s === "NEW" ? "OPEN" : s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">Internal Notes</label>
                <textarea
                  rows={3}
                  value={editValues.internal_notes}
                  onChange={(e) => setEditValues({ ...editValues, internal_notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => void saveEdit()}
                className="rounded-full bg-[#0f766e] px-5 py-2 text-xs font-bold text-white hover:bg-[#115e59] disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <dl>
              {[
                ["Service", lead.service || "-"],
                ["Customer", lead.customer_name],
                ["Mob Number", lead.mobile_number.replace(/^\+91/, "")],
                ["Location", fullLocation || "-"],
                ...(lead.latitude != null && lead.longitude != null
                  ? [["Coordinates", `${Number(lead.latitude).toFixed(6)}, ${Number(lead.longitude).toFixed(6)}`]]
                  : []),
                ["Assigned Location", lead.zone_name || "NA"],
                ["Created on", new Date(lead.created_at).toLocaleString("en-US", {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })],
                ["Source", lead.source],
                ["Status", displayStatus],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className="grid gap-1 border-b border-slate-100 px-6 py-4 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-5"
                >
                  <dt className="text-xs font-bold text-slate-900">{label}</dt>
                  <dd className="text-xs leading-5 text-slate-600 break-words">{val}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-1 px-6 py-4 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center sm:gap-5">
              <span className="text-xs font-bold text-slate-900">Close Ticket:</span>
              <div>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={closingTicket || isClosed}
                    onClick={() => setCloseOpen(true)}
                    className="text-xs font-bold text-[#0f766e] hover:underline disabled:opacity-50"
                  >
                    {lead.status === "CANCELLED" || lead.status === "LOST" ? "Closed" : "Close"}
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">{isClosed ? "Closed" : "Open"}</span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Right Card: Line items */}
        <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="border-b border-slate-200 pb-4 text-lg font-bold text-slate-900">Line items</h2>

          {lineItems.length === 0 ? (
            <div className="grid min-h-40 place-items-center text-xs text-slate-400">No Line Items</div>
          ) : (
            <>
              <table className="mt-4 w-full table-fixed text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2.5 font-semibold w-[55%]">Package</th>
                    <th className="pb-2.5 font-semibold w-[20%]">Unit</th>
                    <th className="pb-2.5 font-semibold text-right w-[25%]">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="py-3.5 pr-2 font-semibold text-slate-900">{item.name}</td>
                      <td className="py-3.5 text-slate-700">{item.unit}</td>
                      <td className="py-3.5 text-right font-semibold text-slate-900">
                        {formatInrFromPaise(item.unit * item.unitPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="ml-auto mt-4 max-w-[220px] space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Sub Total</dt>
                  <dd className="font-semibold text-slate-900">{formatInrFromPaise(subTotalPaise)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Tax</dt>
                  <dd className="font-semibold text-slate-900">{formatInrFromPaise(taxPaise)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Training fee</dt>
                  <dd className="font-semibold text-slate-900">{formatInrFromPaise(trainingFeePaise)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2.5 text-sm font-black text-slate-900">
                  <dt>TOTAL</dt>
                  <dd>{formatInrFromPaise(totalPaise)}</dd>
                </div>
              </dl>
            </>
          )}

          {/* Schedule Job Row */}
          <div className="mt-5 flex items-center justify-between border-y border-slate-200 py-3.5 text-xs">
            <div>
              <p className="font-bold text-slate-900">Schedule Job:</p>
              <p className="mt-0.5 text-slate-500">{scheduledText}</p>
            </div>
            {canEdit && lead.status !== "CONVERTED" && (
              <button
                type="button"
                onClick={() => {
                  setSchedDate(lead.preferred_date || new Date().toISOString().slice(0, 10));
                  setSchedTime(lead.preferred_time ? lead.preferred_time.slice(0, 5) : "10:00");
                  setScheduleOpen(true);
                }}
                className="font-bold text-[#0f766e] hover:underline"
              >
                Update
              </button>
            )}
          </div>

          {/* Notes & Payment/Convert Actions */}
          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={conversionNotes}
              onChange={(e) => setConversionNotes(e.target.value)}
              placeholder="Conversion notes (optional)"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-700"
            />

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Send payment link by</label>
              <select
                value={paymentChannel}
                onChange={(e) => {
                  setPaymentChannel(e.target.value as "SMS" | "WHATSAPP");
                  setWhatsappConsent(false);
                }}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-teal-700"
              >
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </div>

            {paymentChannel === "WHATSAPP" && (
              <label className="flex items-start gap-2 text-[11px] leading-4 text-slate-500">
                <input
                  type="checkbox"
                  checked={whatsappConsent}
                  onChange={(e) => setWhatsappConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Customer has agreed to receive this service and payment message on WhatsApp.</span>
              </label>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={
                  !canEdit ||
                  paymentPending ||
                  dirtyServices ||
                  (paymentChannel === "WHATSAPP" && !whatsappConsent)
                }
                onClick={() => void handleSendPaymentLink("FULL")}
                className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Send Payment Link
              </button>
              <button
                type="button"
                disabled={!lead.payment_link_url}
                onClick={() => void copyPaymentLink()}
                aria-label="Copy payment link"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
              <button
                type="button"
                disabled={
                  !canEdit ||
                  conversionPending ||
                  lead.status === "CONVERTED" ||
                  dirtyServices
                }
                onClick={() => void handleConvertWorkOrder()}
                className="flex-1 rounded-full bg-[#0f766e] px-3 py-2 text-xs font-bold text-white hover:bg-[#115e59] disabled:bg-[#8ec1bc]"
              >
                {conversionPending
                  ? "Creating..."
                  : lead.status === "CONVERTED"
                  ? "Converted"
                  : "Create work order"}
              </button>
            </div>

            <button
              type="button"
              disabled={
                !canEdit ||
                paymentPending ||
                totalPaise <= 0 ||
                dirtyServices ||
                (paymentChannel === "WHATSAPP" && !whatsappConsent)
              }
              onClick={() => void handleSendPaymentLink("ADVANCE")}
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Send Advance Link
            </button>

            {lead.converted_booking_id && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-center justify-between">
                <span>Work order created</span>
                <button
                  type="button"
                  onClick={() =>
                    onNavigate
                      ? onNavigate(`/bookings/${lead.converted_booking_id}`)
                      : (window.location.href = `/bookings/${lead.converted_booking_id}`)
                  }
                  className="font-bold underline"
                >
                  Open Work Order →
                </button>
              </div>
            )}

            {lead.payment_link_url && (
              <a
                href={lead.payment_link_url}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-xs font-semibold text-[#0f766e] hover:underline"
              >
                {lead.payment_link_url}
              </a>
            )}
          </div>

          <div className="mt-5 text-[11px] leading-5 text-slate-500">
            <p>( Before Confirming workorder verify the details )</p>
            <p className="mt-2.5 font-bold text-slate-900">Note</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>A professional partner will contact you within 10 - 20 minutes.</li>
              <li>After discussing your requirements, a service estimate will be shared before starting the work.</li>
            </ol>
          </div>
        </aside>
      </div>

      {/* Add Services Grid */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add services</h2>
            <p className="text-xs text-slate-500">
              Choose additional {lead.service_category || "related"} services and quantities for this lead.
            </p>
          </div>
          {canEdit && lead.status !== "CONVERTED" && (
            <button
              type="button"
              disabled={!dirtyServices || savingServices}
              onClick={() => void handleSaveServices()}
              className="rounded-full bg-[#0f766e] px-5 py-2 text-xs font-bold text-white hover:bg-[#115e59] disabled:bg-[#8ec1bc]"
            >
              {savingServices ? "Saving..." : "Save services"}
            </button>
          )}
        </div>

        <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {categoryServices.length === 0 ? (
            <p className="col-span-full py-6 text-center text-xs text-slate-400">
              No active services in this category.
            </p>
          ) : (
            categoryServices.map((svc) => {
              const qty = effectiveQuantities[svc.id] ?? 0;
              const isPrimary = svc.id === lead.service_id;
              return (
                <article
                  key={svc.id}
                  className={`flex min-h-[88px] items-center justify-between gap-3 rounded-lg border p-4 transition ${
                    qty > 0
                      ? "border-[#0f766e]/50 bg-[#edf6f5]/50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 leading-5">
                      {svc.name}
                      {isPrimary && (
                        <span className="ml-1.5 text-[11px] font-medium text-slate-400">Primary</span>
                      )}
                    </h3>
                    <p className="mt-1.5 text-xs font-semibold text-slate-600">
                      {formatInrFromPaise(svc.starting_price_paise)}
                    </p>
                  </div>

                  {qty > 0 ? (
                    <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-full border border-[#0f766e] bg-white text-[#0f766e]">
                      <button
                        type="button"
                        disabled={!canEdit || (isPrimary && qty <= 1)}
                        onClick={() => {
                          const next = { ...effectiveQuantities };
                          if (qty <= 1) delete next[svc.id];
                          else next[svc.id] = qty - 1;
                          setDraftQuantities(next);
                        }}
                        className="grid h-8 w-8 place-items-center hover:bg-teal-50 disabled:opacity-40"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-6 text-center text-xs font-bold">{qty}</span>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          setDraftQuantities({ ...effectiveQuantities, [svc.id]: qty + 1 })
                        }
                        className="grid h-8 w-8 place-items-center hover:bg-teal-50 disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setDraftQuantities({ ...effectiveQuantities, [svc.id]: 1 })}
                      className="rounded-full border border-[#0f766e] px-4 py-1.5 text-xs font-bold text-[#0f766e] hover:bg-[#edf6f5] disabled:opacity-40"
                    >
                      Add
                    </button>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>

      {/* Bottom: Activity timeline */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-slate-900">Activity timeline</h2>
        {lead.activities && lead.activities.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-100">
            {lead.activities.map((a, idx) => (
              <li key={idx} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                <div>
                  <span className="font-bold text-slate-900">{a.kind.replace(/_/g, " ")}</span>
                  {a.detail && Object.keys(a.detail).length > 0 && (
                    <span className="ml-2 text-slate-500">{JSON.stringify(a.detail)}</span>
                  )}
                </div>
                <span className="text-slate-400">
                  {new Date(a.created_at).toLocaleString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-400">No activity recorded yet.</p>
        )}
      </section>

      {/* Schedule Job Modal */}
      {scheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Calendar className="h-4 w-4 text-[#0f766e]" />
                <span>Schedule Job</span>
              </h3>
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleScheduleSave} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Preferred Date</label>
                <input
                  type="date"
                  required
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Preferred Time</label>
                <input
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduling}
                  className="rounded-full bg-[#0f766e] px-5 py-2 text-xs font-bold text-white hover:bg-[#115e59] disabled:opacity-50"
                >
                  {scheduling ? "Saving..." : "Save Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Ticket Confirmation Dialog */}
      {closeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">Close this ticket?</h3>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">
                  The lead will be marked closed. Existing activity and payment records will remain available.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCloseOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloseOpen(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={closingTicket}
                onClick={() => void handleCloseTicket()}
                className="rounded-full bg-[#0f766e] px-5 py-2 text-xs font-bold text-white hover:bg-[#115e59] disabled:opacity-50"
              >
                {closingTicket ? "Closing..." : "Close ticket"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
