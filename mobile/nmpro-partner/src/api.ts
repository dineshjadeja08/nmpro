import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Backend: the NammaPros Django API. Set EXPO_PUBLIC_API_BASE_URL to point a dev build at a local server. */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  "https://nmpro.onrender.com";

export type Profile = {
  id: string; display_name: string; phone_e164: string; city: string; experience_years: number;
  verification_status: string; is_active: boolean; is_online: boolean;
  skills: { id: string; code: string; is_verified: boolean }[];
  zones: { id: string; name: string; postal_code: string }[];
  documents: { id: string; kind: string; status: string }[];
};
export type Offer = {
  id: string; status: string; expires_at: string; booking_reference: string; service: string; package: string;
  start_at: string; end_at: string; zone: string; postal_code: string;
};
export type Job = {
  id: string; status: string; booking_reference: string; service: string; package: string; start_at: string; end_at: string;
  zone: string; customer: { name: string; phone: string };
  address: { line_1: string; locality: string; city: string; postal_code: string; landmark: string; latitude?: number | null; longitude?: number | null };
  problem_description?: string;
};
export type JoinOptions = { skills: string[]; zones: { id: string; name: string; city: string; postal_code: string }[] };
export type JoiningFee = {
  amount_paise: number; status: string; paid_at: string | null; settled: boolean; online_available: boolean;
  valid_until: string | null; membership_active: boolean; renewal_due: boolean; leads_this_year: number; leads_per_year: number | null;
};
export type Tokens = { access: string; refresh: string };
/** A photo or PDF picked on the phone, sent as a multipart file. */
export type PickedFile = { uri: string; name: string; type: string };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// ---- token storage (Keychain / Keystore; browser storage only for the web preview) ----
const KEY = "nmpro.partner.tokens";
let tokens: Tokens | null = null;

async function readTokens(): Promise<Tokens | null> {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

async function writeTokens(next: Tokens | null) {
  tokens = next;
  try {
    if (Platform.OS === "web") {
      if (next) globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
      else globalThis.localStorage?.removeItem(KEY);
    } else if (next) await SecureStore.setItemAsync(KEY, JSON.stringify(next));
    else await SecureStore.deleteItemAsync(KEY);
  } catch { /* the app keeps working for this session */ }
}

export async function loadSession(): Promise<boolean> {
  tokens = await readTokens();
  return Boolean(tokens?.access);
}

export async function signOut() {
  const refresh = tokens?.refresh;
  await writeTokens(null);
  if (refresh) await raw("/auth/logout/", "POST", { refresh }).catch(() => undefined);
}

function errorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return typeof payload === "string" ? payload : null;
  const p = payload as { error?: { message?: string; fields?: Record<string, string[] | string> }; detail?: string };
  const field = p.error?.fields ? Object.values(p.error.fields).flat()[0] : undefined;
  return (typeof field === "string" ? field : null) ?? p.error?.message ?? p.detail ?? null;
}

async function raw(path: string, method: string, body?: unknown, auth = true): Promise<Response> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = { "X-NMPRO-Client": "partner-app", Accept: "application/json" };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  if (auth && tokens?.access) headers.Authorization = `Bearer ${tokens.access}`;
  try {
    return await fetch(`${API_BASE}/api/v1${path}`, {
      method, headers, credentials: "omit",
      ...(body ? { body: isForm ? (body as FormData) : JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError("No internet connection. Check your network and try again.", 0);
  }
}

let refreshing: Promise<boolean> | null = null;
async function refreshTokens(): Promise<boolean> {
  if (!tokens?.refresh) return false;
  refreshing ??= (async () => {
    const res = await raw("/auth/refresh/", "POST", { refresh: tokens?.refresh }, false).catch(() => null);
    if (!res || !res.ok) { await writeTokens(null); return false; }
    const next = (await res.json()) as Tokens;
    await writeTokens({ access: next.access, refresh: next.refresh });
    return true;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res = await raw(path, method, body);
  if (res.status === 401 && (await refreshTokens())) res = await raw(path, method, body);
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(errorMessage(payload) ?? "Something went wrong. Please try again.", res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function form(fields: Record<string, string>, files: Record<string, PickedFile | null>) {
  const body = new FormData();
  Object.entries(fields).forEach(([k, v]) => body.append(k, v));
  for (const [k, f] of Object.entries(files)) {
    if (!f) continue;
    if (Platform.OS === "web") {
      // The browser preview needs a real Blob; phones send { uri, name, type } as the file part.
      const blob = await (await fetch(f.uri)).blob();
      body.append(k, blob, f.name);
    } else {
      body.append(k, f as unknown as Blob);
    }
  }
  return body;
}

export const api = {
  // Sign in (approved partners) and join (new partners)
  otpRequest: (phone_e164: string) =>
    request<{ challenge_id: string; development_code?: string }>("/auth/otp/request/", "POST", { phone_e164, app: "partner" }),
  otpVerify: async (phone_e164: string, challenge_id: string, code: string) => {
    const result = await request<Tokens & { id: number }>("/auth/otp/verify/", "POST", { phone_e164, challenge_id, code, app: "partner" });
    await writeTokens({ access: result.access, refresh: result.refresh });
  },
  joinOptions: () => request<JoinOptions>("/technicians/join-options/"),
  joinOtp: (phone: string) => request<{ challenge_id: string; development_code?: string }>("/technicians/join-otp/", "POST", { phone }),
  joinRequest: async (fields: Record<string, string>, files: Record<string, PickedFile | null>) => {
    const result = await request<Tokens & { status: string; joining_fee: JoiningFee }>("/technicians/join-requests/", "POST", await form(fields, files));
    if (result.access) await writeTokens({ access: result.access, refresh: result.refresh });
    return result;
  },
  joiningFee: () => request<JoiningFee>("/technicians/joining-fee/"),

  // Signed in
  me: () => request<Profile>("/technicians/me/"),
  setOnline: (is_online: boolean) => request<Profile>("/technicians/me/", "PATCH", { is_online }),
  offers: () => request<{ offers: Offer[] }>("/technicians/job-offers/"),
  offerAction: (id: string, action: "accept" | "decline") =>
    request<{ assignment_id?: string; status: string }>(`/technicians/job-offers/${id}/${action}/`, "POST"),
  jobs: () => request<{ jobs: Job[] }>("/technicians/jobs/"),
  job: (id: string) => request<Job>(`/technicians/jobs/${id}/`),
};
