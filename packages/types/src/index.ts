export interface ServiceCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  short_description?: string;
  image_url?: string | null;
  banner_image?: string | null;
  banner_title?: string;
  banner_subtitle?: string;
  banner_button_text?: string;
  banner_button_link?: string;
  banner_is_active?: boolean;
  sort_order?: number;
  is_active?: boolean;
  sub_service_count?: number;
}
export interface ServiceImage {
  id: string;
  url: string;
  alt_text?: string;
  sort_order?: number;
}
export interface ServiceFAQItem {
  question: string;
  answer: string;
}
export interface ServiceProcessStep {
  title: string;
  description: string;
  image_url?: string | null;
}
export interface ServiceSparePartRate {
  part_name: string;
  brand?: string;
  price_paise?: number | null;
  price_label?: string;
}
export interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  tags?: string[];
  photo_url?: string | null;
  customer_name: string;
  area?: string;
  technician_name?: string;
  service_name?: string;
  service_slug?: string;
  category_slug?: string;
  created_at: string;
}
export interface HomepageBannerItem {
  id: string;
  title: string;
  subtitle?: string;
  placement?: string;
  desktop_image_url?: string | null;
  mobile_image_url?: string | null;
  target_url?: string;
}
export interface TrustStats {
  average_rating: number | null;
  review_count: number;
  completed_bookings_count: number;
}
export interface ServicePackage {
  id: string;
  name: string;
  pricing_model: "FIXED_PRICE" | "INSPECTION_BASED";
  duration_minutes: number;
  inclusions: string[];
  exclusions: string[];
  description?: string;
  requirements?: string | string[];
  starting_price_paise?: number | null;
  original_price_paise?: number | null;
  is_most_booked?: boolean;
}
export interface Service {
  id: string;
  slug: string;
  name: string;
  summary: string;
  short_description?: string;
  description?: string;
  full_description?: string;
  category: string;
  category_id?: string;
  category_name?: string;
  starting_price_paise: number | null;
  price_note?: string;
  rating_avg?: number | null;
  review_count?: number;
  is_active: boolean;
  sort_order?: number;
  banner_title?: string;
  banner_subtitle?: string;
  banner_button_text?: string;
  banner_button_link?: string;
  banner_is_active?: boolean;
  banner_image?: string | null;
  main_image?: string | null;
  cover_image?: string | null;
  landing_thumbnail?: string | null;
  popup_cover_image?: string | null;
  popup_content_image?: string | null;
  list_image?: string | null;
  features?: string[];
  inclusions?: string[];
  exclusions?: string[];
  faqs?: ServiceFAQItem[];
  process_steps?: ServiceProcessStep[];
  spare_parts_rates?: ServiceSparePartRate[];
  seo_title?: string;
  seo_description?: string;
  images?: ServiceImage[];
  packages?: ServicePackage[];
}
export interface CatalogResponse {
  categories: ServiceCategory[];
  services: Service[];
  reviews?: PublicReview[];
  banners?: HomepageBannerItem[];
  trust_stats?: TrustStats;
  demo: boolean;
}
export interface ApiErrorBody { error: { code: string; message: string; fields: Record<string, string[]>; request_id: string; }; }
export interface ServiceabilityRequest { service_id: string; address_id: string; }
export interface AvailabilitySlot { id: string; start_at: string; end_at: string; remaining: number; version: number; }
export interface AvailabilityResponse { slots: AvailabilitySlot[]; }
