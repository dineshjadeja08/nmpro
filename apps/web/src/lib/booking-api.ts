export type Package = { id: string; name: string; pricing_model: "FIXED_PRICE" | "INSPECTION_BASED"; duration_minutes: number; inclusions: string[]; exclusions: string[] };
export type Address = { id: string; line_1: string; label: string; contact_name: string; contact_phone: string; house_flat: string; street: string; locality: string; city: string; state: string; postal_code: string; landmark: string; latitude?: number | null; longitude?: number | null; is_default: boolean };
export type Slot = { id: string; start_at: string; end_at: string; remaining: number; version: number };
export type Hold = { id: string; expires_at: string };
export type NotificationPreferences = { whatsapp_opt_in: boolean; sms_opt_in: boolean; email_opt_in: boolean };
export type Quote = {
  id: string;
  hold_id: string;
  expires_at: string;
  lines: {
    code: string;
    name?: string;
    package_id?: string;
    quantity?: number;
    unit_paise?: number;
    amount_paise: number;
  }[];
  total_paise: number;
  advance_paise?: number;
  remaining_balance_paise?: number;
  currency: string;
  pricing_policy_id: string;
  pricing_version: number;
  payment_policy: "PREPAID" | "PAY_AT_VISIT" | "ADVANCE";
  advance_type?: string;
  advance_percentage?: number;
};
export type LocationSuggestion = { id: string; description: string; main_text: string; secondary_text: string };
export type ResolvedLocation = { formatted_address: string; house_flat: string; street: string; locality: string; city: string; state: string; postal_code: string; latitude: number | null; longitude: number | null };
export type ServiceAreaInfo = { id: string; name: string; city: string; state: string; postal_code: string };
export type ServiceAreaCheckResult = { is_supported: boolean; supported: boolean; service_area: ServiceAreaInfo | null; areas: Array<{ id: string; name: string; slug: string; postal_code: string }> };
export type Booking = {
  id: string;
  reference: string;
  status: string;
  payment_status: string;
  payment_expires_at?: string | null;
  invoice_available?: boolean;
  payment_attempt_unresolved?: boolean;
  version: number;
  problem_description?: string;
  offline_collected_paise?: number;
  start_otp_code?: string;
  technician?: {
    name: string;
    phone?: string;
    status: string;
    rating?: number | null;
    completed_jobs?: number;
    photo_url?: string | null;
  } | null;
  can_review?: boolean;
  review?: { rating: number; comment: string; tags?: string[]; photo_url?: string | null } | null;
  service: string;
  package: string;
  package_id: string;
  address_id: string;
  items?: { service: string; package: string; package_id: string; quantity: number }[];
  can_cancel: boolean;
  can_reschedule: boolean;
  address: { label: string; line_1: string; locality: string; city: string; postal_code: string };
  slot: { start_at: string; end_at: string };
  price: { lines: { code: string; amount_paise: number }[]; total_paise: number; advance_paise?: number; remaining_balance_paise?: number; currency: string };
  events: { from_status: string; to_status: string; created_at: string }[];
};
export type ServiceReviewItem = {
  id: string;
  rating: number;
  comment: string;
  tags?: string[];
  photo_url?: string | null;
  customer_name: string;
  area?: string;
  technician_name?: string;
  service_name?: string;
  created_at: string;
};
export type ServiceReviewSummary = {
  average_rating: number | null;
  review_count: number;
  rating_breakdown?: Record<string, number>;
  results: ServiceReviewItem[];
};
export type JobQuotation = { id: string; status: string; labour_paise: number; parts_paise: number; tax_paise: number; total_paise: number; valid_until: string; items: { description: string; quantity: number; unit_paise: number; total_paise: number }[] };

