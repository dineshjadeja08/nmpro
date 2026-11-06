export type Profile = { id: string; display_name: string; phone_e164: string; city: string; experience_years: number; bio: string; requested_zone_ids: string[]; verification_status: string; is_active: boolean; is_online: boolean; skills: { id: string; code: string; is_verified: boolean }[]; zones: { id: string; name: string; postal_code: string }[]; documents: { id: string; kind: string; status: string }[] };
export type Offer = { id: string; status: string; expires_at: string; booking_reference: string; service: string; package: string; start_at: string; end_at: string; zone: string; postal_code: string };
export type Quotation = { id: string; status: string; labour_paise: number; parts_paise: number; tax_paise: number; total_paise: number; valid_until: string; items: { description: string; quantity: number; unit_paise: number; total_paise: number }[] };
export type Job = { id: string; status: string; booking_id: string; booking_reference: string; booking_status: string; service: string; package: string; start_at: string; end_at: string; zone: string; customer: { name: string; phone: string }; address: { line_1: string; locality: string; city: string; postal_code: string; landmark: string }; events: { from_status: string; to_status: string; created_at: string }[]; inspection: { reported_issue: string; diagnosis: string; work_recommended: string } | null; quotations: Quotation[] };
export type Availability = { windows: { weekday: number; start_minute: number; end_minute: number }[]; time_off: { id: string; start_at: string; end_at: string; reason: string }[] };
export type Earnings = { totals: { PENDING: number; APPROVED: number; PAID: number }; completed_jobs: number; history: { id: string; booking_reference: string; amount_paise: number; status: string }[] };

const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
let csrf = "";
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function csrfToken() {
  const response = await fetch(`${base}/api/v1/auth/csrf/`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new ApiError("Could not initialize sign-in security.", response.status);
  csrf = (await response.json()).csrf_token;
}
export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (method !== "GET" && !csrf) await csrfToken();
  const isForm = body instanceof FormData;
  const response = await fetch(`${base}/api/v1${path}`, { method, credentials: "include", cache: "no-store",
    headers: { ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
               ...(method !== "GET" ? { "X-CSRFToken": csrf } : {}) },
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error?.message ?? payload?.detail ?? (typeof payload === "string" ? payload : "Request failed. Please try again."), response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const api = {
  me: () => request<Profile>("/technicians/me/"),
  authMe: () => request<{ id: number; phone_e164: string }>("/auth/me/"),
  zones: () => request<{ zones: { id: string; name: string; city: string; postal_code: string }[] }>("/technicians/zones/"),
  otpRequest: (phone_e164: string) => request<{ challenge_id: string; development_code?: string }>("/auth/otp/request/", "POST", { phone_e164 }),
  otpVerify: async (phone_e164: string, challenge_id: string, code: string) => { const result = await request<{ id: number }>("/auth/otp/verify/", "POST", { phone_e164, challenge_id, code }); await csrfToken(); return result; },
  logout: async () => { await request("/auth/logout/", "POST"); csrf = ""; },
  apply: (body: { display_name: string; city: string; experience_years: number; bio?: string }) => request<Profile>("/technicians/apply/", "POST", body),
  update: (body: Partial<Profile>) => request<Profile>("/technicians/me/", "PATCH", body),
  submit: () => request<Profile>("/technicians/submit/", "POST"),
  verification: () => request<{ status: string; history: { to_status: string; note: string; created_at: string }[] }>("/technicians/verification/"),
  skills: () => request<{ available_codes: string[]; skills: { code: string; is_verified: boolean }[] }>("/technicians/skills/"),
  saveSkills: (codes: string[]) => request("/technicians/skills/", "PATCH", { codes }),
  upload: (kind: string, file: File, job_id?: string) => { const body = new FormData(); body.append("kind", kind); body.append("file", file); if (job_id) body.append("job_id", job_id); return request<{ id: string }>("/technicians/documents/", "POST", body); },
  availability: () => request<Availability>("/technicians/availability/"),
  saveAvailability: (windows: Availability["windows"]) => request<Availability>("/technicians/availability/", "PUT", { windows }),
  timeOff: (start_at: string, end_at: string, reason: string) => request("/technicians/availability/time-off/", "POST", { start_at, end_at, reason }),
  offers: () => request<{ offers: Offer[] }>("/technicians/job-offers/"),
  offerAction: (id: string, action: "accept" | "decline") => request(`/technicians/job-offers/${id}/${action}/`, "POST"),
  jobs: () => request<{ jobs: Job[] }>("/technicians/jobs/"),
  job: (id: string) => request<Job>(`/technicians/jobs/${id}/`),
  jobAction: (id: string, action: string) => request(`/technicians/jobs/${id}/${action}/`, "POST"),
  inspect: (id: string, body: { reported_issue: string; diagnosis: string; work_recommended: string; parts_required?: string; notes?: string }) => request(`/technicians/jobs/${id}/inspect/`, "POST", body),
  quotation: (id: string, body: { labour_paise: number; items: { description: string; quantity: number; unit_paise: number }[]; valid_until: string }) => request<Quotation>(`/technicians/jobs/${id}/quotation/`, "POST", body),
  complete: (id: string, body: { checklist: string[]; parts_used: string; work_notes: string }) => request(`/technicians/jobs/${id}/complete/`, "POST", body),
  earnings: () => request<Earnings>("/technicians/earnings/"),
  notifications: () => request<{ notifications: { id: string; event: string; booking_reference: string; created_at: string }[] }>("/technicians/notifications/"),
};
