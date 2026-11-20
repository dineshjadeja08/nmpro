export interface ServiceCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  short_description?: string;
  image_url?: string | null;
  icon_url?: string | null;
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
export interface ServiceBrand {
  name: string;
  logo_url?: string;
}
export interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  tags?: string[];
  photo_url?: string | null;
  customer_name: string;
  source?: "BOOKING" | "MANUAL";
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
  /** Selling price for the requested zone; without a zone, the lowest price in any zone. */
  price_paise?: number | null;
  /** Crossed-out original price; null unless it is above price_paise. */
  mrp_paise?: number | null;
  discount_percent?: number | null;
  /** True when no zone was given and prices differ between zones ("from ₹X"). */
  price_is_from?: boolean;
  /** null when no zone was given. */
  is_available_in_zone?: boolean | null;
}
export type RatingBreakdown = Record<"5" | "4" | "3" | "2" | "1", number>;
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
  important_notes?: string;
  rating_avg?: number | null;
  average_rating?: number | null;
  review_count?: number;
  starting_mrp_paise?: number | null;
  starting_discount_percent?: number | null;
  zone_id?: string | null;
  /** Quick view only (GET /services/<slug>/). */
  rating_breakdown?: RatingBreakdown;
  /** Quick view only: latest 5 visible reviews. */
  recent_reviews?: PublicReview[];
  is_active: boolean;
  is_popular?: boolean;
  is_featured?: boolean;
  show_in_app?: boolean;
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
  brands_image?: string | null;
  list_image?: string | null;
  features?: string[];
  inclusions?: string[];
  exclusions?: string[];
  faqs?: ServiceFAQItem[];
  process_steps?: ServiceProcessStep[];
  spare_parts_rates?: ServiceSparePartRate[];
  brands?: ServiceBrand[];
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
  spotlight_banners?: HomepageBannerItem[];
  trust_stats?: TrustStats;
  demo: boolean;
}
export interface ServiceReviewPage {
  average_rating: number | null;
  review_count: number;
  rating_breakdown: RatingBreakdown;
  count: number;
  page: number;
  page_size: number;
  next: string | null;
  previous: string | null;
  results: PublicReview[];
}
export interface CartMergeItem { service_id: string; package_id?: string | null; quantity?: number; }
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  author_name: string;
  meta_title: string;
  meta_description: string;
  is_published: boolean;
  published_at: string | null;
}
export interface FaqItem { id: string; question: string; answer: string; service_id: string | null; category_id: string | null; }
export interface SeoLandingPage {
  id: string;
  page_slug: string;
  title: string;
  service_id: string | null;
  city_id: string | null;
  area_slug: string;
  meta_title: string;
  meta_description: string;
  hero_heading: string;
  hero_summary: string;
  content_html: string;
  featured_services: Service[];
  status: string;
}
export interface LandingPage {
  kind: "seo_page" | "generated" | "redirect";
  slug: string;
  title?: string;
  description?: string;
  heading?: string;
  summary?: string;
  content?: string;
  city?: { name: string; slug: string } | null;
  category?: ServiceCategory | null;
  services?: Service[];
  faqs?: { id: string; question: string; answer: string }[];
  areas?: { name: string; postal_code: string }[];
}
export interface ApiErrorBody { error: { code: string; message: string; fields: Record<string, string[]>; request_id: string; }; }
export interface ServiceabilityRequest { service_id: string; address_id: string; }
export interface AvailabilitySlot { id: string; start_at: string; end_at: string; remaining: number; version: number; }
export interface AvailabilityResponse { slots: AvailabilitySlot[]; }
export * from "./operations";
