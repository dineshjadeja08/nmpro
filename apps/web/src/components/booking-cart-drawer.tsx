"use client";

import { ArrowRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { useBookingCart } from "@/components/booking-cart-provider";

function formatRupees(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

/** Floating cart bar. Opening the cart (from here, the header or a pop-up) goes to the checkout page. */
export function BookingCartDrawer() {
  const { items, item, totalCount, totalPaise, sheetOpen, closeSheet } = useBookingCart();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!sheetOpen) return;
    closeSheet();
    if (pathname !== "/checkout") router.push("/checkout");
  }, [sheetOpen, closeSheet, pathname, router]);

  if (pathname === "/checkout" || items.length === 0 || !item) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[64px] z-30 px-4 md:bottom-5">
      <div className="pointer-events-auto mx-auto flex max-w-xl items-center justify-between gap-3 rounded-md border border-[#800020]/20 bg-[#1C1917] px-4 py-2.5 text-white shadow-[0_14px_38px_rgba(28,25,23,0.28)]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#800020] text-white">
            <ShoppingBag size={16} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold">
              {totalCount} {totalCount === 1 ? "service" : "services"} in cart · {formatRupees(totalPaise)}
            </p>
            <p className="truncate text-[11px] text-[#D6CEC6]">{items.map((i) => i.pkg.name).join(" + ")}</p>
          </div>
        </div>
        <Link
          href="/checkout"
          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-md bg-[#800020] px-4 text-xs font-bold text-white transition hover:bg-[#a61c3d]"
        >
          <span>View cart</span>
          <ArrowRight size={14} strokeWidth={1.75} />
        </Link>
      </div>
    </div>
  );
}
