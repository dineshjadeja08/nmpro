import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ApiError } from "@nammapros/api-client";
import type { Service, ServiceCategory } from "@nammapros/types";
import { ServiceCard } from "@/components/service-card";
import { ServiceImage } from "@/components/service-image";
import { api } from "@/lib/catalog";
import { getCategoryBannerSrc, serviceMainImage } from "@/lib/service-images";
import { formatStartingPrice } from "@/lib/services";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { category } = await api.categoryDetail(slug);
    return {
      title: `${category.name} Service`,
      description: category.description || `Explore ${category.name} services from NammaPros.`,
      alternates: { canonical: `/services/${category.slug}` },
    };
  } catch {
    try {
      const service = await api.service(slug);
      return {
        title: service.seo_title || service.name,
        description: service.seo_description || service.summary,
        alternates: { canonical: `/services/${service.category}/${service.slug}` },
      };
    } catch {
      return { title: "Services" };
    }
  }
}

async function resolveCategoryOrService(slug: string): Promise<
  | { kind: "category"; category: ServiceCategory; services: Service[] }
  | { kind: "service"; service: Service }
  | { kind: "not_found" }
  | { kind: "unavailable" }
> {
  try {
    const { category, services } = await api.categoryDetail(slug);
    return { kind: "category", category, services };
  } catch (catError) {
    if (!(catError instanceof ApiError && catError.status === 404)) {
      return { kind: "unavailable" };
    }
  }

  try {
    const service = await api.service(slug);
    return { kind: "service", service };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { kind: "not_found" };
    }
    return { kind: "unavailable" };
  }
}

export default async function CategoryOrServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolved = await resolveCategoryOrService(slug);

  if (resolved.kind === "not_found") notFound();

  if (resolved.kind === "unavailable") {
    return (
      <main className="container simple-page">
        <h1>Service unavailable</h1>
        <p>The catalog could not be loaded right now.</p>
        <Link className="button button-outline page-actions" href="/services">
          Back to services
        </Link>
      </main>
    );
  }

  if (resolved.kind === "category") {
    const { category, services } = resolved;
    const bannerSrc = category.banner_is_active !== false ? getCategoryBannerSrc(category) : null;
    const showBannerSection =
      category.banner_is_active !== false &&
      Boolean(bannerSrc || category.banner_title || category.banner_subtitle);

    return (
      <main>
        {showBannerSection ? (
          bannerSrc ? (
            <section className="relative overflow-hidden bg-[#1C1917] text-white">
              <div className="relative aspect-[16/5] min-h-[220px] max-h-[420px] w-full">
                <ServiceImage src={bannerSrc} alt={category.banner_title || category.name} priority />
                <div className="absolute inset-0 bg-gradient-to-r from-[#1C1917]/85 via-[#1C1917]/55 to-transparent" />
                <div className="container relative z-10 flex h-full flex-col justify-center py-8">
                  <nav className="breadcrumbs mb-3 text-white/80" aria-label="Breadcrumb">
                    <Link href="/" className="text-white/85">Home</Link> /{" "}
                    <Link href="/services" className="text-white/85">Services</Link> / {category.name}
                  </nav>
                  <h1 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    {category.banner_title || `${category.name} Service`}
                  </h1>
                  {(category.banner_subtitle || category.description) && (
                    <p className="mt-2 max-w-2xl text-sm text-white/90 sm:text-base">
                      {category.banner_subtitle || category.description}
                    </p>
                  )}
                  {category.banner_button_text && category.banner_button_link && (
                    <div className="mt-5">
                      <Link
                        href={category.banner_button_link}
                        className="button button-primary inline-flex items-center gap-2"
                      >
                        <span>{category.banner_button_text}</span>
                        <ArrowRight size={16} strokeWidth={1.5} />
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
                  <Link href="/">Home</Link> / <Link href="/services">Services</Link> / {category.name}
                </nav>
                <span className="section-kicker">{category.name.toUpperCase()}</span>
                <h1>{category.banner_title || `${category.name} Service`}</h1>
                {(category.banner_subtitle || category.description) && (
                  <p>{category.banner_subtitle || category.description}</p>
                )}
                {category.banner_button_text && category.banner_button_link && (
                  <div className="mt-4">
                    <Link href={category.banner_button_link} className="button button-primary">
                      {category.banner_button_text}
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
                <Link href="/">Home</Link> / <Link href="/services">Services</Link> / {category.name}
              </nav>
              <span className="section-kicker">SERVICE CATEGORY</span>
              <h1>{category.name} Service</h1>
              {category.description && <p>{category.description}</p>}
            </div>
          </section>
        )}

        <section className="container listing-section">
          <div className="section-heading mb-6">
            <div>
              <span className="section-kicker">{category.name.toUpperCase()} SERVICES</span>
              <h2 className="font-serif text-2xl font-bold text-[#1C1917]">
                Available services ({services.length})
              </h2>
            </div>
          </div>
          {services.length > 0 ? (
            <div className="listing-grid">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          ) : (
            <div className="status-panel">
              <h2>No sub-services published yet</h2>
              <p>Check back soon for {category.name} services.</p>
            </div>
          )}
        </section>
      </main>
    );
  }

  const { service } = resolved;
  const mainImg = serviceMainImage(service);
  return (
    <main>
      <section className="inner-hero">
        <div className="container">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link> / <Link href="/services">Services</Link> / {service.name}
          </nav>
          <span className="section-kicker">{service.category_name || "HOME SERVICE"}</span>
          <h1>{service.name}</h1>
          {service.summary && <p>{service.summary}</p>}
        </div>
      </section>
      <div className="container detail-grid">
        <div>
          {mainImg && (
            <div className="relative mb-6 aspect-[16/9] w-full overflow-hidden rounded-[20px]">
              <ServiceImage src={mainImg} alt={service.name} />
            </div>
          )}
          {service.description && (
            <div
              className="prose prose-sm mb-6 max-w-none text-[#57534E]"
              dangerouslySetInnerHTML={{ __html: service.description }}
            />
          )}
          <Link className="button button-primary page-actions" href={`/book?service=${service.slug}`}>
            Pick a slot &amp; book
          </Link>
        </div>
        <aside className="detail-panel h-fit">
          <h2>Before you book</h2>
          <p className="mt-2 text-lg font-bold text-[#800020]">{formatStartingPrice(service)}</p>
          {service.price_note && <p className="mt-1 text-xs text-[#57534E]">{service.price_note}</p>}
        </aside>
      </div>
    </main>
  );
}
