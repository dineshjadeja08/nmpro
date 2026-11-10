"use client";

import { CheckCircle2, ChevronDown, MapPin, Menu, Search, TriangleAlert, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "./brand";
import { GoogleMapsLocationPicker, type PickedLocationResult } from "./google-maps-location-picker";
import { useServiceLocation } from "./location-provider";

export function Header() {
  const [open, setOpen] = useState(false);
  const { location, setLocation, clearLocation, pickerOpen, openPicker, closePicker } = useServiceLocation();

  useEffect(() => {
    if (!pickerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePicker();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickerOpen, closePicker]);

  const handlePicked = (picked: PickedLocationResult) => {
    const supported = picked.serviceability ? picked.serviceability.supported : null;
    const serviceAreaName = picked.serviceability?.service_area?.name ?? null;
    setLocation({
      formatted_address: picked.formatted_address,
      house_flat: picked.house_flat,
      street: picked.street,
      locality: picked.locality,
      city: picked.city,
      state: picked.state,
      postal_code: picked.postal_code,
      latitude: picked.latitude,
      longitude: picked.longitude,
      supported,
      service_area_name: serviceAreaName,
    });
  };

  const primaryLabel = location
    ? [location.locality || location.city, location.postal_code].filter(Boolean).join(", ")
    : "Service location";

  const secondaryLabel = location
    ? location.supported === true
      ? `Serviceable · ${location.service_area_name || location.city}`
      : location.supported === false
        ? `Outside service area · ${location.city}`
        : location.city
    : "Check availability by address";

  return (
    <header className="site-header">
      <div className="header-main container">
        <Brand />
        <button
          type="button"
          className="header-location text-left bg-transparent border-0"
          onClick={openPicker}
          aria-label="Select service location"
        >
          <MapPin size={18} />
          <span>
            <b className="inline-flex items-center gap-1">
              {primaryLabel}
              <ChevronDown size={13} />
            </b>
            <small>{secondaryLabel}</small>
          </span>
        </button>
        <Link className="header-search" href="/search">
          <Search size={19} />
          <span>Search services or describe a problem</span>
          <kbd>Search</kbd>
        </Link>
        <nav className="header-actions" aria-label="Main navigation">
          <Link href="/services">Services</Link>
          <Link href="/bookings">My Bookings</Link>
          <Link href="/account" aria-label="Account">
            <UserRound size={19} /> Account
          </Link>
        </nav>
        <Link href="/book" className="button button-primary header-cta">
          Book a Service
        </Link>
        <button
          className="mobile-menu-button"
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <div className="mobile-quick container">
        <button
          type="button"
          onClick={openPicker}
          className="inline-flex items-center gap-1.5 bg-transparent border-0 p-0 text-left text-inherit"
        >
          <MapPin size={15} />
          <span>
            {location
              ? `${primaryLabel} · ${location.supported === true ? "Serviceable" : location.supported === false ? "Outside area" : location.city}`
              : "Set service location"}
          </span>
          <ChevronDown size={13} />
        </button>
        <Link href="/search">
          <Search size={17} /> Search
        </Link>
      </div>
      {open && (
        <nav id="mobile-menu" className="mobile-menu" aria-label="Mobile navigation">
          <Link href="/services" onClick={() => setOpen(false)}>
            Explore services
          </Link>
          <Link href="/book" onClick={() => setOpen(false)}>
            Book a service
          </Link>
          <Link href="/bookings" onClick={() => setOpen(false)}>
            My bookings
          </Link>
          <Link href="/account" onClick={() => setOpen(false)}>
            Account
          </Link>
        </nav>
      )}

      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="header-location-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closePicker}
        >
          <div
            className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="header-location-title" className="text-lg font-bold text-slate-900">
                  Choose your service location
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Search your area or use GPS to check NammaPros serviceability.
                </p>
              </div>
              <button
                type="button"
                onClick={closePicker}
                aria-label="Close location selector"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <GoogleMapsLocationPicker
              checkServiceability={true}
              initialQuery={location?.formatted_address || ""}
              title="Search address or detect via GPS"
              onLocationSelected={handlePicked}
            />

            {location && (
              <div
                className={`mt-4 rounded-xl border p-3.5 text-xs ${
                  location.supported === true
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : location.supported === false
                      ? "border-amber-200 bg-amber-50 text-amber-950"
                      : "border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {location.supported === true ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  ) : (
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-bold">
                      {location.supported === true
                        ? `Serviceable in ${location.service_area_name || location.locality || location.city}`
                        : location.supported === false
                          ? "Not yet serviceable at this address"
                          : "Address resolved"}
                    </p>
                    <p className="text-[11px] opacity-85">{location.formatted_address}</p>
                    <p className="text-[11px] opacity-75">
                      City: <b>{location.city}</b>
                      {location.postal_code ? ` · PIN: ${location.postal_code}` : ""}
                      {location.latitude != null && location.longitude != null
                        ? ` · Coords: ${location.latitude}, ${location.longitude}`
                        : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              {location ? (
                <button
                  type="button"
                  onClick={() => {
                    clearLocation();
                    closePicker();
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Clear saved location
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                {location && (
                  <Link
                    href="/book"
                    onClick={closePicker}
                    className="rounded-full border border-[#800020] px-4 py-2 text-xs font-bold text-[#800020] hover:bg-[#f6e7eb]"
                  >
                    Book here
                  </Link>
                )}
                <button
                  type="button"
                  onClick={closePicker}
                  className="rounded-full bg-[#800020] px-5 py-2 text-xs font-bold text-white hover:bg-[#5e0017]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
