export type Booking = { id: string; reference: string; version: number; status: string; priority: string; payment_status: string; customer_id: number; customer_phone: string; customer_name: string; service: string; package: string; zone: string; start_at: string; end_at: string; address: { line_1: string; locality: string; city: string; postal_code: string }; price_paise: number | null; price_lines: { code: string; amount_paise: number }[]; technician: { id: string; name: string; status: string } | null; timeline?: { status: string; at: string; reason: string }[]; notes?: { text: string; at: string }[]; support?: Ticket[] };
export type Technician = { id: string; name: string; status: string; online: boolean; skills: string[]; zones: string[]; active_jobs: number; availability?: { weekday: number; start_minute: number; end_minute: number }[]; jobs?: { booking_id: string; status: string; start_at: string }[]; notes?: { text: string; at: string }[] };
export type Ticket = { id: string; reference: string; customer_id: number; booking_id: string | null; category: string; priority: string; subject: string; description: string; status: string; assigned_to: number | null; created_at: string; events?: { kind: string; text: string; from_status: string; to_status: string; created_at: string }[] };
export type Escalation = { id: string; booking_id: string | null; ticket_id: string | null; category: string; priority: string; status: string; assigned_to: number | null; notes: string; resolution: string; created_at: string };
export type Candidate = { id: string; name: string; score: number; workload: number; reasons: string[] };
export type Page<T> = { count: number; page: number; results: T[] };
export type Dashboard = { metrics: Record<string, number>; recent_bookings: Booking[]; upcoming_appointments: Booking[]; urgent_escalations: Escalation[]; distribution: { status: string; count: number }[]; alerts: { event: string; reference: string; created_at: string }[]; sla_warnings: { code: string; deadline_at: string; booking_id: string | null }[] };
export type Lead = { id: string; lead_reference: string; customer_name: string; mobile_number: string; alternate_mobile: string; email: string; service_category_id: string; service_category: string; service_id: string; service: string; zone_id: string | null; problem_description: string; address: string; landmark: string; area: string; city: string; pincode: string; preferred_date: string | null; preferred_time: string | null; urgency: string; source: string; status: string; priority: string; assigned_to: number | null; assigned_to_phone: string | null; follow_up_at: string | null; internal_notes: string; converted_booking_id: string | null; created_at: string; activities?: { kind: string; detail: Record<string, unknown>; created_at: string; actor_id: number }[]; follow_ups?: { id: string; due_at: string; notes: string; assigned_to: number; completed_at: string | null }[] };
export type LeadSummary = { total: number; new: number; follow_ups_due: number; qualified: number; converted: number; conversion_rate: number };
export type ConversionPackage = { id: string; name: string; payment_policy: string; total_paise: number; slots: { id: string; start_at: string; remaining: number }[] };
const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
let csrf = "";
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (method !== "GET" && !csrf) { const token = await fetch(`${base}/api/v1/auth/csrf/`, { credentials: "include" }); if (!token.ok) throw new ApiError("Could not initialize session security.", token.status); csrf = (await token.json()).csrf_token; }
  const response = await fetch(`${base}/api/v1${path}`, { method, credentials: "include", cache: "no-store", headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { "X-CSRFToken": csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) { const payload = await response.json().catch(() => null); throw new ApiError(payload?.error?.message ?? payload?.detail ?? "Request failed. Refresh and try again.", response.status); }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
const q = (params: Record<string, string | number | undefined>) => { const p = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") p.set(key, String(value)); }); return p.toString(); };
export const api = {
  me: () => request<{ id: number; phone_e164: string }>("/auth/me/"),
  otpRequest: (phone_e164: string) => request<{ challenge_id: string; development_code?: string }>("/auth/otp/request/", "POST", { phone_e164 }),
  otpVerify: async (phone_e164: string, challenge_id: string, code: string) => { await request("/auth/otp/verify/", "POST", { phone_e164, challenge_id, code }); csrf = ""; },
  logout: async () => { await request("/auth/logout/", "POST"); csrf = ""; },
  dashboard: (params: Record<string, string>) => request<Dashboard>(`/operations/dashboard/?${q(params)}`),
  leads: (params: Record<string, string | number>) => request<Page<Lead>>(`/operations/leads/?${q(params)}`),
  leadSummary: () => request<LeadSummary>("/operations/leads/summary/"),
  leadFollowUps: (state: string) => request<{ count: number; results: { id: string; lead_id: string; lead_reference: string; customer_name: string; due_at: string; notes: string; completed_at: string | null }[] }>(`/operations/leads/follow-ups/?${q({ state })}`),
  lead: (id: string) => request<Lead>(`/operations/leads/${id}/`),
  createLead: (body: unknown) => request<Lead>("/operations/leads/", "POST", body),
  updateLead: (id: string, body: unknown) => request<Lead>(`/operations/leads/${id}/`, "PATCH", body),
  followUp: (id: string, body: unknown) => request<Lead>(`/operations/leads/${id}/follow-ups/`, "POST", body),
  completeFollowUp: (id: string, followUpId: string) => request<Lead>(`/operations/leads/${id}/follow-ups/${followUpId}/complete/`, "POST"),
  conversionOptions: (id: string) => request<{ packages: ConversionPackage[]; detail?: string }>(`/operations/leads/${id}/conversion-options/`),
  convertLead: (id: string, body: unknown) => request<Lead>(`/operations/leads/${id}/convert/`, "POST", body),
  catalog: () => request<{ categories: { id: string; slug: string; name: string }[]; services: { id: string; category: string; name: string; packages: { id: string; name: string }[] }[] }>("/catalog/"),
  bookings: (params: Record<string, string | number>) => request<Page<Booking>>(`/operations/bookings/?${q(params)}`),
  booking: (id: string) => request<Booking>(`/operations/bookings/${id}/`),
  slots: (id: string) => request<{ slots: { id: string; start_at: string; remaining: number }[] }>(`/operations/bookings/${id}/slots/`),
  bookingAction: (id: string, action: string, body: unknown) => request(`/operations/bookings/${id}/${action}/`, "POST", body),
  note: (id: string, text: string) => request(`/operations/bookings/${id}/notes/`, "POST", { text }),
  dispatch: () => request<{ groups: Record<string, Booking[]>; rule: Record<string, unknown> | null }>("/operations/dispatch/"),
  candidates: (booking_id: string) => request<{ candidates: Candidate[] }>(`/operations/dispatch/candidates/?${q({ booking_id })}`),
  attempts: (booking_id: string) => request<{ attempts: { id: string; technician: string; status: string; mode: string; created_at: string }[] }>(`/operations/dispatch/attempts/?${q({ booking_id })}`),
  technicians: (params: Record<string, string | number>) => request<Page<Technician>>(`/operations/technicians/?${q(params)}`),
  technician: (id: string) => request<Technician>(`/operations/technicians/${id}/`),
  technicianNote: (id: string, text: string) => request(`/operations/technicians/${id}/notes/`, "POST", { text }),
  schedule: (params: Record<string, string>) => request<{ bookings: Booking[]; available_slots: { id: string; start_at: string; zone: string; package: string; remaining: number }[]; conflicts: { first: string; second: string }[] }>(`/operations/schedule/?${q(params)}`),
  customers: (params: Record<string, string | number>) => request<Page<{ id: number; phone: string; bookings: number }>>(`/operations/customers/?${q(params)}`),
  customer: (id: string) => request<{ id: number; phone: string; bookings: Booking[]; tickets: Ticket[] }>(`/operations/customers/${id}/`),
  tickets: (params: Record<string, string | number>) => request<Page<Ticket>>(`/operations/support/?${q(params)}`),
  ticket: (id: string) => request<Ticket>(`/operations/support/${id}/`),
  createTicket: (body: unknown) => request<Ticket>("/operations/support/", "POST", body),
  updateTicket: (id: string, body: unknown) => request<Ticket>(`/operations/support/${id}/`, "PATCH", body),
  escalations: (params: Record<string, string | number>) => request<Page<Escalation>>(`/operations/escalations/?${q(params)}`),
  createEscalation: (body: unknown) => request<Escalation>("/operations/escalations/", "POST", body),
  updateEscalation: (id: string, body: unknown) => request<Escalation>(`/operations/escalations/${id}/`, "PATCH", body),
  reports: (params: Record<string, string>) => request<{ total: number; assignment_rate: number; cancellation_rate: number; completion_rate: number; sla_breaches: number; support_tickets: number; by_date: { created_at__date: string; count: number }[]; by_service: { service__name: string; count: number }[]; by_zone: { slot__zone__name: string; count: number }[]; technician_utilization: { id: string; display_name: string; completed: number; utilization_rate: number | null }[] }>(`/operations/reports/?${q(params)}`),
  reportCsv: (params: Record<string, string>) => `${base}/api/v1/operations/reports/?${q({ ...params, format: "csv" })}`,
  settings: () => request<{ dispatch: { name: string; is_active: boolean; automatic_enabled: boolean; offer_timeout_minutes: number; maximum_attempts: number; travel_buffer_minutes: number; weight_workload: number; weight_availability: number } | null; sla: { code: string; duration_minutes: number; warning_minutes: number; is_active: boolean }[] }>("/operations/settings/"),
  saveSettings: (body: unknown) => request("/operations/settings/", "PATCH", body),
};
