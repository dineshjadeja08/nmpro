"use client";

import { ArrowRight, ShoppingBag, X } from "lucide-react";
import React, { useEffect } from "react";
import { useBookingCart } from "@/components/booking-cart-provider";
import { SlotFirstCheckout } from "@/components/slot-first-checkout";

function formatRupees(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export function BookingCartDrawer() {
  const { items, item, totalCount, totalPaise, sheetOpen, openSheet, closeSheet, clearCart } =
    useBookingCart();

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, closeSheet]);

  if (!sheetOpen && (items.length === 0 || !item)) return null;

  return (
    <>
      {/* Persistent PurpleSquad-style Floating Cart Bar when sheet is closed */}
      {!sheetOpen && items.length > 0 && item && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[64px] z-30 px-4 md:bottom-5">
          <div className="pointer-events-auto mx-auto flex max-w-xl items-center justify-between gap-3 rounded-md border border-[#800020]/20 bg-[#1C1917] px-4 py-2.5 text-white shadow-[0_14px_38px_rgba(28,25,23,0.28)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#800020] text-white">
                <ShoppingBag size={16} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">
                  {totalCount} {totalCount === 1 ? "service" : "services"} in cart · {formatRupees(totalPaise)}
                </p>
                <p className="truncate text-[11px] text-[#D6CEC6]">
                  {items.map((i) => i.pkg.name).join(" + ")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openSheet}
              className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-md bg-[#800020] px-4 text-xs font-bold text-white transition hover:bg-[#a61c3d]"
            >
              <span>View Cart</span>
              <ArrowRight size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      )}

      {/* Slide-up Cart & Slot-First Checkout Modal */}
      {sheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-cart-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={closeSheet}
        >
          <div
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-lg bg-[#FBF8F5] p-5 shadow-2xl sm:rounded-lg sm:p-6 animate-[slideUpSheet_.25s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#E8E1DB] pb-3.5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#800020]">
                  {totalCount > 0 ? `NammaPros Cart · ${totalCount} ${totalCount === 1 ? "item" : "items"}` : "Booking Confirmed"}
                </span>
                <h2 id="booking-cart-title" className="font-serif text-xl font-bold text-[#1C1917]">
                  {item
                    ? items.length > 1
                      ? `${item.service.name} + ${items.length - 1} more`
                      : item.service.name
                    : "Your NammaPros visit"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                aria-label="Close booking sheet"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#E8E1DB] bg-white text-[#57534E] hover:text-[#1C1917]"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <SlotFirstCheckout
              initialService={item?.service}
              initialPackage={item?.pkg}
              initialQuantity={item?.quantity}
              initialProblem={item?.problemDescription}
              compactSheet={true}
              onCloseSheet={closeSheet}
              onBookingCompleted={() => {
                clearCart();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
