"use client";

import type { Service, ServicePackage } from "@nammapros/types";
import React, { createContext, useCallback, useContext, useState } from "react";

export type CartSelection = {
  service: Service;
  pkg: ServicePackage;
  quantity: number;
  problemDescription?: string;
};

type BookingCartContextValue = {
  item: CartSelection | null;
  sheetOpen: boolean;
  addToCart: (service: Service, pkg?: ServicePackage | null, quantity?: number, problemDescription?: string) => void;
  setQuantity: (quantity: number) => void;
  clearCart: () => void;
  openSheet: () => void;
  closeSheet: () => void;
};

const BookingCartContext = createContext<BookingCartContextValue | null>(null);

export function pickDefaultPackage(service: Service): ServicePackage | null {
  const pkgs = service.packages ?? [];
  if (!pkgs.length) return null;
  return pkgs.find((p) => p.is_most_booked) ?? pkgs[0];
}

export function getPackageUnitPaise(service: Service, pkg?: ServicePackage | null): number | null {
  if (pkg?.starting_price_paise != null) return pkg.starting_price_paise;
  return service.starting_price_paise ?? null;
}

export function BookingCartProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<CartSelection | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const addToCart = useCallback(
    (service: Service, pkg?: ServicePackage | null, quantity = 1, problemDescription = "") => {
      const chosen = pkg ?? pickDefaultPackage(service);
      if (!chosen) return;
      setItem({
        service,
        pkg: chosen,
        quantity: Math.max(1, quantity),
        problemDescription,
      });
      setSheetOpen(true);
    },
    []
  );

  const setQuantity = useCallback((quantity: number) => {
    setItem((curr) => (curr ? { ...curr, quantity: Math.max(1, Math.min(10, quantity)) } : null));
  }, []);

  const clearCart = useCallback(() => {
    setItem(null);
  }, []);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return (
    <BookingCartContext.Provider
      value={{ item, sheetOpen, addToCart, setQuantity, clearCart, openSheet, closeSheet }}
    >
      {children}
    </BookingCartContext.Provider>
  );
}

export function useBookingCart(): BookingCartContextValue {
  const ctx = useContext(BookingCartContext);
  const [fallbackItem, setFallbackItem] = useState<CartSelection | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  if (ctx) return ctx;

  return {
    item: fallbackItem,
    sheetOpen: fallbackOpen,
    addToCart: (service, pkg, quantity = 1, problemDescription = "") => {
      const chosen = pkg ?? pickDefaultPackage(service);
      if (!chosen) return;
      setFallbackItem({ service, pkg: chosen, quantity: Math.max(1, quantity), problemDescription });
      setFallbackOpen(true);
    },
    setQuantity: (q) => setFallbackItem((curr) => (curr ? { ...curr, quantity: Math.max(1, q) } : null)),
    clearCart: () => setFallbackItem(null),
    openSheet: () => setFallbackOpen(true),
    closeSheet: () => setFallbackOpen(false),
  };
}
