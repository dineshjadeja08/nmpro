import { createApiClient } from "@nammapros/api-client";
import type { CatalogResponse } from "@nammapros/types";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
export const api = createApiClient(baseUrl);

export async function getCatalog(): Promise<{ data: CatalogResponse | null; error: string | null }> {
  try { return { data: await api.catalog(), error: null }; }
  catch { return { data: null, error: "The service catalog is unavailable. Start the local API and refresh this page." }; }
}
