import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { HeroLocationPill } from "@/components/hero-location-pill";
import { OfferSpotlight } from "@/components/offer-spotlight";
import { ProblemSearch } from "@/components/problem-search";
import { ServiceCatalogGrid } from "@/components/service-catalog-grid";
import { ServiceImage } from "@/components/service-image";
import { getCatalog } from "@/lib/catalog";
import { resolveUploadedMediaUrl } from "@/lib/service-images";
import { filterCanonicalCategories, pickPopularServices } from "@/lib/services";

export default async function Home() {
  const { data, error } = await getCatalog();
  const categories = filterCanonicalCategories(data?.categories ?? []);
  const services = data?.services ?? [];
  const popularServices = pickPopularServices(services, 4);
  const reviews = (data?.reviews ?? []).slice(0, 3);
  const banners = data?.banners ?? [];
  const trust = data?.trust_stats;

  return (
    <main className="bg-[#FBF8F5]">
      {/* 1. Split Hero Banner (Blush Rose #FBECEF + Technician on Right) */}
      <section className="relative overflow-hidden border-b border-[#EAE3DC] bg-[#FBECEF] pt-6 pb-6 text-[#1C1917] sm:pt-8 sm:pb-0">
        <div className="container grid items-end gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-6">
          <div className="max-w-2xl space-y-5 pb-0 sm:pb-6 lg:pb-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-[#800020]/15 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#800020] shadow-2xs">
                Namma area, namma pros.
              </span>
              <HeroLocationPill />
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-[#1C1917] sm:text-5xl lg:text-[50px] lg:leading-[1.12]">
              What’s not working{" "}
              <span className="text-[#800020]">at home?</span>
            </h1>

            <p className="max-w-lg text-sm font-normal leading-relaxed text-[#57534E] sm:text-base">
              Tell us the problem. We send a verified pro in the slot you pick, with the price shown before you book.
            </p>

            <ProblemSearch showChips />

            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/book"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
                >
                  <span>Book a visit</span>
                  <ArrowRight size={15} strokeWidth={2} />
                </Link>
                <Link
                  href="/services"
                  className="inline-flex min-h-[44px] items-center rounded-md border border-[#800020]/20 bg-white px-5 text-xs font-semibold text-[#1C1917] transition hover:border-[#800020] hover:text-[#800020]"
                >
                  Explore all services
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-[#57534E]">
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="shrink-0 text-emerald-700" />
                  Verified pros
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={13} className="shrink-0 text-[#800020]" />
                  30-day warranty
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="shrink-0 text-emerald-700" />
                  Pay after transparent quote
                </span>
              </div>
            </div>
          </div>

          <div className="relative hidden items-end justify-center sm:flex lg:justify-end">
            {/* Architectural burgundy-tinted backdrop behind lower 75% so head breaks the top edge */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-8 right-0 top-[22%] rounded-t-lg border border-b-0 border-[#800020]/15 bg-[#800020]/[0.07] sm:left-16 lg:left-10"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-2 left-10 right-2 top-[24%] rounded-t-lg border border-b-0 border-white/70 sm:left-18 lg:left-12"
            />
            <Image
              src="/images/brand/hero-technician-cutout.png"
              alt="Verified NammaPros home service technician"
              width={346}
              height={566}
              priority
              unoptimized
              className="relative z-10 h-[380px] w-auto object-contain object-bottom md:h-[440px] lg:h-[520px] xl:h-[545px]"
            />

            {/* Compact corner floating pill leaves tool belt uncovered */}
            <div className="absolute bottom-5 left-2 z-20 max-w-[230px] rounded-lg border border-[#EAE3DC] bg-white/95 px-3 py-2 text-[#1C1917] shadow-md backdrop-blur-sm sm:left-4 lg:left-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold leading-tight text-[#1C1917]">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-700" />
                <span>Verified pros</span>
              </div>
              <p className="mt-0.5 text-[10px] font-normal leading-snug text-[#57534E]">
                Direct slot booking · Upfront pricing
              </p>

              {trust?.average_rating && trust.review_count > 0 && (
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-[#1C1917] px-2 py-0.5 text-white">
                  <span className="text-[11px] font-bold leading-none">{trust.average_rating}</span>
                  <Star size={11} className="fill-[#C8A35B] text-[#C8A35B]" />
                  <span className="text-[10px] font-normal text-[#D6CEC6]">{trust.review_count} reviews</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Category Icon Grid (Homepage only: 2 rows x 7 columns on desktop) */}
      {categories.length > 0 && (
        <section className="container pt-10 pb-10" aria-label="Service categories">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-xl font-semibold text-[#1C1917] sm:text-2xl">
              What do you need fixed?
            </h2>
            <Link href="/services" className="text-xs font-bold text-[#800020] hover:underline">
              See all services →
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-7">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/services/${encodeURIComponent(c.slug)}`}
                className="group relative flex aspect-square w-full flex-col overflow-hidden rounded-lg border border-[#EAE3DC] bg-[#F5F5F5] text-inherit no-underline shadow-[0_2px_10px_rgba(28,25,23,0.03)] transition hover:border-[#800020]/50 md:hover:-translate-y-0.5 md:hover:shadow-[0_10px_24px_rgba(28,25,23,0.07)]"
              >
                <div className="relative min-h-0 w-full flex-1 p-2.5 sm:p-3.5">
                  <div className="relative h-full w-full">
                    <CategoryIcon category={c} fillContainer />
                  </div>
                </div>
                <span className="w-full shrink-0 border-t border-[#EAE3DC]/80 bg-white/95 px-1.5 py-1.5 text-center text-[10px] font-semibold leading-tight text-[#1C1917] line-clamp-2 sm:text-xs">
                  {c.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 3. 4-Column Divided Trust Strip */}
      <section className="container pb-10">
        <div className="grid divide-y divide-[#EAE3DC] overflow-hidden rounded-lg border border-[#EAE3DC] bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {[
            {
              title: "Verified pros",
              desc: "ID, address and skill checked before the first job.",
            },
            {
              title: "Price before you book",
              desc: "Every package shows what is included and what is not.",
            },
            {
              title: "30-day service warranty",
              desc: "Same issue comes back? We fix it free.",
            },
            {
              title: "Free reschedule",
              desc: "Change your slot up to 2 hours before the visit.",
            },
          ].map((item) => (
            <div key={item.title} className="p-4 sm:p-5">
              <strong className="block text-xs font-bold text-[#1C1917]">{item.title}</strong>
              <p className="mt-1 text-[11px] leading-relaxed text-[#57534E]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Three steps. No phone calls. */}
      <section id="how-it-works" className="border-y border-[#EAE3DC] bg-white py-12">
        <div className="container">
          <h2 className="mb-6 font-serif text-2xl font-semibold text-[#1C1917] sm:text-3xl">
            Three steps. No phone calls.
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Pick",
                desc: "Search your problem or choose a package. See the price and what’s included.",
              },
              {
                step: "2",
                title: "Schedule",
                desc: "Pick a day and a 1-hour window. Confirm with a quick OTP — no account forms.",
              },
              {
                step: "3",
                title: "Relax",
                desc: "See your pro’s name, arrival updates, and approve any extra parts cleanly.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-[#EFE9E2] bg-[#FAF6F2] p-6"
              >
                <span className="grid h-7 w-7 place-items-center rounded-md bg-[#800020] text-xs font-bold text-white">
                  {item.step}
                </span>
                <h3 className="mt-4 font-serif text-lg font-bold text-[#1C1917]">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#57534E]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Featured Dark Offer Card */}
      <OfferSpotlight banners={banners} />

      {/* 6. From homes near you */}
      {reviews.length > 0 && (
        <section className="container py-10">
          <h2 className="mb-5 font-serif text-2xl font-semibold text-[#1C1917] sm:text-3xl">From homes near you</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {reviews.map((rev) => {
              const initial = (rev.customer_name?.trim()[0] || "N").toUpperCase();
              return (
                <article
                  key={rev.id}
                  className="flex flex-col justify-between rounded-lg border border-[#EAE3DC] bg-white p-5 shadow-[0_4px_16px_rgba(28,25,23,0.03)]"
                >
                  <div>
                    <div className="flex items-center gap-0.5 text-[#C8A35B]" aria-label={`${rev.rating} out of 5 stars`}>
                      {Array.from({ length: rev.rating }).map((_, idx) => (
                        <Star key={idx} size={13} className="fill-[#C8A35B] text-[#C8A35B]" />
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#1C1917]">
                      “{rev.comment || "Smooth visit, clear communication, and tidy finish."}”
                    </p>
                    {rev.photo_url && resolveUploadedMediaUrl(rev.photo_url) && (
                      <div className="relative mt-3 aspect-[16/7] w-full overflow-hidden rounded-md bg-[#FAF6F2]">
                        <ServiceImage src={rev.photo_url} alt={`Work done for ${rev.customer_name}`} fit="contain" />
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-2.5 border-t border-[#F4EFE9] pt-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#F5E6EA] text-xs font-bold text-[#800020]">
                      {initial}
                    </span>
                    <div className="min-w-0 text-[11px]">
                      <strong className="block truncate text-[#1C1917]">{rev.customer_name}</strong>
                      <span className="block truncate text-[#57534E]">
                        {[rev.service_name, rev.area].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* 7. Bottom Dual Support & Partner Cards */}
      <section className="container pt-4 pb-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col justify-between rounded-lg bg-[#E7F2EC] p-6 sm:p-7">
            <div>
              <h2 className="font-serif text-xl font-semibold text-[#1C1917]">Not sure what to book?</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[#3F5248]">
                Tell us what’s happening in plain words — we’ll guide you to the right service before you book.
              </p>
            </div>
            <div className="mt-5">
              <Link
                href="/search"
                className="inline-flex min-h-[42px] items-center rounded-md bg-[#117A4B] px-5 text-xs font-bold text-white transition hover:bg-[#0D603B]"
              >
                Get help choosing
              </Link>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-lg bg-[#F6E9EE] p-6 sm:p-7">
            <div>
              <h2 className="font-serif text-xl font-semibold text-[#1C1917]">Are you a skilled technician?</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-[#5B444B]">
                Get steady jobs in your area and clear weekly payouts across Chennai &amp; Tamil Nadu.
              </p>
            </div>
            <div className="mt-5">
              <Link
                href="/join-as-technician"
                className="inline-flex min-h-[42px] items-center rounded-md bg-[#800020] px-5 text-xs font-bold text-white transition hover:bg-[#5e0017]"
              >
                Join as a pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Popular services (at the bottom of home page, above the footer, max 4) */}
      <section className="container pb-14 pt-6" id="services">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-[#1C1917] sm:text-3xl">Popular services</h2>
            <p className="mt-1 text-xs text-[#57534E]">
              Most booked home services with upfront pricing and a 30-day warranty.
            </p>
          </div>
          <Link href="/services" className="text-xs font-bold text-[#800020] hover:underline">
            View all services →
          </Link>
        </div>

        {error ? (
          <div className="status-panel" role="alert">
            <h3>Catalog temporarily unavailable</h3>
            <p>{error}</p>
            <Link href="/services">Try the service page</Link>
          </div>
        ) : popularServices.length > 0 ? (
          <ServiceCatalogGrid
            services={popularServices}
            gridClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          />
        ) : (
          <div className="status-panel">
            <h3>Our catalog is being prepared</h3>
            <p>No services are published yet. Please check back soon.</p>
          </div>
        )}
      </section>
    </main>
  );
}
