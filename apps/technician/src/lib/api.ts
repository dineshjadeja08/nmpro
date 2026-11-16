export type Profile = { id: string; display_name: string; phone_e164: string; city: string; experience_years: number; bio: string; requested_zone_ids: string[]; verification_status: string; is_active: boolean; is_online: boolean; skills: { id: string; code: string; is_verified: boolean }[]; zones: { id: string; name: string; postal_code: string }[]; documents: { id: string; kind: string; status: string }[] };
export type Offer = { id: string; status: string; expires_at: string; booking_reference: string; service: string; package: string; start_at: string; end_at: string; zone: string; postal_code: string };
export type Quotation = { id: string; status: string; labour_paise: number; parts_paise: number; tax_paise: number; total_paise: number; valid_until: string; items: { description: string; quantity: number; unit_paise: number; total_paise: number }[] };
export type Job = {
  id: string; status: string; booking_id: string; booking_reference: string; booking_status: string; service: string; package: string;
  start_at: string; end_at: string; zone: string; customer: { name: string; phone: string };
  address: { line_1: string; locality: string; city: string; postal_code: string; landmark: string; latitude?: number | null; longitude?: number | null };
  problem_description?: string; payment_status?: string; pricing_model?: "FIXED_PRICE" | "INSPECTION_BASED"; invoice_available?: boolean; receipt_available?: boolean;
  events: { from_status: string; to_status: string; created_at: string }[];
  inspection: { reported_issue: string; diagnosis: string; work_recommended: string } | null; quotations: Quotation[];
};
export type Availability = { windows: { weekday: number; start_minute: number; end_minute: number }[]; time_off: { id: string; start_at: string; end_at: string; reason: string }[] };
export type Leave = { id: string; start_at: string; end_at: string; reason: string; status: "PENDING" | "APPROVED" | "REJECTED"; review_note: string };
export type Earnings = { totals: { PENDING: number; APPROVED: number; PAID: number }; completed_jobs: number; history: { id: string; booking_reference: string; amount_paise: number; status: string }[] };
export type JoinOptions = { skills: string[]; zones: { id: string; name: string; city: string; postal_code: string }[] };
export type EarningsReport = {
  period: "day" | "month" | "custom"; from: string; to: string; jobs: number; bucket: "day" | "month";
  totals: { CASH: number; UPI: number; ALL: number };
  buckets: { label: string; amount_paise: number; jobs: number }[];
  rows: { id: string; date: string; booking_reference: string; service: string; job_id: string; amount_paise: number; method: "CASH" | "UPI"; kind: string }[];
};
export type JoiningFee = { amount_paise: number; status: "PENDING" | "PAID" | "WAIVED"; method: string; paid_at: string | null; reference: string; settled: boolean; online_available: boolean; valid_until: string | null; membership_active: boolean; renewal_due: boolean; leads_this_year: number; leads_per_year: number | null };
export type FeeOrder = { order_id: string; key_id: string; amount_paise: number; currency: string; name: string; phone: string };
export type CollectInfo = { service_due_paise: number; extra_work_due_paise: number; total_due_paise: number; payment_status: string; can_collect: boolean; upi_uri: string; upi_payee: string };

