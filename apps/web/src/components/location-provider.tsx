"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type SelectedServiceLocation = {
  formatted_address: string;
  house_flat: string;
  street: string;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  supported: boolean | null;
  service_area_name?: string | null;
};

type LocationContextValue = {
  location: SelectedServiceLocation | null;
  setLocation: (loc: SelectedServiceLocation) => void;
  clearLocation: () => void;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
};

const STORAGE_KEY = "nammapros.service_location";

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<SelectedServiceLocation | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SelectedServiceLocation;
          if (parsed && (parsed.city || parsed.postal_code || parsed.locality)) {
            setLocationState(parsed);
          }
        }
      } catch {
        // ignore storage errors
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setLocation = useCallback((loc: SelectedServiceLocation) => {
    setLocationState(loc);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    } catch {
      // ignore storage errors
    }
  }, []);

  const clearLocation = useCallback(() => {
    setLocationState(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  return (
    <LocationContext.Provider
      value={{ location, setLocation, clearLocation, pickerOpen, openPicker, closePicker }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useServiceLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  const [fallbackLocation, setFallbackLocation] = useState<SelectedServiceLocation | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  if (ctx) return ctx;

  return {
    location: fallbackLocation,
    setLocation: setFallbackLocation,
    clearLocation: () => setFallbackLocation(null),
    pickerOpen: fallbackOpen,
    openPicker: () => setFallbackOpen(true),
    closePicker: () => setFallbackOpen(false),
  };
}
