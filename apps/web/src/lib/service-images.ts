export interface ServiceImageFields {
  name?: string;
  main_image?: string | null;
  banner_image?: string | null;
  cover_image?: string | null;
  landing_thumbnail?: string | null;
  list_image?: string | null;
  popup_cover_image?: string | null;
  popup_content_image?: string | null;
}

const API_ORIGIN = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.API_BASE_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

export function resolveUploadedMediaUrl(src: string | null | undefined): string | null {
  const clean = src?.trim();
  if (!clean) return null;
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }
  if (clean.startsWith("/images/")) {
    return clean;
  }
  if (clean.startsWith("/")) {
    return `${API_ORIGIN}${clean}`;
  }
  return `${API_ORIGIN}/${clean}`;
}

export function serviceBannerImage(service: ServiceImageFields): string | null {
  return resolveUploadedMediaUrl(service.banner_image || service.landing_thumbnail);
}

export function serviceMainImage(service: ServiceImageFields): string | null {
  return resolveUploadedMediaUrl(service.main_image || service.cover_image);
}

export function serviceHeroImage(service: ServiceImageFields): string | null {
  return resolveUploadedMediaUrl(service.banner_image || service.landing_thumbnail || service.main_image || service.cover_image);
}

export function serviceListImage(service: ServiceImageFields): string | null {
  return resolveUploadedMediaUrl(service.list_image || service.cover_image || service.main_image);
}

export function servicePopupCoverImage(service: ServiceImageFields): string | null {
  return resolveUploadedMediaUrl(
    service.popup_cover_image || service.cover_image || service.main_image || service.landing_thumbnail || service.banner_image
  );
}

export function servicePopupContentImage(service: ServiceImageFields): string | null {
  return resolveUploadedMediaUrl(service.popup_content_image || service.cover_image || service.main_image);
}

export function getCategoryVisualSrc(category: { image_url?: string | null }): string | null {
  return resolveUploadedMediaUrl(category.image_url);
}

export function getCategoryIconSrc(category: { icon_url?: string | null }): string | null {
  return resolveUploadedMediaUrl(category.icon_url);
}

export function getCategoryBannerSrc(category: { banner_image?: string | null }): string | null {
  return resolveUploadedMediaUrl(category.banner_image);
}
