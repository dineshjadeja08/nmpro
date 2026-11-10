import { ArrowRight, CalendarDays, ClipboardCheck, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { HeroIllustration } from "@/components/hero-illustration";
import { ProblemSearch } from "@/components/problem-search";
import { ServiceCard } from "@/components/service-card";
import { ServiceImage } from "@/components/service-image";
import { getCatalog } from "@/lib/catalog";
import { getCategoryVisualSrc } from "@/lib/service-images";

export default async function Home() {
  const { data, error } = await getCatalog();
  const categories = data?.categories ?? [];
  const services = data?.services ?? [];

  return (
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow"><span /> Home care, with a clearer way forward</span>
            <h1>Home problems?<br /><em>NammaPros</em> has it covered.</h1>
            <p>Book home-service professionals for appliance repairs, maintenance and everyday home needs.</p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/book">Find a Service <ArrowRight size={18} /></Link>
              <Link className="button button-outline" href="/services">Explore Services</Link>
            </div>
            <div className="hero-note">
              <span className="hero-note-icon"><MapPin size={18} /></span>
              <span>Starting in Tamil Nadu. Check availability by address when booking opens.</span>
            </div>
          </div>
          <HeroIllustration />
        </div>
      </section>

      {categories.length > 0 && (
        <section className="section container" style={{ paddingTop: "12px", paddingBottom: "24px" }}>
          <div className="section-heading" style={{ marginBottom: "18px" }}>
            <div>
              <span className="section-kicker">SERVICE CATEGORIES</span>
              <h2>Browse by appliance or home need.</h2>
            </div>
            <Link href="/services" className="text-link">All categories <ArrowRight size={17} /></Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 8).map((c) => {
              const imgSrc = getCategoryVisualSrc(c);
              return (
                <Link
                  key={c.id}
                  href={`/services/${encodeURIComponent(c.slug)}`}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 no-underline text-inherit shadow-xs transition hover:border-[#800020] hover:shadow-md"
                >
                  {imgSrc && (
                    <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-xl">
                      <ServiceImage src={imgSrc} alt={c.name} />
                    </div>
                  )}
                  <strong className="text-base font-bold text-slate-900">{c.name}</strong>
                  {c.description && (
                    <span className="mt-1 text-xs text-slate-500 line-clamp-2">{c.description}</span>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#800020]">
                    Explore services <ArrowRight size={14} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="search-section container">
        <div className="search-panel">
          <div>
            <span className="section-kicker">START WITH THE PROBLEM</span>
            <h2>Tell us what’s happening at home.</h2>
            <p>You don’t need to know the technical name. Try a common issue below.</p>
          </div>
          <ProblemSearch compact />
        </div>
      </section>

      <section className="section container" id="services">
        <div className="section-heading">
          <div>
            <span className="section-kicker">WHAT WE CAN HELP WITH</span>
            <h2>Services for the moments that matter.</h2>
            <p>Explore the full catalogue. Prices and appointments will appear when confirmed for your location.</p>
          </div>
          <Link href="/services" className="text-link">View all services <ArrowRight size={17} /></Link>
        </div>
        {error ? (
          <div className="status-panel" role="alert">
            <h3>Catalog temporarily unavailable</h3>
            <p>{error}</p>
            <Link href="/services">Try the service page</Link>
          </div>
        ) : services.length ? (
          <div className="services-grid">
            {services.slice(0, 12).map((service) => (
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

      <section className="section tinted-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-kicker">A SIMPLER JOURNEY</span>
              <h2>From problem to plan in three steps.</h2>
            </div>
          </div>
          <div className="steps-grid">
            <div><span>01</span><Search /><h3>Find the right service</h3><p>Choose a service or start with the issue you’re seeing.</p></div>
            <div><span>02</span><CalendarDays /><h3>Pick where and when</h3><p>Enter your address, then view available appointments when scheduling opens.</p></div>
            <div><span>03</span><ClipboardCheck /><h3>Review with clarity</h3><p>See a server-verified price and details before a future confirmation.</p></div>
          </div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-kicker">GOOD TO KNOW</span>
              <h2>Clear answers, before you begin.</h2>
            </div>
          </div>
          <div className="faq-grid">
            <details><summary>Can I book a service now?</summary><p>Booking is available across our active service zones in Chennai and Tamil Nadu.</p></details>
            <details><summary>How will pricing work?</summary><p>When prices are configured for a service and location, you’ll see the breakdown and any advance deposit before confirmation.</p></details>
            <details><summary>Where will NammaPros operate?</summary><p>Tamil Nadu is the initial market, starting with key zones in Chennai.</p></details>
          </div>
        </div>
      </section>

      <section className="partner-band">
        <div className="container">
          <div>
            <span className="section-kicker">WORK WITH US</span>
            <h2>Bring your expertise to more homes.</h2>
            <p>Technician onboarding is being prepared. Learn about the upcoming partner experience.</p>
          </div>
          <Link className="button button-light" href="/join-as-technician">Technician registration <ArrowRight size={18} /></Link>
        </div>
      </section>
    </main>
  );
}
