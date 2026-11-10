import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/catalog";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data } = await getCatalog();
  const categoryPaths = data?.categories.map((c) => `/services/${c.slug}`) ?? [];
  const servicePaths = data?.services.map((s) => `/services/${s.category}/${s.slug}`) ?? [];
  return ["", "/services", ...categoryPaths, ...servicePaths].map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: "weekly" as const,
  }));
}
