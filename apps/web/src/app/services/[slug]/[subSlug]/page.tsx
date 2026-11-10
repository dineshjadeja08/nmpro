import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError } from "@nammapros/api-client";
import { ServiceDetailView } from "@/components/service-detail-view";
import { api } from "@/lib/catalog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; subSlug: string }>;
}): Promise<Metadata> {
  const { slug, subSlug } = await params;
  try {
    const { service } = await api.subServiceDetail(slug, subSlug);
    return {
      title: service.seo_title || service.name,
      description: service.seo_description || service.summary,
      alternates: { canonical: `/services/${slug}/${subSlug}` },
    };
  } catch {
    return { title: "Service Details" };
  }
}

export default async function SubServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string; subSlug: string }>;
}) {
  const { slug, subSlug } = await params;

  let payload;
  try {
    payload = await api.subServiceDetail(slug, subSlug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <main className="container simple-page">
        <h1>Service unavailable</h1>
        <p>Could not load service details right now. Please try again shortly.</p>
        <Link className="button button-outline page-actions" href={`/services/${encodeURIComponent(slug)}`}>
          Back to category
        </Link>
      </main>
    );
  }

  const reviewSummary = await api.serviceReviews(payload.service.slug).catch(() => ({
    average_rating: payload.service.rating_avg ?? null,
    review_count: payload.service.review_count ?? 0,
    rating_breakdown: {},
    results: [],
  }));

  return (
    <ServiceDetailView
      category={payload.category}
      service={payload.service}
      relatedServices={payload.related_services}
      reviewSummary={reviewSummary}
    />
  );
}
