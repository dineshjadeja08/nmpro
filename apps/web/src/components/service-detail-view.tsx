"use client";

import type { PublicReview, Service, ServiceCategory, ServicePackage, ServiceProcessStep } from "@nammapros/types";
import {
  ArrowRight,
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  ShieldCheck,
  Sparkles,
  Star,
  UserCheck,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import { getPackageUnitPaise, pickDefaultPackage, useBookingCart } from "@/components/booking-cart-provider";
import { ServiceImage } from "@/components/service-image";
import { resolveUploadedMediaUrl, serviceBannerImage, serviceMainImage } from "@/lib/service-images";
import { formatStartingPrice } from "@/lib/services";

function formatRupees(paise: number) {
  const rupees = paise / 100;
  const hasDecimals = rupees % 1 !== 0;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

const DEFAULT_PROCESS_STEPS: ServiceProcessStep[] = [
  {
    title: "Arrival & 10-point check",
    description: "Your pro inspects the appliance or fixture and confirms the exact issue before starting.",
  },
  {
    title: "Careful service work",
    description: "Cleaned, repaired, or installed cleanly with floor protection and tested tools.",
  },
  {
    title: "Safety & performance test",
    description: "Cooling, electrical draw, water seal, or drainage is checked right in front of you.",
  },
  {
    title: "Clean workspace handover",
    description: "Packaging and residue are cleared away before your final sign-off and 30-day warranty.",
  },
];

export function ServiceDetailView({
  category,
  service,
  relatedServices,
  reviewSummary,
}: {
  category: ServiceCategory;
  service: Service;
  relatedServices: Service[];
  reviewSummary: {
    average_rating: number | null;
    review_count: number;
    rating_breakdown?: Record<string, number>;
    results: PublicReview[];
  };
}) {
  const { item: cartItem, addToCart, openSheet } = useBookingCart();

  const galleryUrls = useMemo(() => {
    const raw: Array<{ url: string; alt: string }> = [];
    const seen = new Set<string>();
    const addUrl = (u?: string | null, alt = service.name) => {
      const resolved = resolveUploadedMediaUrl(u);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        raw.push({ url: resolved, alt });
      }
    };
    addUrl(serviceMainImage(service), service.name);
    if (service.banner_is_active !== false) {
      addUrl(serviceBannerImage(service), service.banner_title || service.name);
    }
    for (const img of service.images ?? []) {
      addUrl(img.url, img.alt_text || service.name);
    }
    return raw;
  }, [service]);

  const [photoIdx, setPhotoIdx] = useState(0);
  const packages = useMemo(() => service.packages ?? [], [service.packages]);
  const defaultPkg = useMemo(() => pickDefaultPackage(service), [service]);
  const [selectedPkgId, setSelectedPkgId] = useState(defaultPkg?.id ?? "");
  const activePkg: ServicePackage | null =
    packages.find((p) => p.id === selectedPkgId) ?? defaultPkg;

  const [expandedPkgId, setExpandedPkgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [partsOpen, setPartsOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [onlyPhotoReviews, setOnlyPhotoReviews] = useState(false);
  const [selectedArea, setSelectedArea] = useState("All");

  const inclusions = useMemo(() => {
    const combined = [...(service.inclusions ?? []), ...(activePkg?.inclusions ?? [])];
    return Array.from(new Set(combined.filter(Boolean)));
  }, [service.inclusions, activePkg]);

  const exclusions = useMemo(() => {
    const combined = [...(service.exclusions ?? []), ...(activePkg?.exclusions ?? [])];
    return Array.from(new Set(combined.filter(Boolean)));
  }, [service.exclusions, activePkg]);

  const processSteps = service.process_steps && service.process_steps.length > 0
    ? service.process_steps
    : DEFAULT_PROCESS_STEPS;

  const spareParts = useMemo(() => service.spare_parts_rates ?? [], [service.spare_parts_rates]);
  const partBrands = useMemo(() => {
    const brands = Array.from(new Set(spareParts.map((p) => p.brand).filter(Boolean))) as string[];
    return brands.length > 1 ? ["All", ...brands] : [];
  }, [spareParts]);
  const filteredParts = useMemo(
    () =>
      selectedBrand === "All"
        ? spareParts
        : spareParts.filter((p) => (p.brand || "General") === selectedBrand),
    [spareParts, selectedBrand]
  );

  const reviews = useMemo(() => reviewSummary.results ?? [], [reviewSummary.results]);
  const reviewAreas = useMemo(() => {
    const areas = Array.from(new Set(reviews.map((r) => r.area).filter(Boolean))) as string[];
    return areas.length > 0 ? ["All", ...areas] : [];
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => {
      if (onlyPhotoReviews && !r.photo_url) return false;
      if (selectedArea !== "All" && r.area !== selectedArea) return false;
      return true;
    });
  }, [reviews, onlyPhotoReviews, selectedArea]);

  const avgRating = service.rating_avg ?? reviewSummary.average_rating;
  const totalReviews = service.review_count ?? reviewSummary.review_count ?? 0;
  const activeUnitPaise = getPackageUnitPaise(service, activePkg);
  const durationMinutes = activePkg?.duration_minutes ?? 60;

  const mobileCount = cartItem && cartItem.service.id === service.id ? cartItem.quantity : 1;
  const mobilePricePaise =
    cartItem && cartItem.service.id === service.id
      ? (getPackageUnitPaise(cartItem.service, cartItem.pkg) ?? activeUnitPaise ?? 0) * cartItem.quantity
      : activeUnitPaise;

  const navTabs = [
    { id: "overview", label: "Overview" },
    { id: "included", label: "What’s included" },
    { id: "excluded", label: "Not included" },
    { id: "process", label: "Process" },
    { id: "faqs", label: "FAQs" },
    { id: "reviews", label: "Reviews" },
  ];

  const handleBookOrAdd = (pkg: ServicePackage | null = activePkg) => {
    if (pkg) {
      addToCart(service, pkg, 1);
      return;
    }
    openSheet();
  };

  return (
    <main className="pb-32 md:pb-16">
      {/* Top Breadcrumb + Gallery Hero */}
      <section className="border-b border-[#E8E1DB] bg-white/70">
        <div className="container py-6 sm:py-8">
          <nav className="breadcrumbs mb-4 text-xs text-[#57534E]" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-[#800020]">Home</Link> /{" "}
            <Link href="/services" className="hover:text-[#800020]">Services</Link> /{" "}
            <Link href={`/services/${encodeURIComponent(category.slug)}`} className="hover:text-[#800020]">
              {category.name}
            </Link>{" "}
            / <span className="text-[#1C1917] font-medium">{service.name}</span>
          </nav>

          {galleryUrls.length > 0 && (
            <div className="mb-6 space-y-3">
              <div className="group relative aspect-[16/9] max-h-[460px] w-full overflow-hidden rounded-[20px] bg-[#F4EFE9] shadow-[0_12px_35px_rgba(28,25,23,0.08)]">
                <ServiceImage
                  src={galleryUrls[photoIdx]?.url}
                  alt={galleryUrls[photoIdx]?.alt || service.name}
                  priority
                  sizes="(min-width: 1024px) 1140px, 100vw"
                />
                {galleryUrls.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous photo"
                      onClick={() => setPhotoIdx((i) => (i - 1 + galleryUrls.length) % galleryUrls.length)}
                      className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#1C1917] shadow-md transition hover:bg-white"
                    >
                      <ChevronLeft size={20} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      aria-label="Next photo"
                      onClick={() => setPhotoIdx((i) => (i + 1) % galleryUrls.length)}
                      className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#1C1917] shadow-md transition hover:bg-white"
                    >
                      <ChevronRight size={20} strokeWidth={1.5} />
                    </button>
                    <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                      {photoIdx + 1} / {galleryUrls.length}
                    </div>
                  </>
                )}
              </div>

              {galleryUrls.length > 1 && (
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {galleryUrls.map((g, i) => (
                    <button
                      key={g.url}
                      type="button"
                      aria-label={`View photo ${i + 1}`}
                      onClick={() => setPhotoIdx(i)}
                      className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                        i === photoIdx ? "border-[#800020]" : "border-transparent opacity-75 hover:opacity-100"
                      }`}
                    >
                      <ServiceImage src={g.url} alt={g.alt} zoomOnHover={false} sizes="96px" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-3xl space-y-2.5">
              <span className="inline-block text-[11px] font-bold uppercase tracking-[0.18em] text-[#800020]">
                {category.name}
              </span>
              <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1C1917] sm:text-5xl">
                {service.banner_title || service.name}
              </h1>
              {(service.banner_subtitle || service.summary) && (
                <p className="text-sm leading-relaxed text-[#57534E] sm:text-base">
                  {service.banner_subtitle || service.summary}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-semibold sm:text-sm">
                {avgRating != null && totalReviews > 0 && (
                  <a
                    href="#reviews"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#F4EFE9] px-3.5 py-1.5 text-[#1C1917]"
                  >
                    <Star size={14} strokeWidth={1.5} className="fill-[#C8A35B] text-[#C8A35B]" />
                    <strong>{avgRating}</strong>
                    <span className="text-[#57534E]">({totalReviews} reviews)</span>
                  </a>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5ebe8] px-3.5 py-1.5 text-[#800020]">
                  <Clock size={14} strokeWidth={1.5} />
                  <span>
                    {activeUnitPaise != null ? `Starts at ${formatRupees(activeUnitPaise)}` : formatStartingPrice(service)}{" "}
                    · {durationMinutes} min
                  </span>
                </span>
              </div>
            </div>

            {activePkg ? (
              <button
                type="button"
                onClick={() => handleBookOrAdd(activePkg)}
                className="hidden min-h-[48px] items-center gap-2 rounded-full bg-[#800020] px-7 text-sm font-bold text-white shadow-md transition hover:bg-[#5e0017] md:inline-flex"
              >
                <Plus size={16} strokeWidth={1.75} />
                <span>Add to booking</span>
              </button>
            ) : (
              <Link
                href={`/book?service=${encodeURIComponent(service.slug)}`}
                className="hidden min-h-[48px] items-center gap-2 rounded-full bg-[#800020] px-7 text-sm font-bold text-white shadow-md transition hover:bg-[#5e0017] md:inline-flex"
              >
                <span>Book a pro</span>
                <ArrowRight size={16} strokeWidth={1.5} />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Sticky Section Tabs */}
      <nav
        aria-label="Service sections"
        className="sticky top-0 z-20 border-b border-[#E8E1DB] bg-[#FBF8F5]/95 backdrop-blur"
      >
        <div className="container flex gap-1 overflow-x-auto py-2">
          {navTabs.map((tab) => (
            <a
              key={tab.id}
              href={`#${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[42px] shrink-0 inline-flex items-center rounded-full px-4 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-[#800020] text-white"
                  : "text-[#57534E] hover:bg-[#F4EFE9] hover:text-[#1C1917]"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Main Content + Desktop Running Card */}
      <div className="container grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-8">
          {/* Package Selector Cards */}
          {packages.length > 0 && (
            <section id="packages" className="space-y-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-[#1C1917]">Choose your service option</h2>
                <p className="mt-1 text-xs text-[#57534E]">
                  Pick a package to add it directly to your slot-first booking sheet.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {packages.map((pkg) => {
                  const unitPrice = getPackageUnitPaise(service, pkg);
                  const original = pkg.original_price_paise;
                  const showStrike = Boolean(original && unitPrice != null && original > unitPrice);
                  const selected = activePkg?.id === pkg.id;
                  const expanded = expandedPkgId === pkg.id;
                  const shortList = (pkg.inclusions ?? []).slice(0, 3);
                  const hasMore = (pkg.inclusions ?? []).length > 3;

                  return (
                    <article
                      key={pkg.id}
                      onClick={() => setSelectedPkgId(pkg.id)}
                      className={`flex cursor-pointer flex-col justify-between rounded-[20px] bg-white p-5 transition shadow-[0_6px_24px_rgba(28,25,23,0.05)] ${
                        selected ? "ring-2 ring-[#800020]" : "hover:shadow-[0_10px_30px_rgba(28,25,23,0.08)]"
                      }`}
                    >
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-serif text-lg font-bold text-[#1C1917]">{pkg.name}</h3>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-[#57534E]">
                              <Clock size={13} strokeWidth={1.5} className="text-[#800020]" />
                              <span>{pkg.duration_minutes} min</span>
                            </p>
                          </div>
                          {pkg.is_most_booked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#C8A35B]/20 px-2.5 py-1 text-[11px] font-bold text-[#8a6823]">
                              <Star size={11} strokeWidth={1.5} className="fill-[#C8A35B] text-[#C8A35B]" /> Most booked
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-xl font-bold text-[#800020]">
                            {unitPrice != null ? formatRupees(unitPrice) : "Inspection rate"}
                          </span>
                          {showStrike && (
                            <span className="text-xs text-[#57534E] line-through">
                              {formatRupees(original!)}
                            </span>
                          )}
                        </div>

                        {shortList.length > 0 && (
                          <ul className="mt-3 space-y-1.5 text-xs text-[#57534E]">
                            {(expanded ? pkg.inclusions : shortList).map((pt, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <Check size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#800020]" />
                                <span>{pt}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {hasMore && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPkgId(expanded ? null : pkg.id);
                            }}
                            className="mt-2 text-xs font-bold text-[#800020] hover:underline"
                          >
                            {expanded ? "Show less" : `View full list (+${pkg.inclusions.length - 3} more)`}
                          </button>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#F4EFE9]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPkgId(pkg.id);
                            addToCart(service, pkg, 1);
                          }}
                          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#800020] px-5 text-xs font-bold text-white transition hover:bg-[#5e0017]"
                        >
                          <Plus size={15} strokeWidth={1.75} />
                          <span>Add · {unitPrice != null ? formatRupees(unitPrice) : "Book"}</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* Overview */}
          <section id="overview" className="scroll-mt-16 rounded-[20px] bg-white p-6 shadow-[0_6px_24px_rgba(28,25,23,0.05)]">
            <h2 className="font-serif text-2xl font-bold text-[#1C1917]">Overview</h2>
            {service.description ? (
              <div
                className="prose prose-sm mt-3 max-w-none leading-relaxed text-[#57534E] [&_h2]:mt-4 [&_h2]:font-serif [&_h2]:text-lg [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: service.description }}
              />
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-[#57534E]">{service.summary}</p>
            )}
            {service.features && service.features.length > 0 && (
              <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 text-xs font-medium text-[#1C1917]">
                {service.features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-xl bg-[#FBF8F5] p-3">
                    <Sparkles size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#800020]" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Included vs Not Included Two Columns */}
          {(inclusions.length > 0 || exclusions.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <section
                id="included"
                className="scroll-mt-16 rounded-[20px] bg-white p-6 shadow-[0_6px_24px_rgba(28,25,23,0.05)]"
              >
                <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-bold text-[#1C1917]">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check size={15} strokeWidth={2} />
                  </span>
                  <span>What’s included</span>
                </h2>
                {inclusions.length > 0 ? (
                  <ul className="space-y-2 text-xs leading-relaxed text-[#57534E]">
                    {inclusions.map((inc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-emerald-600" />
                        <span>{inc}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#57534E]">Confirmed in your booking summary before the visit.</p>
                )}
              </section>

              <section
                id="excluded"
                className="scroll-mt-16 rounded-[20px] bg-[#F4EFE9] p-6"
              >
                <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-bold text-[#1C1917]">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-stone-200 text-[#57534E]">
                    <X size={15} strokeWidth={2} />
                  </span>
                  <span>Not included</span>
                </h2>
                {exclusions.length > 0 ? (
                  <ul className="space-y-2 text-xs leading-relaxed text-[#57534E]">
                    {exclusions.map((exc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <X size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-[#57534E]" />
                        <span>{exc}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#57534E]">
                    Any additional spare parts or heavy civil/electrical modifications require your approval first.
                  </p>
                )}
              </section>
            </div>
          )}

          {/* How we do it (4–6 step timeline) */}
          <section id="process" className="scroll-mt-16 rounded-[20px] bg-white p-6 shadow-[0_6px_24px_rgba(28,25,23,0.05)]">
            <h2 className="font-serif text-2xl font-bold text-[#1C1917]">How we do it</h2>
            <p className="mt-1 text-xs text-[#57534E]">Clean, predictable steps from doorbell to final check.</p>
            <ol className="mt-5 space-y-4">
              {processSteps.map((step, i) => (
                <li
                  key={i}
                  className="flex items-start gap-4 rounded-2xl bg-[#FBF8F5] p-4"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#800020] text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#1C1917]">{step.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[#57534E]">{step.description}</p>
                  </div>
                  {step.image_url && resolveUploadedMediaUrl(step.image_url) && (
                    <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl">
                      <ServiceImage src={step.image_url} alt={step.title} sizes="80px" />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>

          {/* Expandable Spare-Parts Rate Card */}
          <section className="rounded-[20px] bg-white p-6 shadow-[0_6px_24px_rgba(28,25,23,0.05)]">
            <button
              type="button"
              onClick={() => setPartsOpen((o) => !o)}
              aria-expanded={partsOpen}
              className="flex min-h-[48px] w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f5ebe8] text-[#800020]">
                  <Wrench size={18} strokeWidth={1.5} />
                </span>
                <div>
                  <h2 className="font-serif text-lg font-bold text-[#1C1917]">Spare-parts rate card & approval</h2>
                  <p className="text-xs text-[#57534E]">No surprise add-ons — see part prices and approve before replacement.</p>
                </div>
              </div>
              <ChevronDown
                size={18}
                strokeWidth={1.5}
                className={`shrink-0 text-[#800020] transition-transform ${partsOpen ? "rotate-180" : ""}`}
              />
            </button>

            {partsOpen && (
              <div className="mt-4 border-t border-[#E8E1DB] pt-4 space-y-3">
                {spareParts.length > 0 ? (
                  <>
                    {partBrands.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {partBrands.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setSelectedBrand(b)}
                            className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold ${
                              selectedBrand === b ? "bg-[#800020] text-white" : "bg-[#F4EFE9] text-[#1C1917]"
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[#E8E1DB] text-[#57534E]">
                          <tr>
                            <th className="py-2 pr-3 font-semibold">Part</th>
                            <th className="py-2 pr-3 font-semibold">Brand</th>
                            <th className="py-2 font-semibold text-right">Indicative Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4EFE9]">
                          {filteredParts.map((row, idx) => (
                            <tr key={idx}>
                              <td className="py-2.5 pr-3 font-medium text-[#1C1917]">{row.part_name}</td>
                              <td className="py-2.5 pr-3 text-[#57534E]">{row.brand || "All brands"}</td>
                              <td className="py-2.5 text-right font-bold text-[#800020]">
                                {row.price_paise != null ? formatRupees(row.price_paise) : row.price_label || "Quoted at visit"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl bg-[#FBF8F5] p-4 text-xs leading-relaxed text-[#57534E]">
                    If your appliance needs a replacement component, your NammaPros technician submits an{" "}
                    <strong>itemized parts &amp; labour quote in the app first</strong>. Nothing extra is replaced or billed until you tap Approve.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* NammaPros Promise Card */}
          <section className="rounded-[20px] bg-[#F4EFE9] p-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#800020]">
              THE NAMMAPROS PROMISE
            </span>
            <h2 className="mt-1 font-serif text-xl font-bold text-[#1C1917]">Peace of mind built into every visit.</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { icon: ShieldCheck, title: "30-day service warranty", desc: "Free rework if the same issue recurs within 30 days." },
                { icon: UserCheck, title: "Background-verified pros", desc: "Trained technicians with verified ID & skill checks." },
                { icon: Wallet, title: "No hidden charges", desc: "Clear base price upfront; extra parts need your approval." },
                { icon: CalendarClock, title: "Reschedule for free", desc: "Plans changed? Move your slot without hassle." },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 rounded-2xl bg-white p-4">
                  <Icon size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#800020]" />
                  <div>
                    <p className="text-xs font-bold text-[#1C1917]">{title}</p>
                    <p className="mt-0.5 text-[11px] text-[#57534E]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* FAQs */}
          {service.faqs && service.faqs.length > 0 && (
            <section id="faqs" className="scroll-mt-16 space-y-3">
              <h2 className="font-serif text-2xl font-bold text-[#1C1917]">Frequently asked questions</h2>
              <div className="space-y-2.5">
                {service.faqs.map((f, i) => (
                  <details key={i} className="rounded-[18px] bg-white p-5 shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
                    <summary className="cursor-pointer font-serif text-base font-semibold text-[#1C1917]">
                      {f.question}
                    </summary>
                    <p className="mt-2 text-xs leading-relaxed text-[#57534E]">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Reviews Section with Breakdown + Filters */}
          <section id="reviews" className="scroll-mt-16 rounded-[20px] bg-white p-6 shadow-[0_6px_24px_rgba(28,25,23,0.05)] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl font-bold text-[#1C1917]">Customer reviews</h2>
                <p className="mt-0.5 text-xs text-[#57534E]">Real ratings submitted after completed home visits.</p>
              </div>
              {avgRating != null && totalReviews > 0 && (
                <div className="flex items-center gap-2 rounded-2xl bg-[#FBF8F5] px-4 py-2.5">
                  <Star size={20} strokeWidth={1.5} className="fill-[#C8A35B] text-[#C8A35B]" />
                  <strong className="text-xl font-bold text-[#1C1917]">{avgRating}</strong>
                  <span className="text-xs text-[#57534E]">({totalReviews} reviews)</span>
                </div>
              )}
            </div>

            {totalReviews > 0 && reviewSummary.rating_breakdown && (
              <div className="grid gap-1.5 rounded-2xl bg-[#FBF8F5] p-4">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = reviewSummary.rating_breakdown?.[String(star)] ?? 0;
                  const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-3 text-xs">
                      <span className="w-8 font-semibold text-[#1C1917]">{star} ★</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E8E1DB]">
                        <div className="h-full rounded-full bg-[#C8A35B]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right text-[#57534E]">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {reviews.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOnlyPhotoReviews((v) => !v)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition ${
                    onlyPhotoReviews ? "bg-[#800020] text-white" : "bg-[#F4EFE9] text-[#1C1917]"
                  }`}
                >
                  <Camera size={14} strokeWidth={1.5} /> With photos
                </button>
                {reviewAreas.map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setSelectedArea(area)}
                    className={`min-h-[40px] rounded-full px-3.5 text-xs font-semibold transition ${
                      selectedArea === area ? "bg-[#1C1917] text-white" : "bg-[#F4EFE9] text-[#1C1917]"
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            )}

            {filteredReviews.length > 0 ? (
              <div className="space-y-3">
                {filteredReviews.map((rev) => (
                  <article key={rev.id} className="rounded-2xl border border-[#F4EFE9] bg-[#FBF8F5] p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-[#1C1917]">{rev.customer_name}</strong>
                        {rev.area && (
                          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#57534E]">
                            {rev.area}
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#8a6823]">
                        <Star size={13} strokeWidth={1.5} className="fill-[#C8A35B] text-[#C8A35B]" />
                        {rev.rating}.0
                      </span>
                    </div>
                    {rev.comment && <p className="text-xs leading-relaxed text-[#57534E]">{rev.comment}</p>}
                    {rev.tags && rev.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {rev.tags.map((t) => (
                          <span key={t} className="rounded-full bg-[#f5ebe8] px-2.5 py-0.5 text-[10px] font-semibold text-[#800020]">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {rev.photo_url && resolveUploadedMediaUrl(rev.photo_url) && (
                      <div className="relative h-28 w-40 overflow-hidden rounded-xl">
                        <ServiceImage src={rev.photo_url} alt={`Review by ${rev.customer_name}`} sizes="160px" />
                      </div>
                    )}
                    {rev.technician_name && (
                      <p className="text-[11px] text-[#57534E]">
                        Technician: <strong className="text-[#1C1917]">{rev.technician_name}</strong>
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-[#FBF8F5] p-4 text-xs text-[#57534E]">
                {reviews.length > 0
                  ? "No reviews match this filter yet."
                  : "Verified customer reviews will appear here as visits complete."}
              </p>
            )}
          </section>
        </div>

        {/* Desktop Sidebar Card */}
        <aside className="hidden lg:sticky lg:top-16 lg:block rounded-[20px] bg-white p-6 shadow-[0_12px_35px_rgba(28,25,23,0.07)] space-y-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#800020]">
            Ready when you are
          </span>
          <h3 className="font-serif text-xl font-bold text-[#1C1917]">{activePkg?.name || service.name}</h3>
          <p className="text-2xl font-bold text-[#800020]">
            {activeUnitPaise != null ? formatRupees(activeUnitPaise) : formatStartingPrice(service)}
          </p>
          {service.price_note && <p className="text-xs text-[#57534E]">{service.price_note}</p>}
          <p className="text-xs leading-relaxed text-[#57534E]">
            Choose your preferred day &amp; slot first — pay only after verifying details.
          </p>
          {activePkg ? (
            <button
              type="button"
              onClick={() => handleBookOrAdd(activePkg)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#800020] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
            >
              <span>Add &amp; pick slot</span>
              <ArrowRight size={16} strokeWidth={1.5} />
            </button>
          ) : (
            <Link
              href={`/book?service=${encodeURIComponent(service.slug)}`}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#800020] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
            >
              <span>Pick a slot</span>
              <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          )}
        </aside>
      </div>

      {/* Related Sub-Services */}
      {relatedServices.length > 0 && (
        <section className="container border-t border-[#E8E1DB] py-10">
          <h2 className="mb-4 font-serif text-2xl font-bold text-[#1C1917]">More {category.name} services</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedServices.map((rel) => (
              <Link
                key={rel.id}
                href={`/services/${encodeURIComponent(category.slug)}/${encodeURIComponent(rel.slug)}`}
                className="rounded-[18px] bg-white p-5 no-underline text-inherit shadow-[0_6px_20px_rgba(28,25,23,0.05)] transition hover:shadow-[0_10px_28px_rgba(28,25,23,0.08)]"
              >
                <strong className="block font-serif text-base font-bold text-[#1C1917]">{rel.name}</strong>
                <span className="mt-1 block text-xs text-[#57534E] line-clamp-2">{rel.summary}</span>
                <span className="mt-2.5 block text-xs font-bold text-[#800020]">{formatStartingPrice(rel)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Mobile Fixed Bottom Price Bar */}
      <div className="fixed inset-x-0 bottom-[56px] z-30 border-t border-[#E8E1DB] bg-white/95 px-4 py-2.5 shadow-[0_-6px_20px_rgba(28,25,23,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#1C1917]">
              {mobilePricePaise != null ? `${formatRupees(mobilePricePaise)} · ` : ""}
              {mobileCount} {mobileCount === 1 ? "item" : "items"}
            </p>
            <p className="text-[11px] text-[#57534E]">{activePkg?.name || service.name}</p>
          </div>
          {activePkg ? (
            <button
              type="button"
              onClick={() => handleBookOrAdd(activePkg)}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#800020] px-6 text-sm font-bold text-white shadow-sm"
            >
              <span>Continue</span>
              <ArrowRight size={16} strokeWidth={1.5} />
            </button>
          ) : (
            <Link
              href={`/book?service=${encodeURIComponent(service.slug)}`}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#800020] px-6 text-sm font-bold text-white shadow-sm"
            >
              <span>Continue</span>
              <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
