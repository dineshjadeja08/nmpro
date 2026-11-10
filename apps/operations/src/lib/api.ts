import type {
  OpsBooking,
  OpsCandidate,
  OpsConversionPackage,
  OpsCustomerDetail,
  OpsCustomerListItem,
  OpsDashboard,
  OpsDispatchAttempt,
  OpsEscalation,
  OpsLead,
  OpsLeadFollowUpItem,
  OpsLeadSummary,
  OpsPage,
  OpsReportsResponse,
  OpsScheduleResponse,
  OpsSettingsResponse,
  OpsTechnician,
  OpsTicket,
} from "@nammapros/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

let csrf = "";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (method !== "GET" && !csrf) {
    const token = await fetch(`${API_BASE_URL}/api/v1/auth/csrf/`, { credentials: "include" });
    if (!token.ok) {
      throw new ApiError("Could not initialize session security.", token.status);
    }
    csrf = (await token.json()).csrf_token;
  }

  const response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRFToken": csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const fieldMsg =
      payload?.error?.fields && typeof payload.error.fields === "object"
        ? Object.values(payload.error.fields).flat().join(" ")
        : "";
    const msg =
      payload?.error?.message ??
      payload?.detail ??
      (fieldMsg || `Request failed (${response.status}).`);
    throw new ApiError(msg, response.status, payload?.error?.code);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      p.set(key, String(value));
    }
  });
  return p.toString();
};

export type OpsMe = {
  id: number;
  phone_e164: string;
  username: string;
  email: string;
  full_name: string;
};

export type OpsCatalog = {
  categories: { id: string; slug: string; name: string }[];
  services: {
    id: string;
    category: string;
    name: string;
    packages: { id: string; name: string }[];
  }[];
};

export type OpsServiceArea = {
  id: string;
  name: string;
  city: string;
  state: string;
  postal_code: string;
};

export type OpsZoneGrant = {
  id: string;
  user_id: number;
  zone_id: string;
};

