import type { ApiErrorBody, AvailabilityResponse, CatalogResponse, PublicReview, Service, ServiceCategory, ServiceabilityRequest } from "@nammapros/types";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); }
}

export function createApiClient(baseUrl: string, timeoutMs = 6000) {
  const origin = baseUrl.replace(/\/$/, "");
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${origin}/api/v1${path}`, { ...init, signal: controller.signal, cache: init.cache ?? "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as ApiErrorBody | null;
        throw new ApiError(body?.error?.message ?? "The service is temporarily unavailable.", response.status, body?.error?.code ?? "API_ERROR");
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError("The request timed out. Please try again.", 0, "TIMEOUT");
      throw new ApiError("We cannot reach the service right now.", 0, "NETWORK_ERROR");
    } finally { clearTimeout(timeout); }
  }
  return {
    catalog: () => request<CatalogResponse>("/catalog/"),
    categoryDetail: (slug: string) => request<{ category: ServiceCategory; services: Service[] }>(`/service-categories/${encodeURIComponent(slug)}/`),
    service: (slug: string) => request<CatalogResponse["services"][number]>(`/services/${encodeURIComponent(slug)}/`),
    subServiceDetail: (categorySlug: string, serviceSlug: string) =>
      request<{ category: ServiceCategory; service: Service; related_services: Service[] }>(
        `/services/${encodeURIComponent(categorySlug)}/${encodeURIComponent(serviceSlug)}/`
      ),
    serviceReviews: (serviceIdOrSlug: string) =>
      request<{ average_rating: number | null; review_count: number; rating_breakdown?: Record<string, number>; results: PublicReview[] }>(
        `/services/${encodeURIComponent(serviceIdOrSlug)}/reviews/`
      ),
    publicReviews: () =>
      request<{ average_rating: number | null; review_count: number; results: PublicReview[] }>("/reviews/"),
    serviceability: (body: ServiceabilityRequest) => request<{ supported: boolean; zone_id: string | null }>("/serviceability/check/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    availability: (params: URLSearchParams) => request<AvailabilityResponse>(`/availability/?${params}`),
  };
}
