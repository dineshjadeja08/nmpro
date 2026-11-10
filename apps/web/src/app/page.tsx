import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { OfferSpotlight } from "@/components/offer-spotlight";
import { ProblemSearch } from "@/components/problem-search";
import { ServiceCard } from "@/components/service-card";
import { ServiceImage } from "@/components/service-image";
import { getCatalog } from "@/lib/catalog";
import { getCategoryVisualSrc, resolveUploadedMediaUrl, serviceListImage } from "@/lib/service-images";

function formatRupees(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}

export default async function Home() {
  const { data, error } = await getCatalog();
  const categories = data?.categories ?? [];
  const services = data?.services ?? [];
  const reviews = (data?.reviews ?? []).slice(0, 3);
  const banners = data?.banners ?? [];
  const trust = data?.trust_stats;

  // Compute real "from ₹X" per category from active services in that category
  const minPriceByCategory = new Map<string, number>();
  for (const svc of services) {
    if (svc.starting_price_paise != null) {
      const prev = minPriceByCategory.get(svc.category);
      if (prev === undefined || svc.starting_price_paise < prev) {
        minPriceByCategory.set(svc.category, svc.starting_price_paise);
      }
    }
  }

  // Up to 2 real uploaded photos for clean editorial showcase beside the problem search (if configured)
  const showcasePhotos = [
    ...categories.map((c) => ({ src: getCategoryVisualSrc(c), alt: c.name })).filter((x) => Boolean(x.src)),
    ...services.map((s) => ({ src: serviceListImage(s), alt: s.name })).filter((x) => Boolean(x.src)),
  ].slice(0, 2);

  return (
    <main>
      {/* 1. Problem-First Hero */}
      <section className="border-b border-[#E8E1DB] bg-[#FBF8F5] py-12 sm:py-16">
        <div className="container grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#f5ebe8] px-3.5 py-1.5 text-xs font-bold tracking-wide text-[#800020]">
              <MapPin size={14} strokeWidth={1.5} />
              <span>Namma area, namma pros · Chennai</span>
            </span>

            <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#1C1917] sm:text-5xl lg:text-6xl">
              What’s not working at home?
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[#57534E]">
              Tell us the problem in plain words. We’ll match a verified pro, show clear upfront prices, and arrive in your chosen slot.
            </p>

            <ProblemSearch showChips />
          </div>

          {showcasePhotos.length > 0 && (
            <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-1">
              {showcasePhotos.map((photo, idx) => (
                <div
                  key={idx}
                  className="group relative aspect-[16/9] overflow-hidden rounded-[20px] bg-[#F4EFE9] shadow-[0_14px_35px_rgba(28,25,23,0.08)]"
                >
                  <ServiceImage src={photo.src} alt={photo.alt} priority={idx === 0} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2. Honest Real-Data Trust Strip */}
      <section className="border-b border-[#E8E1DB] bg-white">
        <div className="container flex flex-wrap items-center gap-x-6 gap-y-2.5 py-4 text-xs font-semibold text-[#1C1917] sm:text-sm">
          {trust?.average_rating && trust.review_count > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Star size={16} strokeWidth={1.5} className="fill-[#C8A35B] text-[#C8A35B]" />
              <strong>{trust.average_rating} ★</strong>
              <span className="text-[#57534E]">from {trust.review_count} verified reviews</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={16} strokeWidth={1.5} className="text-[#800020]" />
            Verified pros
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={16} strokeWidth={1.5} className="text-[#800020]" />
            30-day service warranty
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Wallet size={16} strokeWidth={1.5} className="text-[#800020]" />
            Price before booking
          </span>
        </div>
      </section>

      {/* 3. Category Grid (2 col mobile, 4 col desktop, 4:3 photo + "from ₹X") */}
      {categories.length > 0 && (
        <section className="section container">
          <div className="section-heading">
            <div>
              <span className="section-kicker">CATEGORIES</span>
              <h2>Browse by appliance or home care.</h2>
            </div>
            <Link href="/services" className="text-link">
              All categories <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {categories.slice(0, 8).map((c) => {
              const imgSrc = getCategoryVisualSrc(c);
              const fromPaise = minPriceByCategory.get(c.slug);
              return (
                <Link
                  key={c.id}
                  href={`/services/${encodeURIComponent(c.slug)}`}
                  className="group flex flex-col justify-between overflow-hidden rounded-[20px] bg-white p-3.5 no-underline text-inherit shadow-[0_10px_30px_rgba(28,25,23,0.05)] transition hover:shadow-[0_16px_38px_rgba(28,25,23,0.09)] sm:p-4"
                >
                  <div>
                    {imgSrc && (
                      <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-[14px] bg-[#F4EFE9]">
                        <ServiceImage src={imgSrc} alt={c.name} />
                      </div>
                    )}
                    <h3 className="font-serif text-base font-bold text-[#1C1917] sm:text-lg">{c.name}</h3>
                    {c.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-[#57534E]">{c.description}</p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between pt-2 text-xs font-bold text-[#800020]">
                    <span>{fromPaise != null ? `from ${formatRupees(fromPaise)}` : "Explore services"}</span>
                    <ArrowRight size={14} strokeWidth={1.5} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. How It Works: Pick -> Schedule -> Relax */}
      <section className="section tinted-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-kicker">HOW IT WORKS</span>
              <h2>Pick. Schedule. Relax.</h2>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                num: "01",
                icon: Search,
                title: "Pick",
                desc: "Start with your problem or appliance, review clear inclusions, and choose an option.",
              },
              {
                num: "02",
                icon: CalendarDays,
                title: "Schedule",
                desc: "Choose your preferred visit window first, verify via OTP, and pin your address.",
              },
              {
                num: "03",
                icon: Sparkles,
                title: "Relax",
                desc: "Your verified pro arrives in your chosen slot with a 4-digit start OTP and 30-day warranty.",
              },
            ].map(({ num, icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-[20px] bg-white p-7 shadow-[0_10px_28px_rgba(28,25,23,0.05)]"
              >
                <span className="font-serif text-xl font-bold text-[#C8A35B]">{num}</span>
                <Icon size={24} strokeWidth={1.5} className="mt-4 text-[#800020]" />
                <h3 className="mt-4 font-serif text-xl font-bold text-[#1C1917]">{title}</h3>
                <p className="mt-2 text-sm text-[#57534E]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Single Rotating Offer Card */}
      <OfferSpotlight banners={banners} />

      {/* 6. Popular Services */}
      <section className="section container" id="services">
        <div className="section-heading">
          <div>
            <span className="section-kicker">POPULAR HOME CARE</span>
            <h2>Services ready to book cleanly.</h2>
            <p>Every visit includes clear inclusions and our 30-day rework guarantee.</p>
          </div>
          <Link href="/services" className="text-link">
            View all services <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
        {error ? (
          <div className="status-panel" role="alert">
            <h3>Catalog temporarily unavailable</h3>
            <p>{error}</p>
            <Link href="/services">Try the service page</Link>
          </div>
        ) : services.length ? (
          <div className="services-grid">
            {services.slice(0, 8).map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        ) : (
          <div className="status-panel">
            <h3>Our catalog is being prepared</h3>
            <p>No services are published yet. Please check back soon.</p>
          </div>
        )}
      </section>

      {/* 7. Customer Reviews (Real Verified Data) */}
      {reviews.length > 0 && (
        <section className="section tinted-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="section-kicker">NEIGHBORHOOD TRUST</span>
                <h2>Heard across Chennai homes.</h2>
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {reviews.map((rev) => (
                <article
                  key={rev.id}
                  className="flex flex-col justify-between rounded-[20px] bg-white p-6 shadow-[0_10px_28px_rgba(28,25,23,0.05)]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#C8A35B]/15 px-2.5 py-1 text-xs font-bold text-[#8a6823]">
                        <Star size={12} strokeWidth={1.5} className="fill-[#C8A35B] text-[#C8A35B]" />
                        {rev.rating}.0
                      </span>
                      {rev.area && (
                        <span className="text-xs font-semibold text-[#57534E]">{rev.area}</span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-[#1C1917]">
                      “{rev.comment || "Smooth visit, clear communication, and tidy finish."}”
                    </p>
                    {rev.photo_url && resolveUploadedMediaUrl(rev.photo_url) && (
                      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#F4EFE9]">
                        <ServiceImage src={rev.photo_url} alt={`Work done for ${rev.customer_name}`} />
                      </div>
                    )}
                  </div>
                  <div className="mt-4 border-t border-[#F4EFE9] pt-3 text-xs">
                    <strong className="block text-[#1C1917]">{rev.customer_name}</strong>
                    {rev.service_name && <span className="text-[#57534E]">{rev.service_name}</span>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 8. WhatsApp Help Card */}
      <section className="container py-10">
        <div className="flex flex-col justify-between gap-5 rounded-[20px] bg-[#F4EFE9] p-7 sm:flex-row sm:items-center">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-700 text-white">
              <MessageCircle size={22} strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="font-serif text-xl font-bold text-[#1C1917]">Not sure which service fits your issue?</h2>
              <p className="mt-1 text-xs text-[#57534E]">
                Tell our Chennai support desk what’s happening — we’ll guide you before you book.
              </p>
            </div>
          </div>
          <Link
            href="/search"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-full bg-emerald-700 px-6 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            <span>Get help choosing</span>
            <ArrowRight size={16} strokeWidth={1.5} />
          </Link>
        </div>
      </section>

      {/* 9. Partner Banner */}
      <section className="partner-band">
        <div className="container">
          <div>
            <span className="section-kicker">WORK WITH US</span>
            <h2>Skilled technician? Join NammaPros.</h2>
            <p>Steady local visits across Chennai neighborhoods, clear payouts, and respectful support.</p>
          </div>
          <Link className="button button-light" href="/join-as-technician">
            Join as a pro <ArrowRight size={17} strokeWidth={1.5} />
          </Link>
        </div>
      </section>
    </main>
  );
}
