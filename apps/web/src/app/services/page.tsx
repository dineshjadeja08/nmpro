import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ServiceCard } from "@/components/service-card";
import { ServiceImage } from "@/components/service-image";
import { getCatalog } from "@/lib/catalog";
import { getCategoryVisualSrc } from "@/lib/service-images";

export const metadata: Metadata = {
  title: "Services",
  description: "Explore NammaPros service categories and doorstep home services.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const { data, error } = await getCatalog();
  const categories = data?.categories ?? [];
  const services = data?.services ?? [];

  return (
    <main>
      <section className="inner-hero">
        <div className="container">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link> / Services
          </nav>
          <span className="section-kicker">OUR SERVICE CATALOG</span>
          <h1>Find the right help for your home.</h1>
          <p>Select a category or sub-service below. Professional doorstep service across Tamil Nadu.</p>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="container py-8">
          <div className="section-heading mb-5">
            <div>
              <span className="section-kicker">EXPLORE CATEGORIES</span>
              <h2 className="text-2xl font-bold text-slate-900">Service Categories</h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => {
              const imgSrc = getCategoryVisualSrc(c);
              return (
                <Link
                  key={c.id}
                  href={`/services/${encodeURIComponent(c.slug)}`}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 no-underline text-inherit shadow-xs transition hover:border-[#800020] hover:shadow-md"
                >
                  <div>
                    {imgSrc && (
                      <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-xl">
                        <ServiceImage src={imgSrc} alt={c.name} />
                      </div>
                    )}
                    <strong className="block text-base font-bold text-slate-900">{c.name}</strong>
                    {c.description && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{c.description}</p>
                    )}
                  </div>
                  <span className="mt-3 inline-flex items-center justify-between text-xs font-bold text-[#800020]">
                    <span>
                      {typeof c.sub_service_count === "number"
                        ? `${c.sub_service_count} service${c.sub_service_count === 1 ? "" : "s"}`
                        : "View services"}
                    </span>
                    <ArrowRight size={14} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="container listing-section">
        <div className="section-heading mb-5">
          <div>
            <span className="section-kicker">AVAILABLE SUB-SERVICES</span>
            <h2 className="text-2xl font-bold text-slate-900">All Services ({services.length})</h2>
          </div>
        </div>
        {error ? (
          <div className="status-panel" role="alert">
            <h2>Catalog unavailable</h2>
            <p>{error}</p>
          </div>
        ) : services.length ? (
          <div className="listing-grid">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        ) : (
          <div className="status-panel">
            <h2>No services published</h2>
            <p>Check back after catalog setup.</p>
          </div>
        )}
      </section>
    </main>
  );
}
