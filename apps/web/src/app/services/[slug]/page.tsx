import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError } from "@nammapros/api-client";
import { api } from "@/lib/catalog";
import { formatStartingPrice } from "@/lib/services";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try { const service = await api.service(slug); return { title: service.name, description: service.summary, alternates: { canonical: `/services/${service.slug}` } }; }
  catch { return { title: "Service" }; }
}
export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let service;
  try { service = await api.service(slug); }
  catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); return <main className="container simple-page"><h1>Service unavailable</h1><p>The catalog could not be loaded. Please try again after the API is available.</p><Link className="button button-outline page-actions" href="/services">Back to services</Link></main>; }
  return <main><section className="inner-hero"><div className="container"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link> / <Link href="/services">Services</Link> / {service.name}</nav><span className="section-kicker">HOME SERVICE</span><h1>{service.name}</h1><p>{service.summary}</p></div></section><div className="container detail-grid"><div><h2>Start with the issue you’re seeing.</h2><p>Describe the problem in your own words. The booking flow checks your address and shows configured appointments.</p><Link className="button button-primary page-actions" href={`/book?service=${service.slug}`}>Start booking</Link></div><aside className="detail-panel"><h2>Before you book</h2><p>{formatStartingPrice(service)}</p><p>Packages, service inclusions and a server-verified quote appear in the booking flow when configured for your address.</p></aside></div></main>;
}