const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
let csrfToken = "";
async function refreshCsrf() {
  const response = await fetch(`${base}/api/v1/auth/csrf/`, { credentials: "include" });
  if (!response.ok) throw new BookingApiError("Sign-in security could not be initialized. Refresh and retry.", response.status, "CSRF_ERROR");
  csrfToken = (await response.json()).csrf_token;
}
function cookie(name: string) {
  return document.cookie.split("; ").find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
export class BookingApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
export async function bookingRequest<T>(path: string, method = "GET", body?: unknown, key?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    if (method !== "GET" && !csrfToken) {
      await refreshCsrf();
    }
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const response = await fetch(`${base}/api/v1${path}`, {
      method, credentials: "include", signal: controller.signal, cache: "no-store",
      headers: {
        ...(!isFormData && body ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" ? { "X-CSRFToken": csrfToken || decodeURIComponent(cookie("csrftoken")) } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body ? { body: isFormData ? body : JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new BookingApiError(payload?.error?.message ?? (typeof payload?.detail === "string" ? payload.detail : "Please try again."), response.status,
                                payload?.error?.code ?? "API_ERROR");
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof BookingApiError) throw error;
    throw new BookingApiError(controller.signal.aborted ? "The request timed out. Try again." : "The service is unavailable. Try again.",
                              0, controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR");
  } finally { window.clearTimeout(timeout); }
}

export const bookingApi = {
  me: () => bookingRequest<{ id: number; phone_e164: string }>("/auth/me/"),
  firebaseAuth: async (idToken: string) => {
    const result = await bookingRequest<{ id: number; phone_e164: string }>("/auth/firebase/", "POST", { id_token: idToken });
    await refreshCsrf();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nammapros:auth-changed"));
    }
    return result;
  },
  logout: async () => { const result = await bookingRequest<void>("/auth/logout/", "POST"); csrfToken = ""; return result; },
  addresses: () => bookingRequest<{ addresses: Address[] }>("/customers/addresses/"),
  createAddress: (body: Omit<Address, "id" | "line_1">) => bookingRequest<Address>("/customers/addresses/", "POST", body),
  updateAddress: (id: string, body: Partial<Omit<Address, "id" | "line_1">>) => bookingRequest<Address>(`/customers/addresses/${id}/`, "PATCH", body),
  archiveAddress: (id: string) => bookingRequest<void>(`/customers/addresses/${id}/`, "DELETE"),
  serviceability: (package_id: string, address_id: string) => bookingRequest<{ supported: boolean; reason: string | null }>("/serviceability/check/", "POST", { package_id, address_id }),
  slots: (package_id: string, address_id: string, start: string, end: string) => bookingRequest<{ slots: Slot[] }>(`/availability/slots/?${new URLSearchParams({ package_id, address_id, start, end })}`),
  publicSlots: (params: { package_id?: string; service_id?: string; postal_code?: string; city?: string; include_full?: boolean }) => {
    const query = new URLSearchParams();
    if (params.package_id) query.set("package_id", params.package_id);
    if (params.service_id) query.set("service_id", params.service_id);
    if (params.postal_code) query.set("postal_code", params.postal_code);
    if (params.city) query.set("city", params.city);
    if (params.include_full) query.set("include_full", "1");
    return bookingRequest<{ slots: Slot[] }>(`/slots/?${query}`);
  },
  hold: (package_id: string, address_id: string, slot_id: string) => bookingRequest<Hold>("/checkout/holds/", "POST", { package_id, address_id, slot_id }),
  release: (id: string) => bookingRequest<void>(`/checkout/holds/${id}/`, "DELETE"),
  quote: (hold_id: string, items?: Array<{ package_id: string; quantity: number }>) =>
    bookingRequest<Quote>("/checkout/quote/", "POST", items && items.length > 0 ? { hold_id, items } : { hold_id }),
  confirm: (hold_id: string, quote_id: string, accepted_total_paise: number, key: string, problem_description = "") => bookingRequest<Booking>("/bookings/", "POST", { hold_id, quote_id, accepted_total_paise, terms_accepted: true, problem_description }, key),
  cart: () => bookingRequest<{ id: string; items: Array<{ id: string; service_id: string; service_slug: string; service_name: string; package_id: string | null; package_name: string | null; quantity: number }> }>("/cart/"),
  putCartItem: (serviceId: string, packageId: string, quantity: number) =>
    bookingRequest<{ id: string; items: unknown[] }>(`/cart/items/${encodeURIComponent(serviceId)}/`, "PUT", { package_id: packageId, quantity }),
  deleteCartItem: (serviceId: string, packageId?: string) =>
    bookingRequest<void>(`/cart/items/${encodeURIComponent(serviceId)}/${packageId ? `?package_id=${encodeURIComponent(packageId)}` : ""}`, "DELETE"),
  clearServerCart: () => bookingRequest<void>("/cart/", "DELETE"),
  bookings: (page = 1) => bookingRequest<{ count: number; results: Booking[] }>(`/bookings/?page=${page}`),
  booking: (id: string) => bookingRequest<Booking>(`/bookings/${id}/`),
  serviceReviews: (serviceIdOrSlug: string) => bookingRequest<ServiceReviewSummary>(`/services/${encodeURIComponent(serviceIdOrSlug)}/reviews/`),
  submitReview: (id: string, rating: number, comment: string, tags: string[] = [], photo?: File | null) => {
    if (photo && typeof FormData !== "undefined") {
      const fd = new FormData();
      fd.append("rating", String(rating));
      fd.append("comment", comment);
      fd.append("tags", JSON.stringify(tags));
      fd.append("photo", photo);
      return bookingRequest<ServiceReviewItem>(`/bookings/${id}/review/`, "POST", fd);
    }
    return bookingRequest<ServiceReviewItem>(`/bookings/${id}/review/`, "POST", { rating, comment, tags });
  },
  quotations: (id: string) => bookingRequest<{ quotations: JobQuotation[] }>(`/bookings/${id}/quotations/`),
  quotationDecision: (id: string, quoteId: string, action: "approve" | "reject") => bookingRequest<JobQuotation>(`/bookings/${id}/quotations/${quoteId}/${action}/`, "POST"),
  invoiceUrl: (id: string) => `${base}/api/v1/bookings/${encodeURIComponent(id)}/invoice/`,
  notificationPreferences: () => bookingRequest<NotificationPreferences>("/customers/notification-preferences/"),
  saveNotificationPreferences: (values: NotificationPreferences) => bookingRequest<NotificationPreferences>("/customers/notification-preferences/", "PUT", values),
  paymentOrder: (id: string, key: string) => bookingRequest<{ order_id: string; key_id: string; amount_paise: number; currency: string; expires_at: string }>(`/bookings/${id}/payment-order/`, "POST", {}, key),
  verifyPayment: (id: string, razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string) => bookingRequest<{ booking_id: string; status: string; payment_status: string }>(`/bookings/${id}/payment-verify/`, "POST", { razorpay_order_id, razorpay_payment_id, razorpay_signature }),
  balancePaymentOrder: (id: string, key: string) => bookingRequest<{ order_id: string; key_id: string; amount_paise: number; currency: string; expires_at: string }>(`/bookings/${id}/balance-order/`, "POST", {}, key),
  verifyBalancePayment: (id: string, razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string) => bookingRequest<{ booking_id: string; status: string; payment_status: string }>(`/bookings/${id}/balance-verify/`, "POST", { razorpay_order_id, razorpay_payment_id, razorpay_signature }),
  cancel: (id: string, expected_version: number) => bookingRequest<{ status: string; version: number }>(`/bookings/${id}/cancel/`, "POST", { expected_version }),
  reschedule: (id: string, new_hold_id: string, expected_version: number) => bookingRequest<{ status: string; version: number }>(`/bookings/${id}/reschedule/`, "POST", { new_hold_id, expected_version }),
  locationAutocomplete: (input: string, lat?: number, lng?: number, city?: string) => {
    const params = new URLSearchParams({ input });
    if (lat != null) params.set("lat", String(lat));
    if (lng != null) params.set("lng", String(lng));
    if (city) params.set("city", city);
    return bookingRequest<{ suggestions: LocationSuggestion[] }>(`/location/autocomplete/?${params}`);
  },
  locationGeocode: (placeId: string) =>
    bookingRequest<ResolvedLocation>(`/location/geocode/?place_id=${encodeURIComponent(placeId)}`),
  locationReverseGeocode: (lat: number, lng: number) =>
    bookingRequest<ResolvedLocation>(`/location/reverse-geocode/?lat=${lat}&lng=${lng}`),
  serviceAreaCheck: (params: { postal_code?: string; city?: string; locality?: string; service_id?: string }) => {
    const query = new URLSearchParams();
    if (params.postal_code) query.set("postal_code", params.postal_code);
    if (params.city) query.set("city", params.city);
    if (params.locality) query.set("locality", params.locality);
    if (params.service_id) query.set("service_id", params.service_id);
    return bookingRequest<ServiceAreaCheckResult>(`/service-areas/check/?${query}`);
  },
};