const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
let csrf = "";
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function csrfToken() {
  const response = await fetch(`${base}/api/v1/auth/csrf/`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new ApiError("Could not initialize sign-in security.", response.status);
  csrf = (await response.json()).csrf_token;
}
function errorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return typeof payload === "string" ? payload : null;
  const p = payload as { error?: { message?: string; fields?: Record<string, string[]> }; detail?: string; otp?: string[] };
  const field = p.error?.fields ? Object.values(p.error.fields).flat()[0] : undefined;
  return field ?? p.error?.message ?? p.detail ?? p.otp?.[0] ?? null;
}
export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (method !== "GET" && !csrf) await csrfToken();
  const isForm = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1${path}`, { method, credentials: "include", cache: "no-store",
      headers: { ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
                 ...(method !== "GET" ? { "X-CSRFToken": csrf } : {}) },
      ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}) });
  } catch {
    throw new ApiError("No internet connection. Check your network and try again.", 0);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(errorMessage(payload) ?? "Request failed. Please try again.", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const api = {
  me: () => request<Profile>("/technicians/me/"),
  authMe: async () => {
    const session = await request<{ authenticated: boolean; id?: number; phone_e164?: string }>("/auth/session/");
    if (!session.authenticated) throw new ApiError("Sign in to continue.", 401);
    return { id: session.id!, phone_e164: session.phone_e164 ?? "" };
  },
  zones: () => request<{ zones: { id: string; name: string; city: string; postal_code: string }[] }>("/technicians/zones/"),
  otpRequest: (phone_e164: string) => request<{ challenge_id: string; development_code?: string }>("/auth/otp/request/", "POST", { phone_e164, app: "partner" }),
  otpVerify: async (phone_e164: string, challenge_id: string, code: string) => { const result = await request<{ id: number }>("/auth/otp/verify/", "POST", { phone_e164, challenge_id, code, app: "partner" }); await csrfToken(); return result; },
  joinOptions: () => request<JoinOptions>("/technicians/join-options/"),
  joinOtp: (phone: string) => request<{ challenge_id: string; development_code?: string }>("/technicians/join-otp/", "POST", { phone }),
  joinRequest: (form: FormData) => request<{ status: string; already_applied: boolean; message: string; joining_fee: JoiningFee }>("/technicians/join-requests/", "POST", form),
  joiningFee: () => request<JoiningFee>("/technicians/joining-fee/"),
  feeOrder: () => request<FeeOrder>("/technicians/joining-fee/order/", "POST", {}),
  feeVerify: (razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string) =>
    request<JoiningFee>("/technicians/joining-fee/verify/", "POST", { razorpay_order_id, razorpay_payment_id, razorpay_signature }),
  earningsReport: (params: Record<string, string>) => request<EarningsReport>(`/technicians/earnings/report/?${new URLSearchParams(params)}`),
  statementPath: (params: Record<string, string>) => `/technicians/earnings/statement/?${new URLSearchParams(params)}`,
  invoicePath: (jobId: string) => `/technicians/jobs/${jobId}/invoice/`,
  receiptPath: (jobId: string) => `/technicians/jobs/${jobId}/receipt/`,
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
  leaves: () => request<{ results: Leave[] }>("/technicians/leaves/"),
  requestLeave: (start_at: string, end_at: string, reason: string) => request<{ id: string; status: string }>("/technicians/leaves/", "POST", { start_at, end_at, reason }),
  offers: () => request<{ offers: Offer[] }>("/technicians/job-offers/"),
  offerAction: (id: string, action: "accept" | "decline") => request(`/technicians/job-offers/${id}/${action}/`, "POST"),
  jobs: () => request<{ jobs: Job[] }>("/technicians/jobs/"),
  job: (id: string) => request<Job>(`/technicians/jobs/${id}/`),
  jobAction: (id: string, action: string, body?: Record<string, string>) => request<{ id: string; status: string }>(`/technicians/jobs/${id}/${action}/`, "POST", body ?? {}),
  inspect: (id: string, body: { reported_issue: string; diagnosis: string; work_recommended: string; parts_required?: string; notes?: string }) => request(`/technicians/jobs/${id}/inspect/`, "POST", body),
  quotation: (id: string, body: { labour_paise: number; items: { description: string; quantity: number; unit_paise: number }[]; valid_until: string }) => request<Quotation>(`/technicians/jobs/${id}/quotation/`, "POST", body),
  complete: (id: string, body: { checklist: string[]; parts_used: string; work_notes: string }) => request(`/technicians/jobs/${id}/complete/`, "POST", body),
  shareLocation: (id: string, latitude: number, longitude: number, accuracy_m: number | null) =>
    request<{ accepted: boolean }>(`/technicians/jobs/${id}/location/`, "POST", { latitude: latitude.toFixed(6), longitude: longitude.toFixed(6), accuracy_m: accuracy_m == null ? null : Math.round(accuracy_m) }),
  collectInfo: (id: string) => request<CollectInfo>(`/technicians/jobs/${id}/collect/`),
  collect: (id: string, method: "CASH" | "UPI", amount_paise: number, upi_reference = "") =>
    request<{ collected_paise: number; payment_status: string }>(`/technicians/jobs/${id}/collect/`, "POST", { method, amount_paise, upi_reference }),
  earnings: () => request<Earnings>("/technicians/earnings/"),
  notifications: () => request<{ notifications: { id: string; event: string; booking_reference: string; created_at: string }[] }>("/technicians/notifications/"),
  pushConfig: () => request<{ enabled: boolean; public_key: string }>("/push/web/config/"),
  pushSubscribe: (sub: PushSubscriptionJSON) => request("/push/web/subscribe/", "POST", sub),
};

/** Download a protected file (PDF) with the signed-in session and save it on the phone. */
export async function downloadFile(path: string, filename: string) {
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1${path}`, { credentials: "include", cache: "no-store" });
  } catch {
    throw new ApiError("No internet connection. Check your network and try again.", 0);
  }
  if (!response.ok) throw new ApiError(response.status === 404 ? "Not available yet." : "Download failed. Please try again.", response.status);
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
