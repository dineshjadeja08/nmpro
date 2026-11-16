"use client";

import type { Service, ServicePackage } from "@nammapros/types";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useServiceLocation } from "@/components/location-provider";
import { bookingApi } from "@/lib/booking-api";

type ZonePricingValue = {
  /** PIN code the prices were loaded for, or null when we only have "from" prices. */
  pincode: string | null;
  loading: boolean;
  /** Returns the service with package prices, MRP and availability for the customer's area. */
  withZonePrices: (service: Service) => Service;
};

const ZonePricingContext = createContext<ZonePricingValue | null>(null);

function mergePackages(base: ServicePackage[] | undefined, zoned: ServicePackage[] | undefined): ServicePackage[] {
  const byId = new Map((zoned ?? []).map((p) => [p.id, p]));
  return (base ?? []).map((pkg) => {
    const z = byId.get(pkg.id);
    if (!z) return pkg;
    return {
      ...pkg,
      price_paise: z.price_paise,
      mrp_paise: z.mrp_paise,
      discount_percent: z.discount_percent,
      price_is_from: z.price_is_from,
      is_available_in_zone: z.is_available_in_zone,
      starting_price_paise: z.price_paise ?? pkg.starting_price_paise,
      original_price_paise: z.mrp_paise ?? null,
    };
  });
}

export function ZonePricingProvider({ children }: { children: React.ReactNode }) {
  const { location } = useServiceLocation();
  const pincode = /^\d{6}$/.test(location?.postal_code ?? "") ? location!.postal_code : null;
  const [state, setState] = useState<{ pincode: string | null; bySlug: Map<string, Service> }>({
    pincode: null,
    bySlug: new Map(),
  });

  useEffect(() => {
    if (!pincode) return;
    let active = true;
    bookingApi
      .zoneServices(pincode)
      .then((res) => {
        if (active) setState({ pincode, bySlug: new Map(res.services.map((s) => [s.slug, s])) });
      })
      .catch(() => {
        if (active) setState({ pincode: null, bySlug: new Map() });
      });
    return () => {
      active = false;
    };
  }, [pincode]);

  const loaded = state.pincode !== null && state.pincode === pincode;

  const withZonePrices = useCallback(
    (service: Service): Service => {
      if (!loaded) return service;
      const zoned = state.bySlug.get(service.slug);
      if (!zoned) return service;
      return {
        ...service,
        starting_price_paise: zoned.starting_price_paise,
        starting_mrp_paise: zoned.starting_mrp_paise,
        starting_discount_percent: zoned.starting_discount_percent,
        zone_id: zoned.zone_id,
        packages: mergePackages(service.packages, zoned.packages),
      };
    },
    [loaded, state.bySlug]
  );

  const value = useMemo(
    () => ({ pincode: loaded ? pincode : null, loading: Boolean(pincode) && !loaded, withZonePrices }),
    [loaded, pincode, withZonePrices]
  );
  return <ZonePricingContext.Provider value={value}>{children}</ZonePricingContext.Provider>;
}

/** The service priced for the customer's selected area (falls back to "from" prices). */
export function useZoneService(service: Service): Service {
  const ctx = useContext(ZonePricingContext);
  return useMemo(() => (ctx ? ctx.withZonePrices(service) : service), [ctx, service]);
}

export function useZonePincode(): string | null {
  return useContext(ZonePricingContext)?.pincode ?? null;
}

/** True when an area is selected and this package is not offered there. */
export function isUnavailableHere(pkg?: ServicePackage | null): boolean {
  return pkg?.is_available_in_zone === false;
}
