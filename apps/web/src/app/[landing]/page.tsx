import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BadgeCheck, CalendarClock, IndianRupee, MapPin } from "lucide-react";
import { ApiError } from "@nammapros/api-client";
import type { LandingPage } from "@nammapros/types";
import { ServiceCatalogGrid } from "@/components/service-catalog-grid";
import { api } from "@/lib/catalog";
import { site, toParagraphs } from "@/lib/site";

export const revalidate = 300;

async function load(slug: string): Promise<LandingPage> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  try {
    return await api.landingPage(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ landing: string }> }): Promise<Metadata> {
  const { landing } = await params;
  try {
    const page = await api.landingPage(landing);
    if (page.kind === "redirect") return { alternates: { canonical: `/${page.slug}` } };
    return {
      title: page.title,
      description: page.description,
      alternates: { canonical: `/${page.slug}` },
      openGraph: { title: page.title, description: page.description, url: `/${page.slug}` },
    };
  } catch {
    return {};
  }
}

export default async function CityLandingPage({ params }: { params: Promise<{ landing: string }> }) {
  const { landing } = await params;
  const page = await load(landing);
  if (page.kind === "redirect") permanentRedirect(`/${page.slug}`);

  const services = page.services ?? [];
  const city = page.city?.name ?? "";
  const prices = services.map((s) => s.starting_price_paise).filter((p): p is number => p != null);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.heading,
    serviceType: page.category?.name,
    areaServed: city ? { "@type": "City", name: city } : undefined,
    provider: { "@type": "Organization", name: site.name, url: site.url },
    offers: prices.length
      ? { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: Math.min(...prices) / 100, offerCount: services.length }
      : undefined,
  };
  const faqLd = page.faqs?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: page.faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
      }
    : null;

  return (
    <main className="bg-[#FBF8F5]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }} />}

      <section className="border-b border-[#EAE3DC] bg-white">
        <div className="container py-10 sm:py-14">
          <h1 className="max-w-3xl font-serif text-3xl font-semibold leading-tight text-[#1C1917] sm:text-5xl">{page.heading}</h1>
          {page.summary && <p className="mt-3 max-w-2xl text-base text-[#57534E] sm:text-lg">{page.summary}</p>}
          <ul className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-[#1C1917]">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-[#FBF8F5] px-3 py-2"><BadgeCheck size={14} className="text-[#800020]" aria-hidden="true" /> Verified professionals</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-[#FBF8F5] px-3 py-2"><IndianRupee size={14} className="text-[#800020]" aria-hidden="true" /> Price before you book</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-[#FBF8F5] px-3 py-2"><CalendarClock size={14} className="text-[#800020]" aria-hidden="true" /> Pick your time slot</li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="landing-services" className="container py-10">
        <h2 id="landing-services" className="mb-5 text-xl font-bold text-[#1C1917]">
          {page.category ? `${page.category.name} services${city ? ` in ${city}` : ""}` : "Services"}
        </h2>
        {services.length > 0 ? (
          <ServiceCatalogGrid services={services} />
        ) : (
          <p className="text-[#57534E]">These services will be available here soon.</p>
        )}
      </section>

      {page.content && (
        <section className="container max-w-3xl space-y-3 pb-10 text-[15px] leading-relaxed text-[#292524]">
          {toParagraphs(page.content).map((p, i) => <p key={i}>{p}</p>)}
        </section>
      )}

      {page.faqs && page.faqs.length > 0 && (
        <section aria-labelledby="landing-faqs" className="container max-w-3xl pb-10">
          <h2 id="landing-faqs" className="mb-4 text-xl font-bold text-[#1C1917]">Frequently asked questions</h2>
          <div className="space-y-2.5">
            {page.faqs.map((f) => (
              <details key={f.id} className="rounded-lg border border-[#EAE3DC] bg-white px-4 py-3">
                <summary className="cursor-pointer font-semibold text-[#1C1917]">{f.question}</summary>
                <p className="mt-2 text-sm text-[#57534E]">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {page.areas && page.areas.length > 0 && (
        <section aria-labelledby="landing-areas" className="container pb-14">
          <h2 id="landing-areas" className="mb-3 flex items-center gap-2 text-xl font-bold text-[#1C1917]">
            <MapPin size={18} className="text-[#800020]" aria-hidden="true" /> Areas we serve{city ? ` in ${city}` : ""}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {page.areas.map((a) => (
              <li key={`${a.name}-${a.postal_code}`} className="rounded-full border border-[#EAE3DC] bg-white px-3 py-1.5 text-xs text-[#44403C]">
                {a.name} · {a.postal_code}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