export const api = {
  // Auth
  me: () => request<OpsMe>("/auth/me/"),
  otpRequest: (phone_e164: string) =>
    request<{ challenge_id: string; expires_at: string; development_code?: string }>("/auth/otp/request/", "POST", {
      phone_e164,
    }),
  otpVerify: async (phone_e164: string, challenge_id: string, code: string) => {
    await request("/auth/otp/verify/", "POST", { phone_e164, challenge_id, code });
    csrf = "";
  },
  passwordLogin: async (username: string, password: string) => {
    await request("/auth/password/login/", "POST", { username, password });
    csrf = "";
  },
  logout: async () => {
    await request("/auth/logout/", "POST");
    csrf = "";
  },

  // Reference data & zone grants
  catalog: () => request<OpsCatalog>("/catalog/"),
  serviceAreas: () =>
    request<{ areas?: OpsServiceArea[]; results?: OpsServiceArea[] }>("/service-areas/").then(
      (res) => res.areas ?? res.results ?? []
    ),
  zoneGrants: () => request<{ results: OpsZoneGrant[] }>("/operations/lead-zone-grants/"),
  locationAutocomplete: (input: string) =>
    request<{ suggestions: { id: string; description: string; main_text: string; secondary_text: string }[] }>(
      `/location/autocomplete/?${qs({ input })}`
    ),
  locationGeocode: (place_id: string) =>
    request<{
      formatted_address: string;
      house_flat: string;
      street: string;
      locality: string;
      city: string;
      state: string;
      postal_code: string;
      latitude: number | null;
      longitude: number | null;
    }>(`/location/geocode/?${qs({ place_id })}`),

  // Dashboard
  dashboard: (params: Record<string, string>) => request<OpsDashboard>(`/operations/dashboard/?${qs(params)}`),

  // Bookings
  bookings: (params: Record<string, string | number>) =>
    request<OpsPage<OpsBooking>>(`/operations/bookings/?${qs(params)}`),
  booking: (id: string) => request<OpsBooking>(`/operations/bookings/${id}/`),
  bookingSlots: (id: string) =>
    request<{ slots: { id: string; start_at: string; remaining: number }[] }>(`/operations/bookings/${id}/slots/`),
  bookingAction: (id: string, action: string, body: unknown) =>
    request(`/operations/bookings/${id}/${action}/`, "POST", body),
  bookingNote: (id: string, text: string) => request<{ id: string }>(`/operations/bookings/${id}/notes/`, "POST", { text }),

  // Dispatch
  dispatch: () =>
    request<{ groups: Record<string, OpsBooking[]>; rule: Record<string, unknown> | null }>("/operations/dispatch/"),
  candidates: (booking_id: string) =>
    request<{ candidates: OpsCandidate[]; rule?: Record<string, unknown> | null }>(
      `/operations/dispatch/candidates/?${qs({ booking_id })}`
    ),
  attempts: (booking_id: string) =>
    request<{ attempts: OpsDispatchAttempt[] }>(`/operations/dispatch/attempts/?${qs({ booking_id })}`),
  createAttemptOffer: (booking_id: string, technician_id: string, expected_version: number) =>
    request<{ id: string; status: string }>("/operations/dispatch/attempts/", "POST", {
      booking_id,
      technician_id,
      expected_version,
    }),

  // Leads CRM
  leads: (params: Record<string, string | number>) => request<OpsPage<OpsLead>>(`/operations/leads/?${qs(params)}`),
  leadSummary: () => request<OpsLeadSummary>("/operations/leads/summary/"),
  leadExportUrl: (params: Record<string, string> = {}) => `${API_BASE_URL}/api/v1/operations/leads/export/?${qs(params)}`,
  leadFollowUps: (state: string, page = 1) =>
    request<OpsPage<OpsLeadFollowUpItem>>(`/operations/leads/follow-ups/?${qs({ state, page })}`),
  lead: (id: string) => request<OpsLead>(`/operations/leads/${id}/`),
  leadActivities: (id: string) =>
    request<{ results: { id: string; kind: string; detail: Record<string, unknown>; actor: string | null; created_at: string }[] }>(
      `/operations/leads/${id}/activities/`
    ),
  createLead: (body: unknown) => request<OpsLead>("/operations/leads/", "POST", body),
  updateLead: (id: string, body: unknown) => request<OpsLead>(`/operations/leads/${id}/`, "PATCH", body),
  addLeadFollowUp: (id: string, body: { due_at: string; notes?: string; assigned_to?: number }) =>
    request<OpsLead>(`/operations/leads/${id}/follow-ups/`, "POST", body),
  completeLeadFollowUp: (id: string, followUpId: string) =>
    request<OpsLead>(`/operations/leads/${id}/follow-ups/${followUpId}/complete/`, "POST"),
  recordLeadContact: (id: string, body: { channel: string; outcome?: string; notes?: string }) =>
    request<OpsLead>(`/operations/leads/${id}/record-contact/`, "POST", body),
  scheduleLead: (id: string, body: { preferred_date: string; preferred_time?: string | null }) =>
    request<OpsLead>(`/operations/leads/${id}/schedule/`, "POST", body),
  sendLeadReminder: (id: string, body: { channel: "SMS" | "WHATSAPP" | "EMAIL"; note?: string }) =>
    request(`/operations/leads/${id}/send-reminder/`, "POST", body),
  sendLeadPaymentLink: (id: string, body: { channel: "SMS" | "WHATSAPP"; payment_scope: "FULL" | "ADVANCE"; amount_paise?: number }) =>
    request<{ id: string; payment_status: string; payment_link_url: string; payment_delivery_status: string }>(
      `/operations/leads/${id}/send-payment-link/`,
      "POST",
      body
    ),
  recordLeadManualPayment: (id: string, body: { amount_paise: number; method: string; reference?: string }) =>
    request<{ id: string; payment_status: string; manual_paid_paise: number }>(
      `/operations/leads/${id}/record-manual-payment/`,
      "POST",
      body
    ),
  conversionOptions: (id: string) =>
    request<{ packages: OpsConversionPackage[]; detail?: string }>(`/operations/leads/${id}/conversion-options/`),
  convertLead: (
    id: string,
    body: { package_id?: string; slot_id?: string; accepted_total_paise?: number; notes?: string }
  ) => request<OpsLead>(`/operations/leads/${id}/convert/`, "POST", body),

  // Technicians, Schedule, Customers
  technicians: (params: Record<string, string | number>) =>
    request<OpsPage<OpsTechnician>>(`/operations/technicians/?${qs(params)}`),
  technician: (id: string) => request<OpsTechnician>(`/operations/technicians/${id}/`),
  technicianNote: (id: string, text: string) =>
    request<{ id: string }>(`/operations/technicians/${id}/notes/`, "POST", { text }),
  schedule: (params: Record<string, string | number>) =>
    request<OpsScheduleResponse>(`/operations/schedule/?${qs(params)}`),
  customers: (params: Record<string, string | number>) =>
    request<OpsPage<OpsCustomerListItem>>(`/operations/customers/?${qs(params)}`),
  customer: (id: string | number) => request<OpsCustomerDetail>(`/operations/customers/${id}/`),

  // Support & Escalations
  tickets: (params: Record<string, string | number>) => request<OpsPage<OpsTicket>>(`/operations/support/?${qs(params)}`),
  ticket: (id: string) => request<OpsTicket>(`/operations/support/${id}/`),
  createTicket: (body: {
    customer_id: number;
    booking_id?: string;
    category: string;
    priority: string;
    subject: string;
    description: string;
  }) => request<OpsTicket>("/operations/support/", "POST", body),
  updateTicket: (id: string, body: { status?: string; assigned_to?: number; note?: string; communication?: string }) =>
    request<OpsTicket>(`/operations/support/${id}/`, "PATCH", body),
  escalations: (params: Record<string, string | number>) =>
    request<OpsPage<OpsEscalation>>(`/operations/escalations/?${qs(params)}`),
  createEscalation: (body: {
    booking_id?: string;
    ticket_id?: string;
    category: string;
    priority: string;
    notes?: string;
  }) => request<OpsEscalation>("/operations/escalations/", "POST", body),
  updateEscalation: (
    id: string,
    body: { status?: string; assigned_to?: number; notes?: string; resolution?: string }
  ) => request<OpsEscalation>(`/operations/escalations/${id}/`, "PATCH", body),

  // Reports & Settings
  reports: (params: Record<string, string>) => request<OpsReportsResponse>(`/operations/reports/?${qs(params)}`),
  reportCsvUrl: (params: Record<string, string>) => `${API_BASE_URL}/api/v1/operations/reports/?${qs({ ...params, format: "csv" })}`,
  settings: () => request<OpsSettingsResponse>("/operations/settings/"),
  saveSettings: (body: unknown) => request("/operations/settings/", "PATCH", body),
};
