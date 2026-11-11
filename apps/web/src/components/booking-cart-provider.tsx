"use client";

import type { Service, ServicePackage } from "@nammapros/types";
import { CheckCircle2 } from "lucide-react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { bookingApi } from "@/lib/booking-api";

export type CartSelection = {
  service: Service;
  pkg: ServicePackage;
  quantity: number;
  problemDescription?: string;
};

const STORAGE_KEY = "nammapros.cart.v1";

type BookingCartContextValue = {
  items: CartSelection[];
  item: CartSelection | null;
  totalCount: number;
  totalPaise: number;
  sheetOpen: boolean;
  addToCart: (
    service: Service,
    pkg?: ServicePackage | null,
    quantity?: number,
    problemDescription?: string,
    openAfterAdd?: boolean
  ) => void;
  updateItemQuantity: (packageId: string, quantity: number) => void;
  removeItem: (packageId: string) => void;
  setQuantity: (quantity: number) => void;
  clearCart: () => void;
  syncCartWithServer: () => Promise<void>;
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

function upsertCartItem(
  prev: CartSelection[],
  service: Service,
  pkg: ServicePackage,
  quantity: number,
  problemDescription: string
): CartSelection[] {
  const idx = prev.findIndex((entry) => entry.pkg.id === pkg.id);
  if (idx >= 0) {
    return prev.map((entry, i) =>
      i === idx
        ? {
            ...entry,
            quantity: Math.min(10, entry.quantity + Math.max(1, quantity)),
            problemDescription: problemDescription || entry.problemDescription,
          }
        : entry
    );
  }
  return [
    ...prev,
    {
      service,
      pkg,
      quantity: Math.max(1, Math.min(10, quantity)),
      problemDescription,
    },
  ];
}

export function BookingCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartSelection[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const itemsRef = useRef<CartSelection[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const syncCartWithServer = useCallback(async () => {
    const current = itemsRef.current;
    if (current.length === 0) return;
    await Promise.allSettled(
      current.map((entry) =>
        bookingApi.putCartItem?.(entry.service.id, entry.pkg.id, entry.quantity)
      )
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CartSelection[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setItems(parsed);
            itemsRef.current = parsed;
          }
        }
      } catch {
        // ignore invalid storage payload
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage quota errors
    }
  }, [items, hydrated]);

  useEffect(() => {
    const handleAuthChanged = () => {
      void syncCartWithServer();
    };
    window.addEventListener("nammapros:auth-changed", handleAuthChanged);
    return () => window.removeEventListener("nammapros:auth-changed", handleAuthChanged);
  }, [syncCartWithServer]);

  const addToCart = useCallback(
    (
      service: Service,
      pkg?: ServicePackage | null,
      quantity = 1,
      problemDescription = "",
      openAfterAdd = true
    ) => {
      const chosen = pkg ?? pickDefaultPackage(service);
      if (!chosen) return;
      const nextList = upsertCartItem(itemsRef.current, service, chosen, quantity, problemDescription);
      itemsRef.current = nextList;
      setItems(nextList);
      showToast("Added to cart");
      const updated = nextList.find((e) => e.pkg.id === chosen.id);
      if (updated) {
        void Promise.resolve(bookingApi.putCartItem?.(service.id, chosen.id, updated.quantity)).catch(() => undefined);
      }
      if (openAfterAdd) {
        setSheetOpen(true);
      }
    },
    [showToast]
  );

  const updateItemQuantity = useCallback((packageId: string, quantity: number) => {
    const target = itemsRef.current.find((entry) => entry.pkg.id === packageId);
    setItems((prev) => {
      if (quantity <= 0) {
        return prev.filter((entry) => entry.pkg.id !== packageId);
      }
      return prev.map((entry) =>
        entry.pkg.id === packageId
          ? { ...entry, quantity: Math.max(1, Math.min(10, quantity)) }
          : entry
      );
    });
    if (target) {
      if (quantity <= 0) {
        void Promise.resolve(bookingApi.deleteCartItem?.(target.service.id, packageId)).catch(() => undefined);
      } else {
        void Promise.resolve(
          bookingApi.putCartItem?.(target.service.id, packageId, Math.max(1, Math.min(10, quantity)))
        ).catch(() => undefined);
      }
    }
  }, []);

  const removeItem = useCallback((packageId: string) => {
    const target = itemsRef.current.find((entry) => entry.pkg.id === packageId);
    setItems((prev) => prev.filter((entry) => entry.pkg.id !== packageId));
    if (target) {
      void Promise.resolve(bookingApi.deleteCartItem?.(target.service.id, packageId)).catch(() => undefined);
    }
  }, []);

  const setQuantity = useCallback((quantity: number) => {
    const target = itemsRef.current[0];
    setItems((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((entry, idx) =>
        idx === 0 ? { ...entry, quantity: Math.max(1, Math.min(10, quantity)) } : entry
      );
    });
    if (target) {
      void Promise.resolve(
        bookingApi.putCartItem?.(target.service.id, target.pkg.id, Math.max(1, Math.min(10, quantity)))
      ).catch(() => undefined);
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    itemsRef.current = [];
    void Promise.resolve(bookingApi.clearServerCart?.()).catch(() => undefined);
  }, []);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const totalCount = useMemo(
    () => items.reduce((sum, entry) => sum + entry.quantity, 0),
    [items]
  );

  const totalPaise = useMemo(
    () =>
      items.reduce(
        (sum, entry) => sum + (getPackageUnitPaise(entry.service, entry.pkg) ?? 0) * entry.quantity,
        0
      ),
    [items]
  );

  return (
    <BookingCartContext.Provider
      value={{
        items,
        item: items[0] ?? null,
        totalCount,
        totalPaise,
        sheetOpen,
        addToCart,
        updateItemQuantity,
        removeItem,
        setQuantity,
        clearCart,
        syncCartWithServer,
        openSheet,
        closeSheet,
      }}
    >
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 right-4 z-[80] inline-flex items-center gap-2 rounded-md bg-[#1C1917] px-4 py-2.5 text-xs font-bold text-white shadow-lg sm:bottom-6"
        >
          <CheckCircle2 size={15} className="text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </BookingCartContext.Provider>
  );
}

export function useBookingCart(): BookingCartContextValue {
  const ctx = useContext(BookingCartContext);
  const [fallbackItems, setFallbackItems] = useState<CartSelection[]>([]);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  if (ctx) return ctx;

  const totalCount = fallbackItems.reduce((sum, entry) => sum + entry.quantity, 0);
  const totalPaise = fallbackItems.reduce(
    (sum, entry) => sum + (getPackageUnitPaise(entry.service, entry.pkg) ?? 0) * entry.quantity,
    0
  );

  return {
    items: fallbackItems,
    item: fallbackItems[0] ?? null,
    totalCount,
    totalPaise,
    sheetOpen: fallbackOpen,
    addToCart: (service, pkg, quantity = 1, problemDescription = "", openAfterAdd = true) => {
      const chosen = pkg ?? pickDefaultPackage(service);
      if (!chosen) return;
      setFallbackItems((prev) => upsertCartItem(prev, service, chosen, quantity, problemDescription));
      if (openAfterAdd) setFallbackOpen(true);
    },
    updateItemQuantity: (packageId, quantity) =>
      setFallbackItems((prev) =>
        quantity <= 0
          ? prev.filter((e) => e.pkg.id !== packageId)
          : prev.map((e) => (e.pkg.id === packageId ? { ...e, quantity: Math.max(1, Math.min(10, quantity)) } : e))
      ),
    removeItem: (packageId) => setFallbackItems((prev) => prev.filter((e) => e.pkg.id !== packageId)),
    setQuantity: (q) =>
      setFallbackItems((prev) =>
        prev.map((e, i) => (i === 0 ? { ...e, quantity: Math.max(1, Math.min(10, q)) } : e))
      ),
    clearCart: () => setFallbackItems([]),
    syncCartWithServer: async () => {},
    openSheet: () => setFallbackOpen(true),
    closeSheet: () => setFallbackOpen(false),
  };
}
