import {
  CheckCircle2,
  Star,
} from "lucide-react";
import Image from "next/image";
import { HomeCategoryGrid } from "@/components/home-category-grid";
import { MostBookedServices } from "@/components/most-booked-services";
import { OfferSpotlight } from "@/components/offer-spotlight";
import { RecentReviewsCarousel } from "@/components/recent-reviews-carousel";
import { SpotlightBanners } from "@/components/spotlight-banners";
import { api, getCatalog } from "@/lib/catalog";
import { pickPopularServices } from "@/lib/services";

export default async function Home() {
  const [{ data }, publicReviews] = await Promise.all([
    getCatalog(),
    api.publicReviews().catch(() => null),
  ]);
  const services = data?.services ?? [];
  const acServices = services
    .filter((s) => s.is_active !== false && (s.category === "ac" || s.category === "air-conditioning"))
    .sort((a, b) => Number(Boolean(b.is_popular)) - Number(Boolean(a.is_popular)) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .slice(0, 5);
  const reviews = (publicReviews?.results ?? data?.reviews ?? []).slice(0, 15);
  const banners = data?.banners ?? [];
  const trust = data?.trust_stats;

  return (
    <main className="bg-[#FBF8F5]">
      {/* 1. Split Hero Banner (Blush Rose #FBECEF + Technician on Right) */}
      <section id="categories" className="relative scroll-mt-20 overflow-hidden border-b border-[#EAE3DC] bg-white pt-6 pb-6 text-[#1C1917] sm:pt-8 sm:pb-0">
        <div className="container grid items-end gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-6">
          <div className="max-w-xl pb-6 lg:pb-10">
            <h1 className="mb-5 text-2xl font-bold tracking-tight text-[#1C1917] sm:mb-6 sm:text-4xl">
              India&apos;s trusted <span className="text-[#800020]">home service</span>
            </h1>
            <HomeCategoryGrid categories={data?.categories ?? []} services={services} />
          </div>

          <div className="relative hidden items-end justify-center sm:flex lg:justify-end">
            <Image
              src="/images/brand/hero-technicians-pair.webp"
              alt="Two verified NammaPros technicians in uniform with tool belts"
              width={838}
              height={909}
              priority
              unoptimized
              className="relative z-10 h-[380px] w-auto object-contain object-bottom md:h-[440px] lg:h-[500px] xl:h-[530px]"
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

      {/* 2. Spotlight banners (each opens its service) */}
      <SpotlightBanners categories={data?.categories ?? []} services={services} banners={data?.spotlight_banners ?? []} />

      {/* 4. Most booked services */}
      <MostBookedServices services={pickPopularServices(services, 5)} />

      {/* 5. Featured Dark Offer Card */}
      <OfferSpotlight banners={banners} />

      {/* 6. From homes near you */}
      <RecentReviewsCarousel reviews={reviews} />

      {/* 7. App download banner */}
      <section className="container pt-4 pb-10" aria-label="Get the NammaPros app">
        <Image
          src="/images/brand/app-download-banner.webp"
          alt="All your home services, just one place. Download the NammaPros app on the App Store or Google Play."
          width={1600}
          height={534}
          unoptimized
          className="h-auto w-full rounded-2xl"
        />
      </section>

      {/* 8. Best AC service: five AC services, same card as "Most booked" */}
      <MostBookedServices id="best-ac" title="Best AC service" services={acServices} />
    </main>
  );
}
