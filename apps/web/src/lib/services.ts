import type { Service, ServiceCategory } from "@nammapros/types";
import { AirVent, Droplets, Fan, PlugZap, Refrigerator, WashingMachine, Wrench } from "lucide-react";
import type { ComponentType } from "react";

export const CANONICAL_CATEGORY_SLUGS = [
  "ac",
  "washing-machine",
  "refrigerator",
  "tv",
  "geyser",
  "water-purifier",
  "microwave-oven",
  "dishwasher",
  "cctv",
  "chimney",
  "water-tank-cleaning",
  "mosquito-net",
  "sofa",
] as const;

const CANONICAL_ORDER = new Map<string, number>(
  CANONICAL_CATEGORY_SLUGS.map((slug, idx) => [slug, idx])
);

export function filterCanonicalCategories(categories: ServiceCategory[]): ServiceCategory[] {
  return categories
    .filter((c) => c.is_active !== false && CANONICAL_ORDER.has(c.slug))
    .slice()
    .sort((a, b) => {
      const sortDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (sortDiff !== 0) return sortDiff;
      return (CANONICAL_ORDER.get(a.slug) ?? 99) - (CANONICAL_ORDER.get(b.slug) ?? 99);
    });
}

export const serviceIcons: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  "ac-service-repair": AirVent,
  "ac-installation": Fan,
  "ac-gas-refill": Wrench,
  "washing-machine-repair": WashingMachine,
  "refrigerator-repair": Refrigerator,
  electrician: PlugZap,
  plumber: Droplets,
};

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatInr(paise: number): string {
  return INR_FORMATTER.format(Math.round(paise / 100));
}

export function formatStartingPrice(service: Service) {
  return service.starting_price_paise == null
    ? "Price shared before confirmation"
    : `From ${formatInr(service.starting_price_paise)}`;
}

export function pickPopularServices(services: Service[], maxCount = 4): Service[] {
  const cap = Math.max(0, Math.min(4, maxCount));
  const active = services
    .filter((s) => s.is_active !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const seen = new Set<string>();
  const picked: Service[] = [];

  for (const s of active) {
    if (picked.length >= cap) break;
    if (s.is_popular) {
      seen.add(s.id);
      picked.push(s);
    }
  }
  for (const s of active) {
    if (picked.length >= cap) break;
    if (!seen.has(s.id) && s.is_featured) {
      seen.add(s.id);
      picked.push(s);
    }
  }
  for (const s of active) {
    if (picked.length >= cap) break;
    if (!seen.has(s.id)) {
      seen.add(s.id);
      picked.push(s);
    }
  }
  return picked;
}
