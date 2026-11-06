import { z } from "zod";

export const bookingDraftSchema = z.object({
  serviceSlug: z.string().min(1, "Choose a service to continue."),
  problem: z.string().max(1000, "Keep the description under 1,000 characters."),
  line1: z.string().min(5, "Enter a building and street address."),
  locality: z.string().min(2, "Enter a locality."),
  city: z.string().min(2, "Enter a city."),
  postalCode: z.string().regex(/^\d{6}$/, "Enter a six-digit PIN code."),
});
export type BookingDraft = z.infer<typeof bookingDraftSchema>;
export const initialDraft: BookingDraft = { serviceSlug: "", problem: "", line1: "", locality: "", city: "", postalCode: "" };
