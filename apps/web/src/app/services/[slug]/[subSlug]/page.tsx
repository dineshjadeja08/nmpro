import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { ApiError } from "@nammapros/api-client";
import { ServiceImage } from "@/components/service-image";
import { api } from "@/lib/catalog";
import {
  resolveUploadedMediaUrl,
  serviceBannerImage,
  serviceMainImage,
} from "@/lib/service-images";
import { formatStartingPrice } from "@/lib/services";

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

  const { category, service, related_services } = payload;
  const bannerSrc = service.banner_is_active !== false ? serviceBannerImage(service) : null;
  const showBannerSection =
    service.banner_is_active !== false &&
    Boolean(bannerSrc || service.banner_title || service.banner_subtitle);
  const mainImg = serviceMainImage(service);
  const gallery = (service.images ?? [])
    .map((img) => ({ ...img, resolvedUrl: resolveUploadedMediaUrl(img.url) }))
    .filter((img) => Boolean(img.resolvedUrl));

  const features = service.features ?? [];
  const inclusions = service.inclusions ?? [];
  const exclusions = service.exclusions ?? [];
  const faqs = service.faqs ?? [];

  return (
    <main>
      {/* Banner or Clean Typographic Header */}
      {showBannerSection ? (
        bannerSrc ? (
          <section className="relative overflow-hidden bg-slate-900 text-white">
            <div className="relative aspect-[16/5] min-h-[220px] max-h-[420px] w-full">
              <ServiceImage src={bannerSrc} alt={service.banner_title || service.name} priority />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/60 to-transparent" />
              <div className="container relative z-10 flex h-full flex-col justify-center py-8">
                <nav className="breadcrumbs mb-3 text-white/80" aria-label="Breadcrumb">
                  <Link href="/" className="text-white/85">Home</Link> /{" "}
                  <Link href="/services" className="text-white/85">Services</Link> /{" "}
                  <Link href={`/services/${encodeURIComponent(category.slug)}`} className="text-white/85">
                    {category.name}
                  </Link>{" "}
                  / {service.name}
                </nav>
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                  {service.banner_title || service.name}
                </h1>
                {(service.banner_subtitle || service.summary) && (
                  <p className="mt-2 max-w-2xl text-sm text-white/90 sm:text-base">
                    {service.banner_subtitle || service.summary}
                  </p>
                )}
                {service.banner_button_text && service.banner_button_link && (
                  <div className="mt-5">
                    <Link
                      href={service.banner_button_link}
                      className="button button-primary inline-flex items-center gap-2"
                    >
                      <span>{service.banner_button_text}</span>
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="inner-hero">
            <div className="container">
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <Link href="/">Home</Link> / <Link href="/services">Services</Link> /{" "}
                <Link href={`/services/${encodeURIComponent(category.slug)}`}>{category.name}</Link> /{" "}
                {service.name}
              </nav>
              <span className="section-kicker">{category.name.toUpperCase()}</span>
              <h1>{service.banner_title || service.name}</h1>
              {(service.banner_subtitle || service.summary) && (
                <p>{service.banner_subtitle || service.summary}</p>
              )}
              {service.banner_button_text && service.banner_button_link && (
                <div className="mt-4">
                  <Link href={service.banner_button_link} className="button button-primary">
                    {service.banner_button_text}
                  </Link>
                </div>
              )}
            </div>
          </section>
        )
      ) : (
        <section className="inner-hero">
          <div className="container">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link> / <Link href="/services">Services</Link> /{" "}
              <Link href={`/services/${encodeURIComponent(category.slug)}`}>{category.name}</Link> /{" "}
              {service.name}
            </nav>
            <span className="section-kicker">{category.name.toUpperCase()}</span>
            <h1>{service.name}</h1>
            {service.summary && <p>{service.summary}</p>}
          </div>
        </section>
      )}

      {/* Main Content + Booking Summary */}
      <div className="container detail-grid py-10">
        <div className="space-y-8">
          {/* Main Service Image (900 x 600) — hidden cleanly if not uploaded */}
          {mainImg && (
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl">
              <ServiceImage src={mainImg} alt={service.name} />
            </div>
          )}

          {/* Full Rich Text Description */}
          {service.description && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-3">Service Overview</h2>
              <div
                className="prose prose-sm max-w-none text-slate-700 leading-relaxed [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: service.description }}
              />
            </section>
          )}

          {/* Key Features */}
          {features.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-3">Key Features</h2>
              <ul className="grid gap-2.5 sm:grid-cols-2 text-sm text-slate-700">
                {features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#800020]" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Included & Excluded */}
          {(inclusions.length > 0 || exclusions.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {inclusions.length > 0 && (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-900">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> Included Items
                  </h2>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {inclusions.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {exclusions.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">
                    Excluded Items
                  </h2>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {exclusions.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="font-bold text-slate-400">✕</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {/* Gallery Images (1200 x 900) — hidden completely if empty */}
          {gallery.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900">Service Gallery</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {gallery.map((img) => (
                  <div key={img.id} className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200">
                    <ServiceImage src={img.resolvedUrl} alt={img.alt_text || service.name} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* FAQs */}
          {faqs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900">Frequently Asked Questions</h2>
              <div className="faq-grid">
                {faqs.map((f, i) => (
                  <details key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                    <summary className="font-semibold text-slate-900 cursor-pointer">{f.question}</summary>
                    <p className="mt-2 text-sm text-slate-600">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sticky Sidebar Panel */}
        <aside className="detail-panel h-fit space-y-4">
          <h2>Pricing & Booking</h2>
          <p className="text-2xl font-black text-[#800020]">{formatStartingPrice(service)}</p>
          {service.price_note && (
            <p className="text-xs font-medium text-slate-600">{service.price_note}</p>
          )}
          <p className="text-xs text-slate-500">
            Doorstep visit by background-verified professionals across active service zones.
          </p>
          <Link
            className="button button-primary w-full justify-center"
            href={`/book?service=${encodeURIComponent(service.slug)}`}
          >
            Start booking <ArrowRight size={16} />
          </Link>
        </aside>
      </div>

      {/* Related Sub-Services in same category */}
      {related_services.length > 0 && (
        <section className="container border-t border-slate-200 py-10">
          <h2 className="mb-4 text-xl font-bold text-slate-900">More {category.name} Services</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related_services.map((rel) => (
              <Link
                key={rel.id}
                href={`/services/${encodeURIComponent(category.slug)}/${encodeURIComponent(rel.slug)}`}
                className="rounded-xl border border-slate-200 bg-white p-4 no-underline text-inherit hover:border-[#800020] transition"
              >
                <strong className="block text-sm font-bold text-slate-900">{rel.name}</strong>
                <span className="mt-1 block text-xs text-slate-500 line-clamp-2">{rel.summary}</span>
                <span className="mt-2 block text-xs font-bold text-[#800020]">{formatStartingPrice(rel)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
