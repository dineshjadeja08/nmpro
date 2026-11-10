"use client";

import { X } from "lucide-react";
import React, { useEffect } from "react";
import { useBookingCart } from "@/components/booking-cart-provider";
import { SlotFirstCheckout } from "@/components/slot-first-checkout";

export function BookingCartDrawer() {
  const { item, sheetOpen, closeSheet, clearCart } = useBookingCart();

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, closeSheet]);

  if (!sheetOpen || !item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-cart-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={closeSheet}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-[20px] bg-[#FBF8F5] p-5 shadow-2xl sm:rounded-[20px] sm:p-6 animate-[slideUpSheet_.25s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#E8E1DB] pb-3.5">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#800020]">
              NammaPros Booking
            </span>
            <h2 id="booking-cart-title" className="font-serif text-xl font-bold text-[#1C1917]">
              {item.service.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close booking sheet"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E8E1DB] bg-white text-[#57534E] hover:text-[#1C1917]"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <SlotFirstCheckout
          key={`${item.service.id}-${item.pkg.id}-${item.quantity}`}
          initialService={item.service}
          initialPackage={item.pkg}
          initialQuantity={item.quantity}
          initialProblem={item.problemDescription}
          compactSheet={true}
          onCloseSheet={closeSheet}
          onBookingCompleted={() => {
            clearCart();
          }}
        />
      </div>
    </div>
  );
}
