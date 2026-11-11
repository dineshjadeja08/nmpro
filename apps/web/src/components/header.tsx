"use client";

import {
  CheckCircle2,
  ChevronDown,
  MapPin,
  Menu,
  Search,
  ShoppingBag,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBookingCart } from "./booking-cart-provider";
import { Brand } from "./brand";
import { GoogleMapsLocationPicker, type PickedLocationResult } from "./google-maps-location-picker";
import { useServiceLocation } from "./location-provider";

export function Header() {
  const [open, setOpen] = useState(false);
  const { location, setLocation, clearLocation, pickerOpen, openPicker, closePicker } = useServiceLocation();
  const { totalCount, openSheet } = useBookingCart();

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
    : "Select location";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#E8E1DB] bg-[#FBF8F5]/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Brand />

          <button
            type="button"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-[#E2D9D0] bg-white px-3.5 py-1.5 text-xs font-medium text-[#1C1917] shadow-2xs transition hover:border-[#800020]"
            onClick={openPicker}
            aria-label="Select service location"
          >
            <MapPin size={14} strokeWidth={1.75} className="shrink-0 text-[#800020]" />
            <span className="max-w-[160px] truncate">{primaryLabel}</span>
            <ChevronDown size={13} className="shrink-0 text-[#57534E]" />
          </button>

          <Link
            href="/search"
            className="hidden lg:inline-flex min-w-[260px] items-center gap-2 rounded-md border border-[#E2D9D0] bg-white px-3.5 py-1.5 text-xs text-[#78716C] transition hover:border-[#800020]"
          >
            <Search size={14} strokeWidth={1.5} />
            <span className="truncate">Search a service or problem</span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-[#1C1917]" aria-label="Main navigation">
          <Link href="/services" className="hover:text-[#800020] transition">
            Services
          </Link>
          <Link href="/#how-it-works" className="hover:text-[#800020] transition">
            How it works
          </Link>
          <Link href="/bookings" className="hover:text-[#800020] transition">
            Bookings
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D6CEC6] bg-white px-3.5 py-1.5 font-semibold text-[#1C1917] transition hover:border-[#800020]"
          >
            <UserRound size={14} strokeWidth={1.75} />
            <span>Sign in</span>
          </Link>
          {totalCount > 0 ? (
            <button
              type="button"
              onClick={openSheet}
              aria-label={`Cart (${totalCount} items)`}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#800020] px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#5e0017]"
            >
              <ShoppingBag size={14} strokeWidth={1.75} />
              <span>Cart</span>
              <span
                data-testid="header-cart-badge"
                className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-white px-1.5 text-[11px] font-bold text-[#800020]"
              >
                {totalCount}
              </span>
            </button>
          ) : (
            <Link
              href="/book"
              aria-label="Book a Service"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#800020] text-white shadow-xs transition hover:bg-[#5e0017]"
            >
              <ShoppingBag size={15} strokeWidth={1.75} />
              <span
                data-testid="header-cart-badge"
                className="sr-only"
              >
                0
              </span>
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          {totalCount > 0 && (
            <button
              type="button"
              onClick={openSheet}
              aria-label={`Cart (${totalCount} items)`}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[#800020] px-3 text-xs font-bold text-white shadow-xs"
            >
              <ShoppingBag size={14} strokeWidth={1.75} />
              <span>{totalCount}</span>
            </button>
          )}
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#E2D9D0] bg-white text-[#1C1917]"
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile secondary bar */}
      <div className="container flex items-center justify-between gap-2 border-t border-[#EFE9E2] py-2 text-xs text-[#57534E] md:hidden">
        <button
          type="button"
          onClick={openPicker}
          className="inline-flex items-center gap-1.5 bg-transparent border-0 p-0 text-left font-medium text-[#1C1917]"
        >
          <MapPin size={14} className="text-[#800020]" />
          <span className="truncate max-w-[200px]">
            {location
              ? `${primaryLabel} · ${location.supported === true ? "Serviceable" : location.supported === false ? "Outside area" : location.city}`
              : "Set service location"}
          </span>
          <ChevronDown size={13} />
        </button>
        <Link href="/search" className="inline-flex items-center gap-1 font-semibold text-[#800020]">
          <Search size={14} /> Search
        </Link>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          className="grid gap-1 border-t border-[#E8E1DB] bg-white px-4 py-3 text-sm font-medium text-[#1C1917] md:hidden"
          aria-label="Mobile navigation"
        >
          <Link href="/services" className="rounded-lg px-2 py-2 hover:bg-[#FAF6F2]" onClick={() => setOpen(false)}>
            Explore services
          </Link>
          <Link href="/book" className="rounded-lg px-2 py-2 hover:bg-[#FAF6F2]" onClick={() => setOpen(false)}>
            Book a service
          </Link>
          <Link href="/bookings" className="rounded-lg px-2 py-2 hover:bg-[#FAF6F2]" onClick={() => setOpen(false)}>
            My bookings
          </Link>
          <Link href="/account" className="rounded-lg px-2 py-2 hover:bg-[#FAF6F2]" onClick={() => setOpen(false)}>
            Account
          </Link>
        </nav>
      )}
      </header>

      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="header-location-title"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={closePicker}
        >
          <div
            className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-[#E8E1DB] bg-white p-6 shadow-[0_24px_60px_rgba(28,25,23,0.22)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="header-location-title" className="font-serif text-xl font-semibold text-[#1C1917]">
                  Choose your service location
                </h2>
                <p className="mt-1 text-xs text-[#57534E]">
                  Search your street or landmark, or use GPS to check NammaPros coverage.
                </p>
              </div>
              <button
                type="button"
                onClick={closePicker}
                aria-label="Close location selector"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#E8E1DB] bg-[#FBF8F5] text-[#1C1917] transition hover:border-[#800020] hover:text-[#800020]"
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
                className={`mt-4 rounded-lg border p-4 text-xs ${
                  location.supported === true
                    ? "border-emerald-200 bg-[#E7F2EC] text-[#115E3C]"
                    : location.supported === false
                      ? "border-amber-200 bg-amber-50 text-amber-950"
                      : "border-[#E8E1DB] bg-[#FAF6F2] text-[#1C1917]"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {location.supported === true ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#117A4B]" />
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
                    <p className="text-[11px] opacity-90">{location.formatted_address}</p>
                    <p className="text-[11px] opacity-80">
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

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#EFE9E2] pt-4">
              {location ? (
                <button
                  type="button"
                  onClick={() => {
                    clearLocation();
                    closePicker();
                  }}
                  className="text-xs font-semibold text-[#57534E] hover:text-[#1C1917]"
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
                    className="rounded-md border border-[#800020] px-4 py-2 text-xs font-bold text-[#800020] transition hover:bg-[#F5E6EA]"
                  >
                    Book here
                  </Link>
                )}
                <button
                  type="button"
                  onClick={closePicker}
                  className="rounded-md bg-[#800020] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#5e0017]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
