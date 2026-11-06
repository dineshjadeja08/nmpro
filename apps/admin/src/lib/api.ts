export type RecordValue = string | number | boolean | null | RecordValue[] | { [key: string]: RecordValue };
export type Row = { id?: string | number; [key: string]: RecordValue | undefined };
export type Page<T> = { count: number; page: number; results: T[] };
export const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
let csrf = "";
export async function api<T>(path: string, method = "GET", body?: unknown, idempotencyKey?: string): Promise<T> {
  if (method !== "GET" && !csrf) {
    const response = await fetch(`${base}/api/v1/auth/csrf/`, { credentials: "include" });
    if (!response.ok) throw new Error("Could not initialize session security.");
    csrf = (await response.json()).csrf_token;
  }
  const response = await fetch(`${base}/api/v1${path}`, { method, credentials: "include", cache: "no-store",
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRFToken": csrf } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error?.message ?? error?.detail ?? `Request failed (${response.status}).`); }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export function clearCsrf() { csrf = ""; }
export async function uploadImage(serviceId: string, file: File) {
  if (!csrf) { const response = await fetch(`${base}/api/v1/auth/csrf/`, { credentials: "include" });
    if (!response.ok) throw new Error("Could not initialize session security."); csrf = (await response.json()).csrf_token; }
  const body = new FormData(); body.append("file", file);
  const response = await fetch(`${base}/api/v1/admin/services/${serviceId}/images/`, {
    method: "POST", credentials: "include", body, headers: { "X-CSRFToken": csrf } });
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.detail ?? "Image upload failed."); }
  return response.json();
}
