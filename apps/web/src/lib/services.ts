import type { Service } from "@nammapros/types";
import { AirVent, Droplets, Fan, PlugZap, Refrigerator, WashingMachine, Wrench } from "lucide-react";
import type { ComponentType } from "react";

export const serviceIcons: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  "ac-service-repair": AirVent,
  "ac-installation": Fan,
  "ac-gas-refill": Wrench,
  "washing-machine-repair": WashingMachine,
  "refrigerator-repair": Refrigerator,
  electrician: PlugZap,
  plumber: Droplets,
};

export function formatStartingPrice(service: Service) {
  return service.starting_price_paise == null
    ? "Price shared before confirmation"
    : `From ₹${(service.starting_price_paise / 100).toLocaleString("en-IN")}`;
}
