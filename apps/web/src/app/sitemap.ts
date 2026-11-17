import type { MetadataRoute } from "next";
import { api, getCatalog } from "@/lib/catalog";

export const revalidate = 3600;

const STATIC_PATHS = ["", "/about", "/faq", "/support", "/blog", "/join-as-technician", "/terms", "/privacy-policy", "/cancellation-policy"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const [{ data }, landing, blog] = await Promise.all([
    getCatalog(),
    api.landingPages().catch(() => ({ slugs: [] as string[] })),
    api.blogPosts().catch(() => ({ results: [] })),
  ]);
  const categoryPaths = data?.categories.map((c) => `/services?category=${c.slug}`) ?? [];
  const landingPaths = landing.slugs.map((slug) => `/${slug}`);
  const blogPaths = blog.results.map((p) => `/blog/${p.slug}`);
  return [...STATIC_PATHS, ...categoryPaths, ...landingPaths, ...blogPaths].map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: "weekly" as const,
  }));
}
