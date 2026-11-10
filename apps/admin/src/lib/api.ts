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
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const fieldsObj = error?.error?.fields;
    const fieldText = fieldsObj && typeof fieldsObj === "object"
      ? Object.entries(fieldsObj as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
          .filter(Boolean)
          .join(" · ")
      : "";
    const msg = fieldText
      ? `${error?.error?.message ?? "Please check the submitted information."} (${fieldText})`
      : error?.error?.message ?? error?.detail ?? `Request failed (${response.status}).`;
    throw new Error(msg);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export function clearCsrf() { csrf = ""; }
async function ensureCsrf(): Promise<string> {
  if (csrf) return csrf;
  const response = await fetch(`${base}/api/v1/auth/csrf/`, { credentials: "include" });
  if (!response.ok) throw new Error("Could not initialize session security.");
  csrf = (await response.json()).csrf_token;
  return csrf;
}

export async function uploadMultipart<T>(path: string, formData: FormData): Promise<T> {
  const token = await ensureCsrf();
  const response = await fetch(`${base}/api/v1${path}`, {
    method: "POST", credentials: "include", body: formData, headers: { "X-CSRFToken": token },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message ?? error?.detail ?? "File upload failed.");
  }
  return response.json() as Promise<T>;
}

export async function uploadImage(
  serviceId: string,
  file: File,
  slot?: string,
  extra?: { alt_text?: string; sort_order?: number }
) {
  const body = new FormData();
  body.append("file", file);
  if (slot) body.append("slot", slot);
  if (extra?.alt_text) body.append("alt_text", extra.alt_text);
  if (extra?.sort_order !== undefined) body.append("sort_order", String(extra.sort_order));
  return uploadMultipart<{ id?: string; slot?: string; url: string; alt_text?: string; sort_order?: number }>(
    `/admin/services/${serviceId}/images/`,
    body
  );
}

export async function uploadCategoryImage(categoryId: string, file: File, slot: "card" | "banner") {
  const body = new FormData();
  body.append("file", file);
  body.append("slot", slot);
  return uploadMultipart<{ slot: string; url: string }>(`/admin/categories/${categoryId}/images/`, body);
}
