"use client";

import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  LogOut,
  MapPin,
  Menu,
  Search,
  ShoppingBag,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { bookingApi } from "@/lib/booking-api";
import { useBookingCart } from "./booking-cart-provider";
import { Brand } from "./brand";
import { GoogleMapsLocationPicker, type PickedLocationResult } from "./google-maps-location-picker";
import { useServiceLocation } from "./location-provider";
import { QuickOtpSheet } from "./quick-otp-sheet";

function ProfileMenuDropdown({
  phone,
  onClose,
  onSignOut,
}: {
  phone: string;
  onClose: () => void;
  onSignOut: () => void;
}) {
  return (
    <div
      role="menu"
      aria-label="Profile options"
      className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-[#EAE3DC] bg-white p-1.5 shadow-[0_18px_45px_rgba(28,25,23,0.16)]"
    >
      <div className="border-b border-[#F4EFE9] px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Signed in
        </span>
        <p className="mt-0.5 truncate text-xs font-bold text-[#1C1917]">{phone}</p>
      </div>
      <div className="py-1 text-xs">
        <Link
          href="/account"
          role="menuitem"
          onClick={onClose}
          className="flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[#1C1917] hover:bg-[#FAF6F2] hover:text-[#800020]"
        >
          <UserRound size={14} />
          <span>Account & Addresses</span>
        </Link>
        <Link
          href="/bookings"
          role="menuitem"
          onClick={onClose}
          className="flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[#1C1917] hover:bg-[#FAF6F2] hover:text-[#800020]"
        >
          <CalendarCheck size={14} />
          <span>My Bookings</span>
        </Link>
        <Link
          href="/payments"
          role="menuitem"
          onClick={onClose}
          className="flex items-center gap-2 rounded-md px-3 py-2 font-medium text-[#1C1917] hover:bg-[#FAF6F2] hover:text-[#800020]"
        >
          <CreditCard size={14} />
          <span>Payments & Receipts</span>
        </Link>
      </div>
      <div className="border-t border-[#F4EFE9] pt-1">
        <button
          type="button"
          role="menuitem"
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-[#800020] hover:bg-[#FBECEF]"
        >
          <LogOut size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [signedInPhone, setSignedInPhone] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [profileMenuTarget, setProfileMenuTarget] = useState<"desktop" | "mobile" | null>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { location, setLocation, clearLocation, pickerOpen, openPicker, closePicker } = useServiceLocation();
  const { totalCount, openSheet } = useBookingCart();

  useEffect(() => {
    let active = true;
    const syncAuth = () => {
      bookingApi
        .me()
        .then((me) => {
          if (active) setSignedInPhone(me.phone_e164 || "Signed in");
        })
        .catch(() => {
          if (active) {
            setSignedInPhone(null);
            setProfileMenuTarget(null);
          }
        });
    };
    syncAuth();
    window.addEventListener("nammapros:auth-changed", syncAuth);
    return () => {
      active = false;
      window.removeEventListener("nammapros:auth-changed", syncAuth);
    };
  }, []);

  useEffect(() => {
    if (!profileMenuTarget) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const inDesktop = desktopMenuRef.current?.contains(target);
      const inMobile = mobileMenuRef.current?.contains(target);
      if (!inDesktop && !inMobile) setProfileMenuTarget(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuTarget(null);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileMenuTarget]);

  async function handleSignOut() {
    setProfileMenuTarget(null);
    try {
      await bookingApi.logout();
      setSignedInPhone(null);
    } catch {
      // keep state unchanged if logout fails
    }
  }

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
          {signedInPhone ? (
            <div ref={desktopMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuTarget((v) => (v === "desktop" ? null : "desktop"))}
                aria-label="Account profile menu"
                aria-expanded={profileMenuTarget === "desktop"}
                aria-haspopup="menu"
                title={`Signed in as ${signedInPhone}`}
                className="relative grid h-9 w-9 place-items-center rounded-full bg-[#800020] text-white shadow-xs ring-2 ring-[#FBECEF] transition hover:bg-[#5e0017]"
              >
                <UserRound size={16} strokeWidth={2} />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#FBF8F5] bg-emerald-500"
                />
              </button>

              {profileMenuTarget === "desktop" && (
                <ProfileMenuDropdown
                  phone={signedInPhone}
                  onClose={() => setProfileMenuTarget(null)}
                  onSignOut={() => void handleSignOut()}
                />
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSignInOpen(true)}
              aria-label="Sign in"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#D6CEC6] bg-white px-3.5 py-1.5 font-semibold text-[#1C1917] transition hover:border-[#800020] hover:text-[#800020]"
            >
              <UserRound size={14} strokeWidth={1.75} />
              <span>Sign in</span>
            </button>
          )}
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
          {signedInPhone ? (
            <div ref={mobileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuTarget((v) => (v === "mobile" ? null : "mobile"))}
                aria-label="Profile menu"
                aria-expanded={profileMenuTarget === "mobile"}
                className="relative grid h-9 w-9 place-items-center rounded-full bg-[#800020] text-white shadow-xs ring-2 ring-[#FBECEF]"
              >
                <UserRound size={16} strokeWidth={2} />
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#FBF8F5] bg-emerald-500"
                />
              </button>
              {profileMenuTarget === "mobile" && (
                <ProfileMenuDropdown
                  phone={signedInPhone}
                  onClose={() => setProfileMenuTarget(null)}
                  onSignOut={() => void handleSignOut()}
                />
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSignInOpen(true)}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-[#D6CEC6] bg-white px-2.5 text-xs font-semibold text-[#1C1917]"
            >
              <UserRound size={13} />
              <span>Sign in</span>
            </button>
          )}
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
          {!signedInPhone && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSignInOpen(true);
              }}
              className="rounded-lg px-2 py-2 text-left font-bold text-[#800020] hover:bg-[#FBECEF]"
            >
              Sign in with Mobile OTP
            </button>
          )}
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
      <QuickOtpSheet
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        title="Sign in to NammaPros"
        subtitle="Verify your mobile number once to view saved addresses, track visits, and book in 1 tap."
        onAuthenticated={() => setSignInOpen(false)}
      />
    </>
  );
}
