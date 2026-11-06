export interface ServiceCategory { id: string; slug: string; name: string; description: string; }
export interface Service { id: string; slug: string; name: string; summary: string; category: string; starting_price_paise: number | null; is_active: boolean; packages?: { id: string; name: string; pricing_model: "FIXED_PRICE" | "INSPECTION_BASED"; duration_minutes: number; inclusions: string[]; exclusions: string[] }[]; }
export interface CatalogResponse { categories: ServiceCategory[]; services: Service[]; demo: boolean; }
export interface ApiErrorBody { error: { code: string; message: string; fields: Record<string, string[]>; request_id: string; }; }
export interface ServiceabilityRequest { service_id: string; address_id: string; }
export interface AvailabilitySlot { id: string; start_at: string; end_at: string; remaining: number; version: number; }
export interface AvailabilityResponse { slots: AvailabilitySlot[]; }
