export type Package = { id: string; name: string; pricing_model: "FIXED_PRICE" | "INSPECTION_BASED"; duration_minutes: number; inclusions: string[]; exclusions: string[] };
export type Address = { id: string; line_1: string; label: string; contact_name: string; contact_phone: string; house_flat: string; street: string; locality: string; city: string; state: string; postal_code: string; landmark: string; is_default: boolean };
export type Slot = { id: string; start_at: string; end_at: string; remaining: number; version: number };
export type Hold = { id: string; expires_at: string };
export type NotificationPreferences = { whatsapp_opt_in: boolean; sms_opt_in: boolean; email_opt_in: boolean };
export type Quote = { id: string; hold_id: string; expires_at: string; lines: { code: string; amount_paise: number }[]; total_paise: number; currency: string; pricing_policy_id: string; pricing_version: number; payment_policy: "PREPAID" | "PAY_AT_VISIT" };
export type Booking = { id: string; reference: string; status: string; payment_status: string; payment_expires_at?: string | null; invoice_available?: boolean; payment_attempt_unresolved?: boolean; version: number; service: string; package: string; package_id: string; address_id: string; can_cancel: boolean; can_reschedule: boolean; address: { label: string; line_1: string; locality: string; city: string; postal_code: string }; slot: { start_at: string; end_at: string }; price: { lines: { code: string; amount_paise: number }[]; total_paise: number; currency: string }; events: { from_status: string; to_status: string; created_at: string }[] };
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
    const response = await fetch(`${base}/api/v1${path}`, {
      method, credentials: "include", signal: controller.signal, cache: "no-store",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" ? { "X-CSRFToken": csrfToken || decodeURIComponent(cookie("csrftoken")) } : {}),
        ...(key ? { "Idempotency-Key": key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
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
  otpRequest: (phone_e164: string) => bookingRequest<{ challenge_id: string; expires_at: string; development_code?: string }>("/auth/otp/request/", "POST", { phone_e164 }),
  otpVerify: async (phone_e164: string, challenge_id: string, code: string) => {
    const result = await bookingRequest<{ id: number }>("/auth/otp/verify/", "POST", { phone_e164, challenge_id, code });
    await refreshCsrf();
    return result;
  },
  logout: async () => { const result = await bookingRequest<void>("/auth/logout/", "POST"); csrfToken = ""; return result; },
  addresses: () => bookingRequest<{ addresses: Address[] }>("/customers/addresses/"),
  createAddress: (body: Omit<Address, "id" | "line_1">) => bookingRequest<Address>("/customers/addresses/", "POST", body),
  updateAddress: (id: string, body: Partial<Omit<Address, "id" | "line_1">>) => bookingRequest<Address>(`/customers/addresses/${id}/`, "PATCH", body),
  archiveAddress: (id: string) => bookingRequest<void>(`/customers/addresses/${id}/`, "DELETE"),
  serviceability: (package_id: string, address_id: string) => bookingRequest<{ supported: boolean; reason: string | null }>("/serviceability/check/", "POST", { package_id, address_id }),
  slots: (package_id: string, address_id: string, start: string, end: string) => bookingRequest<{ slots: Slot[] }>(`/availability/slots/?${new URLSearchParams({ package_id, address_id, start, end })}`),
  hold: (package_id: string, address_id: string, slot_id: string) => bookingRequest<Hold>("/checkout/holds/", "POST", { package_id, address_id, slot_id }),
  release: (id: string) => bookingRequest<void>(`/checkout/holds/${id}/`, "DELETE"),
  quote: (hold_id: string) => bookingRequest<Quote>("/checkout/quote/", "POST", { hold_id }),
  confirm: (hold_id: string, quote_id: string, accepted_total_paise: number, key: string) => bookingRequest<Booking>("/bookings/", "POST", { hold_id, quote_id, accepted_total_paise, terms_accepted: true }, key),
  bookings: (page = 1) => bookingRequest<{ count: number; results: Booking[] }>(`/bookings/?page=${page}`),
  booking: (id: string) => bookingRequest<Booking>(`/bookings/${id}/`),
  quotations: (id: string) => bookingRequest<{ quotations: JobQuotation[] }>(`/bookings/${id}/quotations/`),
  quotationDecision: (id: string, quoteId: string, action: "approve" | "reject") => bookingRequest<JobQuotation>(`/bookings/${id}/quotations/${quoteId}/${action}/`, "POST"),
  invoiceUrl: (id: string) => `${base}/api/v1/bookings/${encodeURIComponent(id)}/invoice/`,
  notificationPreferences: () => bookingRequest<NotificationPreferences>("/customers/notification-preferences/"),
  saveNotificationPreferences: (values: NotificationPreferences) => bookingRequest<NotificationPreferences>("/customers/notification-preferences/", "PUT", values),
  paymentOrder: (id: string, key: string) => bookingRequest<{ order_id: string; key_id: string; amount_paise: number; currency: string; expires_at: string }>(`/bookings/${id}/payment-order/`, "POST", {}, key),
  verifyPayment: (id: string, razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string) => bookingRequest<{ booking_id: string; status: string; payment_status: string }>(`/bookings/${id}/payment-verify/`, "POST", { razorpay_order_id, razorpay_payment_id, razorpay_signature }),
  cancel: (id: string, expected_version: number) => bookingRequest<{ status: string; version: number }>(`/bookings/${id}/cancel/`, "POST", { expected_version }),
  reschedule: (id: string, new_hold_id: string, expected_version: number) => bookingRequest<{ status: string; version: number }>(`/bookings/${id}/reschedule/`, "POST", { new_hold_id, expected_version }),
};
