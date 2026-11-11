"use client";

import type { PublicReview, Service, ServiceCategory, ServicePackage, ServiceProcessStep } from "@nammapros/types";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Star,
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
    title: "Inspect",
    description: "Checks performance, noise, and safety points before starting.",
  },
  {
    title: "Cover",
    description: "Covers nearby surfaces and floor cleanly with protective sheets.",
  },
  {
    title: "Service work",
    description: "Completes thorough cleaning, servicing, or repair with calibrated tools.",
  },
  {
    title: "Test",
    description: "Measures output, flow, cooling, or load right in front of you.",
  },
  {
    title: "Clean up",
    description: "Leaves the area tidy and hands over your 30-day rework warranty.",
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
  const { items: cartItems, totalCount: cartCount, totalPaise: cartTotalPaise, addToCart, updateItemQuantity, openSheet } = useBookingCart();

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
  const [activeTab, setActiveTab] = useState("packages");
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

  const processSteps =
    service.process_steps && service.process_steps.length > 0
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

  const mobileCount = cartItems.length > 0 ? cartCount : 1;
  const mobilePricePaise = cartItems.length > 0 ? cartTotalPaise : activeUnitPaise;
  const mobileSubtitle =
    cartItems.length > 1
      ? `${cartItems.length} services in cart`
      : cartItems.length === 1
        ? `${cartItems[0].service.name} · ${cartItems[0].pkg.name}`
        : activePkg?.name || service.name;

  const navTabs = [
    { id: "packages", label: "Packages" },
    { id: "included", label: "Included" },
    { id: "process", label: "Process" },
    { id: "rate-card", label: "Rate card" },
    { id: "reviews", label: "Reviews" },
    { id: "faqs", label: "FAQs" },
  ];

  const handleBookOrAdd = (pkg: ServicePackage | null = activePkg) => {
    if (pkg) {
      addToCart(service, pkg, 1);
      return;
    }
    openSheet();
  };

  return (
    <main className="bg-[#FBF8F5] pb-32 md:pb-16">
      {/* Top Breadcrumb + Gallery Hero */}
      <section className="border-b border-[#E8E1DB] bg-[#FBF8F5]">
        <div className="container py-6 sm:py-8">
          <nav className="mb-5 text-xs text-[#57534E]" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-[#800020]">Home</Link> /{" "}
            <Link href="/services" className="hover:text-[#800020]">Services</Link> /{" "}
            <Link href={`/services/${encodeURIComponent(category.slug)}`} className="hover:text-[#800020]">
              {category.name}
            </Link>{" "}
            / <span className="font-medium text-[#1C1917]">{service.name}</span>
          </nav>

          <div className={`grid items-start gap-8 ${galleryUrls.length > 0 ? "lg:grid-cols-[1.05fr_1fr]" : "lg:grid-cols-1"}`}>
            {galleryUrls.length > 0 && (
              <div className="space-y-3">
                <div className="group relative aspect-[16/7] w-full overflow-hidden rounded-lg bg-[#EDE5DC] shadow-[0_10px_30px_rgba(28,25,23,0.06)]">
                  <ServiceImage
                    src={galleryUrls[photoIdx]?.url}
                    alt={galleryUrls[photoIdx]?.alt || service.name}
                    priority
                    sizes="(min-width: 1024px) 580px, 100vw"
                  />
                  {galleryUrls.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Previous photo"
                        onClick={() => setPhotoIdx((i) => (i - 1 + galleryUrls.length) % galleryUrls.length)}
                        className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md bg-white/90 text-[#1C1917] shadow-md transition hover:bg-white"
                      >
                        <ChevronLeft size={18} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        aria-label="Next photo"
                        onClick={() => setPhotoIdx((i) => (i + 1) % galleryUrls.length)}
                        className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md bg-white/90 text-[#1C1917] shadow-md transition hover:bg-white"
                      >
                        <ChevronRight size={18} strokeWidth={1.5} />
                      </button>
                    </>
                  )}
                </div>

                {galleryUrls.length > 1 && (
                  <div className="grid grid-cols-4 gap-2.5">
                    {galleryUrls.slice(0, 4).map((g, i) => (
                      <button
                        key={g.url}
                        type="button"
                        aria-label={`View photo ${i + 1}`}
                        onClick={() => setPhotoIdx(i)}
                        className={`relative aspect-[16/7] overflow-hidden rounded-md border-2 transition ${
                          i === photoIdx ? "border-[#800020]" : "border-transparent opacity-80 hover:opacity-100"
                        }`}
                      >
                        <ServiceImage src={g.url} alt={g.alt} zoomOnHover={false} sizes="140px" />
                        {i === 3 && galleryUrls.length > 4 && (
                          <span className="absolute inset-0 grid place-items-center bg-black/45 text-xs font-bold text-white">
                            +{galleryUrls.length - 4}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <span className="inline-flex rounded-md bg-[#F5E6EA] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#800020]">
                {category.name}
              </span>
              <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#1C1917] sm:text-5xl">
                {service.banner_title || service.name}
              </h1>

              <div className="flex flex-wrap items-center gap-2 text-xs text-[#57534E]">
                {avgRating != null && totalReviews > 0 && (
                  <a href="#reviews" className="inline-flex items-center gap-1 font-semibold text-[#1C1917] hover:underline">
                    <Star size={13} className="fill-[#C8A35B] text-[#C8A35B]" />
                    <span>{avgRating}</span>
                    <span className="text-[#57534E]">({totalReviews} reviews)</span>
                  </a>
                )}
                <span>·</span>
                <span>
                  {activeUnitPaise != null ? `Starts at ${formatRupees(activeUnitPaise)}` : formatStartingPrice(service)} · {durationMinutes} min
                </span>
              </div>

              {(service.banner_subtitle || service.summary) && (
                <p className="text-sm leading-relaxed text-[#57534E]">
                  {service.banner_subtitle || service.summary}
                </p>
              )}

              {/* 3 Compact Promise Cards */}
              <div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-3">
                {[
                  { title: "30-day warranty", desc: "Free re-visit" },
                  { title: "Verified pro", desc: "ID & skill checked" },
                  { title: "Fixed rate card", desc: "No surprise bills" },
                ].map((box) => (
                  <div key={box.title} className="rounded-md border border-[#EAE3DC] bg-white px-3.5 py-2.5">
                    <strong className="block text-xs font-bold text-[#1C1917]">{box.title}</strong>
                    <span className="text-[11px] text-[#57534E]">{box.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky Underline Tabs */}
      <nav
        aria-label="Service sections"
        className="sticky top-16 z-20 border-b border-[#E8E1DB] bg-[#FBF8F5]/95 backdrop-blur"
      >
        <div className="container flex gap-6 overflow-x-auto">
          {navTabs.map((tab) => (
            <a
              key={tab.id}
              href={`#${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 border-b-2 py-3 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "border-[#800020] text-[#800020]"
                  : "border-transparent text-[#57534E] hover:text-[#1C1917]"
              }`}
            >
              {tab.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Main Content + Right Booking Summary Sidebar */}
      <div className="container grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-9">
          {/* Packages */}
          {packages.length > 0 && (
            <section id="packages" className="scroll-mt-32 space-y-3.5">
              <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">Choose a package</h2>
              <div className="space-y-3">
                {packages.map((pkg) => {
                  const unitPrice = getPackageUnitPaise(service, pkg);
                  const original = pkg.original_price_paise;
                  const showStrike = Boolean(original && unitPrice != null && original > unitPrice);
                  const selected = activePkg?.id === pkg.id;
                  const inCartEntry = cartItems.find((entry) => entry.pkg.id === pkg.id);
                  const inCart = Boolean(inCartEntry);
                  const expanded = expandedPkgId === pkg.id;
                  const shortList = (pkg.inclusions ?? []).slice(0, 3);
                  const hasMore = (pkg.inclusions ?? []).length > 3;

                  return (
                    <article
                      key={pkg.id}
                      onClick={() => setSelectedPkgId(pkg.id)}
                      className={`cursor-pointer rounded-lg bg-white p-4 sm:p-5 transition ${
                        selected
                          ? "border-2 border-[#800020] shadow-[0_8px_24px_rgba(128,0,32,0.08)]"
                          : "border border-[#EAE3DC] hover:border-[#D6CEC6]"
                      }`}
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-serif text-base font-bold text-[#1C1917] sm:text-lg">{pkg.name}</h3>
                            {pkg.is_most_booked && (
                              <span className="inline-flex rounded bg-[#F7ECCD] px-2 py-0.5 text-[10px] font-bold text-[#7A5915]">
                                Most booked
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#57534E]">
                            {pkg.duration_minutes} min
                            {avgRating != null ? ` · ★ ${avgRating}` : ""}
                          </p>
                          {pkg.description && (
                            <p className="text-xs text-[#57534E]">{pkg.description}</p>
                          )}
                          {shortList.length > 0 && (
                            <p className="text-xs text-[#57534E]">
                              {(expanded ? pkg.inclusions : shortList).join(" · ")}
                            </p>
                          )}
                          {hasMore && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedPkgId(expanded ? null : pkg.id);
                              }}
                              className="text-xs font-bold text-[#800020] hover:underline"
                            >
                              {expanded ? "Hide details" : "View details"}
                            </button>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                          <div className="text-right">
                            <span className="text-base font-bold text-[#1C1917]">
                              {unitPrice != null ? formatRupees(unitPrice) : "Inspection"}
                            </span>
                            {showStrike && (
                              <span className="ml-1.5 text-xs text-[#78716C] line-through">
                                {formatRupees(original!)}
                              </span>
                            )}
                          </div>

                          {inCartEntry ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-md border border-[#800020] bg-[#800020] px-2 text-xs font-bold text-white"
                            >
                              <button
                                type="button"
                                aria-label={`Decrease quantity of ${pkg.name}`}
                                onClick={() => updateItemQuantity(pkg.id, inCartEntry.quantity - 1)}
                                className="grid h-7 w-7 place-items-center rounded-lg hover:bg-white/15"
                              >
                                <Minus size={13} strokeWidth={2} />
                              </button>
                              <span className="min-w-[1.25rem] text-center tabular-nums">{inCartEntry.quantity}</span>
                              <button
                                type="button"
                                aria-label={`Increase quantity of ${pkg.name}`}
                                onClick={() => updateItemQuantity(pkg.id, inCartEntry.quantity + 1)}
                                className="grid h-7 w-7 place-items-center rounded-lg hover:bg-white/15"
                              >
                                <Plus size={13} strokeWidth={2} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPkgId(pkg.id);
                                addToCart(service, pkg, 1);
                              }}
                              className={`inline-flex min-h-[38px] items-center justify-center rounded-md px-4 text-xs font-bold transition ${
                                inCart
                                  ? "bg-[#800020] text-white"
                                  : "border border-[#800020] bg-white text-[#800020] hover:bg-[#F5E6EA]"
                              }`}
                            >
                              {`Add · ${unitPrice != null ? formatRupees(unitPrice) : "Book"}`}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* Overview (shown cleanly when full HTML description or features exist) */}
          {(service.description || (service.features && service.features.length > 0)) && (
            <section id="overview" className="scroll-mt-32 rounded-lg border border-[#EAE3DC] bg-white p-5 sm:p-6">
              <h2 className="font-serif text-xl font-semibold text-[#1C1917]">Overview</h2>
              {service.description && (
                <div
                  className="prose prose-sm mt-2 max-w-none text-xs leading-relaxed text-[#57534E] [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: service.description }}
                />
              )}
              {service.features && service.features.length > 0 && (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 text-xs text-[#1C1917]">
                  {service.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check size={14} className="mt-0.5 shrink-0 text-[#800020]" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Included vs Not Included Two Columns */}
          {(inclusions.length > 0 || exclusions.length > 0) && (
            <section id="included" className="scroll-mt-32 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[#EAE3DC] bg-white p-5">
                <h2 className="mb-3 font-serif text-lg font-semibold text-[#1C1917]">What’s included</h2>
                {inclusions.length > 0 ? (
                  <ul className="space-y-2 text-xs text-[#57534E]">
                    {inclusions.map((inc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check size={14} strokeWidth={2.2} className="mt-0.5 shrink-0 text-emerald-700" />
                        <span>{inc}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#57534E]">Confirmed in your booking summary before the visit.</p>
                )}
              </div>

              <div id="excluded" className="rounded-lg border border-[#EAE3DC] bg-white p-5">
                <h2 className="mb-3 font-serif text-lg font-semibold text-[#1C1917]">Not included</h2>
                {exclusions.length > 0 ? (
                  <ul className="space-y-2 text-xs text-[#57534E]">
                    {exclusions.map((exc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <X size={14} strokeWidth={2.2} className="mt-0.5 shrink-0 text-red-700" />
                        <span>{exc}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#57534E]">
                    Any additional spare parts or modifications require your explicit approval first.
                  </p>
                )}
              </div>
            </section>
          )}

          {service.important_notes && (
            <section className="rounded-lg border border-[#EAE3DC] bg-[#F4EFE9] px-5 py-4 text-xs leading-relaxed text-[#57534E]">
              <strong className="font-bold text-[#1C1917]">Important notes: </strong>
              <span>{service.important_notes}</span>
            </section>
          )}

          {/* How we do it (Horizontal Grid) */}
          <section id="process" className="scroll-mt-32 space-y-3.5">
            <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">How we do it</h2>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              {processSteps.map((step, i) => (
                <div key={i} className="rounded-lg border border-[#EAE3DC] bg-white p-3.5">
                  {step.image_url && resolveUploadedMediaUrl(step.image_url) && (
                    <div className="relative mb-2.5 aspect-[16/7] w-full overflow-hidden rounded-lg bg-[#FAF6F2]">
                      <ServiceImage src={step.image_url} alt={step.title} sizes="180px" />
                    </div>
                  )}
                  <span className="font-mono text-[11px] font-bold text-[#800020]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-0.5 text-xs font-bold text-[#1C1917]">{step.title}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#57534E]">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Spare-part rate card */}
          <section id="rate-card" className="scroll-mt-32 space-y-3">
            <div>
              <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">Spare-part rate card</h2>
              <p className="mt-1 text-xs text-[#57534E]">
                Fixed prices. Your technician cannot charge more than this — you approve every part in the app.
              </p>
            </div>

            {partBrands.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {partBrands.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setSelectedBrand(b)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                      selectedBrand === b ? "bg-[#1C1917] text-white" : "border border-[#EAE3DC] bg-white text-[#1C1917]"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}

            {filteredParts.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-[#EAE3DC] bg-white">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="border-b border-[#EAE3DC] bg-[#FAF6F2] text-[#57534E]">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Part / work</th>
                      <th className="px-4 py-2.5 font-semibold">Brand</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4EFE9]">
                    {filteredParts.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2.5 font-medium text-[#1C1917]">{row.part_name}</td>
                        <td className="px-4 py-2.5 text-[#57534E]">{row.brand || "All brands"}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-[#1C1917]">
                          {row.price_paise != null ? formatRupees(row.price_paise) : row.price_label || "Quoted"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-[#EAE3DC] bg-white p-4 text-xs text-[#57534E]">
                If any replacement part is required, your pro raises an itemized quote in the app for your approval before work proceeds.
              </p>
            )}
          </section>

          {/* Reviews */}
          <section id="reviews" className="scroll-mt-32 space-y-4">
            <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">Reviews</h2>

            <div className="rounded-lg border border-[#EAE3DC] bg-white p-5">
              <div className="grid items-center gap-6 sm:grid-cols-[120px_1fr]">
                <div>
                  <div className="font-serif text-4xl font-bold text-[#1C1917]">
                    {avgRating != null ? avgRating : "—"}
                  </div>
                  <div className="mt-1 flex items-center gap-0.5 text-[#C8A35B]">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star key={idx} size={13} className="fill-[#C8A35B] text-[#C8A35B]" />
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-[#57534E]">{totalReviews} reviews</p>
                </div>

                <div className="space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = reviewSummary.rating_breakdown?.[String(star)] ?? 0;
                    const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
                    return (
                      <div key={star} className="flex items-center gap-2.5 text-xs">
                        <span className="w-6 text-[#57534E]">{star}★</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-md bg-[#EFE9E2]">
                          <div className="h-full rounded-md bg-[#C8A35B]" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-[11px] text-[#57534E]">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {reviews.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {reviewAreas.map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setSelectedArea(area)}
                    className={`min-h-[34px] rounded-md px-3.5 text-xs font-semibold transition ${
                      selectedArea === area
                        ? "bg-[#1C1917] text-white"
                        : "border border-[#EAE3DC] bg-white text-[#1C1917]"
                    }`}
                  >
                    {area === "All" ? "All" : area}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setOnlyPhotoReviews((v) => !v)}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3.5 text-xs font-semibold transition ${
                    onlyPhotoReviews
                      ? "bg-[#800020] text-white"
                      : "border border-[#EAE3DC] bg-white text-[#1C1917]"
                  }`}
                >
                  <Camera size={13} strokeWidth={1.5} /> With photos
                </button>
              </div>
            )}

            {filteredReviews.length > 0 ? (
              <div className="space-y-3">
                {filteredReviews.map((rev) => (
                  <article key={rev.id} className="rounded-lg border border-[#EAE3DC] bg-white p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <strong className="text-[#1C1917]">{rev.customer_name}</strong>
                        <span className="inline-flex items-center gap-0.5 text-[#C8A35B]">
                          {Array.from({ length: rev.rating }).map((_, idx) => (
                            <Star key={idx} size={11} className="fill-[#C8A35B] text-[#C8A35B]" />
                          ))}
                        </span>
                      </div>
                      {rev.area && <span className="text-[11px] text-[#57534E]">{rev.area}</span>}
                    </div>
                    {rev.comment && <p className="text-xs leading-relaxed text-[#57534E]">{rev.comment}</p>}
                    {rev.photo_url && resolveUploadedMediaUrl(rev.photo_url) && (
                      <div className="relative h-28 w-40 overflow-hidden rounded-md">
                        <ServiceImage src={rev.photo_url} alt={`Review by ${rev.customer_name}`} sizes="160px" />
                      </div>
                    )}
                    {rev.technician_name && (
                      <p className="text-[11px] text-[#78716C]">
                        Serviced by {rev.technician_name} · Verified booking
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-[#EAE3DC] bg-white p-4 text-xs text-[#57534E]">
                Verified customer reviews will appear here after completed bookings.
              </p>
            )}
          </section>

          {/* FAQs */}
          {service.faqs && service.faqs.length > 0 && (
            <section id="faqs" className="scroll-mt-32 space-y-3">
              <h2 className="font-serif text-2xl font-semibold text-[#1C1917]">FAQs</h2>
              <div className="space-y-2">
                {service.faqs.map((f, i) => (
                  <details key={i} className="rounded-md border border-[#EAE3DC] bg-white px-4 py-3.5">
                    <summary className="cursor-pointer text-xs font-bold text-[#1C1917]">
                      {f.question}
                    </summary>
                    <p className="mt-2 text-xs leading-relaxed text-[#57534E]">{f.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Sticky Booking Summary Card */}
        <aside className="hidden lg:sticky lg:top-32 lg:block space-y-3">
          <div className="rounded-lg border border-[#EAE3DC] bg-white p-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-[#1C1917]">Your booking</h3>
              {cartItems.length > 0 && (
                <span className="rounded-md bg-[#F5E6EA] px-2 py-0.5 text-[10px] font-bold text-[#800020]">
                  {cartCount} {cartCount === 1 ? "item" : "items"}
                </span>
              )}
            </div>

            <div className="space-y-2 text-xs">
              {cartItems.length > 0 ? (
                cartItems.map((entry) => {
                  const lineUnit = getPackageUnitPaise(entry.service, entry.pkg);
                  return (
                    <div key={entry.pkg.id} className="flex items-center justify-between gap-2 text-[#1C1917]">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {entry.service.id === service.id
                            ? entry.pkg.name
                            : `${entry.service.name} · ${entry.pkg.name}`}
                        </p>
                        <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-[#E8E1DB] bg-[#FBF8F5] px-1.5 py-0.5 text-[11px]">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${entry.pkg.name} in summary`}
                            onClick={() => updateItemQuantity(entry.pkg.id, entry.quantity - 1)}
                            className="grid h-4 w-4 place-items-center text-[#57534E] hover:text-[#1C1917]"
                          >
                            <Minus size={11} strokeWidth={2} />
                          </button>
                          <span className="min-w-[1rem] text-center font-bold tabular-nums">{entry.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${entry.pkg.name} in summary`}
                            onClick={() => updateItemQuantity(entry.pkg.id, entry.quantity + 1)}
                            className="grid h-4 w-4 place-items-center text-[#57534E] hover:text-[#1C1917]"
                          >
                            <Plus size={11} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                      <strong className="shrink-0 tabular-nums">
                        {lineUnit != null ? formatRupees(lineUnit * entry.quantity) : "Quote"}
                      </strong>
                    </div>
                  );
                })
              ) : (
                <div className="flex justify-between gap-2 text-[#1C1917]">
                  <span>{activePkg?.name || service.name} × 1</span>
                  <strong className="tabular-nums">
                    {activeUnitPaise != null ? formatRupees(activeUnitPaise) : "Quote"}
                  </strong>
                </div>
              )}
              <div className="flex justify-between gap-2 text-[#57534E]">
                <span>Visit charge</span>
                <span>Included</span>
              </div>
            </div>

            <div className="flex items-baseline justify-between border-t border-[#EFE9E2] pt-3">
              <strong className="text-sm text-[#1C1917]">Total</strong>
              <strong className="font-serif text-lg text-[#1C1917]">
                {cartItems.length > 0
                  ? formatRupees(cartTotalPaise)
                  : activeUnitPaise != null
                    ? formatRupees(activeUnitPaise)
                    : formatStartingPrice(service)}
              </strong>
            </div>

            <div className="rounded-md bg-[#E7F2EC] px-3 py-2.5 text-[11px] leading-snug text-[#115E3C]">
              {cartItems.length > 1
                ? "All selected services will be booked together in a single visit."
                : "Slot-first booking with transparent pricing before confirmation."}
            </div>

            {cartItems.length > 0 ? (
              <button
                type="button"
                onClick={() => openSheet()}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
              >
                <span>Pick a slot</span>
                <ArrowRight size={15} strokeWidth={1.75} />
              </button>
            ) : activePkg ? (
              <button
                type="button"
                onClick={() => handleBookOrAdd(activePkg)}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
              >
                <span>Pick a slot</span>
                <ArrowRight size={15} strokeWidth={1.75} />
              </button>
            ) : (
              <Link
                href={`/book?service=${encodeURIComponent(service.slug)}`}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
              >
                <span>Pick a slot</span>
                <ArrowRight size={15} strokeWidth={1.75} />
              </Link>
            )}

            <p className="text-center text-[10px] text-[#78716C]">
              Free reschedule · cancel up to 2 hrs before
            </p>
          </div>

          <div className="rounded-lg bg-[#F6E9EE] p-4">
            <strong className="block text-xs font-bold text-[#800020]">Not sure which package?</strong>
            <p className="mt-1 text-[11px] leading-relaxed text-[#5B444B]">
              Pick an inspection package or share details in your booking notes — exact prices are confirmed before work starts.
            </p>
          </div>
        </aside>
      </div>

      {/* Related Sub-Services */}
      {relatedServices.length > 0 && (
        <section className="container border-t border-[#E8E1DB] py-10">
          <h2 className="mb-4 font-serif text-2xl font-semibold text-[#1C1917]">More {category.name} services</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedServices.map((rel) => (
              <Link
                key={rel.id}
                href={`/services/${encodeURIComponent(category.slug)}/${encodeURIComponent(rel.slug)}`}
                className="rounded-lg border border-[#EAE3DC] bg-white p-4 no-underline text-inherit transition hover:border-[#800020]/40"
              >
                <strong className="block font-serif text-base font-bold text-[#1C1917]">{rel.name}</strong>
                <span className="mt-1 block line-clamp-2 text-xs text-[#57534E]">{rel.summary}</span>
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
            <p className="text-[11px] text-[#57534E]">{mobileSubtitle}</p>
          </div>
          {cartItems.length > 0 ? (
            <button
              type="button"
              onClick={() => openSheet()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm"
            >
              <span>Pick a slot</span>
              <ArrowRight size={15} strokeWidth={1.5} />
            </button>
          ) : activePkg ? (
            <button
              type="button"
              onClick={() => handleBookOrAdd(activePkg)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm"
            >
              <span>Pick a slot</span>
              <ArrowRight size={15} strokeWidth={1.5} />
            </button>
          ) : (
            <Link
              href={`/book?service=${encodeURIComponent(service.slug)}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm"
            >
              <span>Continue</span>
              <ArrowRight size={15} strokeWidth={1.5} />
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
