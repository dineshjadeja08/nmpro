"use client";

import {
  ArrowRight,
  CalendarCheck,
  ChevronDown,
  CreditCard,
  LogOut,
  MapPin,
  Search,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { bookingApi } from "@/lib/booking-api";
import { useBookingCart } from "./booking-cart-provider";
import { Brand } from "./brand";
import { LocationSearchSheet, ServiceSearchSheet } from "./search-sheets";
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
  const [signedInPhone, setSignedInPhone] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [profileMenuTarget, setProfileMenuTarget] = useState<"desktop" | null>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const { location, pickerOpen, openPicker, closePicker } = useServiceLocation();
  const [searchOpen, setSearchOpen] = useState(false);
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
      if (!desktopMenuRef.current?.contains(target)) setProfileMenuTarget(null);
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

  const primaryLabel = location
    ? [location.locality || location.city, location.postal_code].filter(Boolean).join(", ")
    : "Select location";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#E8E1DB] bg-white/95 backdrop-blur">
        <div className="container flex h-16 items-center gap-3 md:gap-4">
          <Brand />

          {/* Search (pop-up) */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-haspopup="dialog"
            aria-label="Search for a service"
            className="hidden h-11 min-w-0 flex-[1.4] items-center gap-2.5 rounded-lg border border-[#E2D9D0] bg-white pl-3.5 pr-1.5 text-left text-sm text-[#78716C] transition hover:border-[#800020] md:flex"
          >
            <Search size={17} strokeWidth={1.75} className="shrink-0 text-[#57534E]" />
            <span className="min-w-0 flex-1 truncate">Search for &lsquo;AC service&rsquo;</span>
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#800020] text-white">
              <ArrowRight size={15} />
            </span>
          </button>

          {/* Location (pop-up) */}
          <button
            type="button"
            onClick={openPicker}
            aria-haspopup="dialog"
            aria-label={`Service location: ${primaryLabel}`}
            className="hidden h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#E2D9D0] bg-white px-3 text-left text-sm text-[#1C1917] transition hover:border-[#800020] md:flex"
          >
            <MapPin size={17} strokeWidth={1.75} className="shrink-0 text-[#800020]" />
            <span className="min-w-0 flex-1 truncate">{primaryLabel}</span>
            <ChevronDown size={15} className="shrink-0 text-[#57534E]" />
          </button>

          {/* Cart */}
          {totalCount > 0 ? (
            <button
              type="button"
              onClick={openSheet}
              aria-label={`Cart (${totalCount} items)`}
              className="relative ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-lg md:ml-0 border border-[#E2D9D0] bg-white text-[#1C1917] transition hover:border-[#800020] hover:text-[#800020]"
            >
              <ShoppingCart size={19} strokeWidth={1.75} />
              <span
                data-testid="header-cart-badge"
                className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-[#800020] px-1 text-[11px] font-bold text-white"
              >
                {totalCount}
              </span>
            </button>
          ) : (
            <Link
              href="/checkout"
              aria-label="Cart (empty)"
              className="relative ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-lg md:ml-0 border border-[#E2D9D0] bg-white text-[#1C1917] transition hover:border-[#800020] hover:text-[#800020]"
            >
              <ShoppingCart size={19} strokeWidth={1.75} />
              <span data-testid="header-cart-badge" className="sr-only">0</span>
            </Link>
          )}

          {/* Profile, or sign in */}
          {signedInPhone ? (
            <div ref={desktopMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setProfileMenuTarget((v) => (v ? null : "desktop"))}
                aria-label="Account profile menu"
                aria-expanded={profileMenuTarget !== null}
                aria-haspopup="menu"
                title={`Signed in as ${signedInPhone}`}
                className="relative grid h-11 w-11 place-items-center rounded-full bg-[#800020] text-white transition hover:bg-[#5e0017]"
              >
                <UserRound size={19} strokeWidth={1.75} />
                <span aria-hidden="true" className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
              </button>
              {profileMenuTarget && (
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
              title="Sign in"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#E2D9D0] bg-white text-[#1C1917] transition hover:border-[#800020] hover:text-[#800020]"
            >
              <UserRound size={19} strokeWidth={1.75} />
            </button>
          )}
        </div>

        {/* Phones: location line and full-width search under the bar */}
        <div className="container space-y-2 pb-2.5 md:hidden">
          <button
            type="button"
            onClick={openPicker}
            aria-haspopup="dialog"
            aria-label={`Service location: ${primaryLabel}`}
            className="flex max-w-full items-center gap-1.5 text-left text-sm font-semibold text-[#1C1917]"
          >
            <MapPin size={16} strokeWidth={1.75} className="shrink-0 text-[#800020]" />
            <span className="min-w-0 truncate">{primaryLabel}</span>
            <ChevronDown size={15} className="shrink-0 text-[#57534E]" />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-haspopup="dialog"
            aria-label="Search for a service"
            className="flex h-11 w-full items-center gap-2.5 rounded-lg border border-[#E2D9D0] bg-white pl-3.5 pr-1.5 text-left text-sm text-[#78716C]"
          >
            <Search size={17} strokeWidth={1.75} className="shrink-0 text-[#57534E]" />
            <span className="min-w-0 flex-1 truncate">Search for &lsquo;AC service&rsquo;</span>
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#800020] text-white">
              <ArrowRight size={15} />
            </span>
          </button>
        </div>
      </header>

      {pickerOpen && <LocationSearchSheet onClose={closePicker} />}
      {searchOpen && <ServiceSearchSheet onClose={() => setSearchOpen(false)} />}
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
