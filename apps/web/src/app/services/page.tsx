import type { Metadata } from "next";
import Link from "next/link";
import { ServiceCatalogGrid } from "@/components/service-catalog-grid";
import { getCatalog } from "@/lib/catalog";

export const metadata: Metadata = {
  title: "Services",
  description: "Explore NammaPros service categories and doorstep home services.",
  alternates: { canonical: "/services" },
};

import { filterCanonicalCategories } from "@/lib/services";

export default async function ServicesPage() {
  const { data, error } = await getCatalog();
  const categories = filterCanonicalCategories(data?.categories ?? []);
  const services = data?.services ?? [];

  return (
    <main className="bg-[#FBF8F5]">
      <section className="inner-hero">
        <div className="container">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link> / Services
          </nav>
          <span className="section-kicker">OUR SERVICE CATALOG</span>
          <h1>Find the right help for your home.</h1>
          <p>Select a category or sub-service below. Professional doorstep service across Tamil Nadu.</p>

          {categories.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2" aria-label="Category filter links">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/services/${encodeURIComponent(c.slug)}`}
                  className="inline-flex min-h-[38px] items-center rounded-md border border-[#E2D9D0] bg-white px-4 text-xs font-semibold text-[#1C1917] no-underline transition hover:border-[#800020] hover:text-[#800020]"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="container listing-section">
        <div className="section-heading mb-5">
          <div>
            <span className="section-kicker">AVAILABLE SUB-SERVICES</span>
            <h2 className="font-serif text-2xl font-bold text-[#1C1917]">All Services ({services.length})</h2>
          </div>
        </div>
        {error ? (
          <div className="status-panel" role="alert">
            <h2>Catalog unavailable</h2>
            <p>{error}</p>
          </div>
        ) : services.length ? (
          <ServiceCatalogGrid
            services={services}
            gridClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          />
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
