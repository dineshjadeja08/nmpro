"use client";

import type { HomepageBannerItem } from "@nammapros/types";
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { ServiceImage } from "@/components/service-image";
import { resolveUploadedMediaUrl } from "@/lib/service-images";

export function OfferSpotlight({ banners }: { banners: HomepageBannerItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % banners.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  if (!banners || banners.length === 0) return null;

  const active = banners[index % banners.length];
  const imgUrl = resolveUploadedMediaUrl(active.desktop_image_url || active.mobile_image_url);

  return (
    <section className="container py-6">
      <div className="relative overflow-hidden rounded-[20px] bg-white p-6 shadow-[0_12px_36px_rgba(28,25,23,0.06)] sm:p-8">
        <div className="grid items-center gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5ebe8] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#800020]">
              <Sparkles size={13} strokeWidth={1.5} /> Seasonal highlight
            </span>
            <h2 className="font-serif text-2xl font-bold text-[#1C1917] sm:text-3xl">{active.title}</h2>
            {active.subtitle && <p className="text-sm text-[#57534E]">{active.subtitle}</p>}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {active.target_url && (
                <Link
                  href={active.target_url}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#800020] px-6 text-sm font-bold text-white transition hover:bg-[#5e0017]"
                >
                  <span>Explore offer</span>
                  <ArrowRight size={16} strokeWidth={1.5} />
                </Link>
              )}
              {banners.length > 1 && (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Previous offer"
                    onClick={() => setIndex((i) => (i - 1 + banners.length) % banners.length)}
                    className="grid h-10 w-10 place-items-center rounded-full bg-[#F4EFE9] text-[#1C1917] hover:bg-[#e7ded4]"
                  >
                    <ChevronLeft size={16} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next offer"
                    onClick={() => setIndex((i) => (i + 1) % banners.length)}
                    className="grid h-10 w-10 place-items-center rounded-full bg-[#F4EFE9] text-[#1C1917] hover:bg-[#e7ded4]"
                  >
                    <ChevronRight size={16} strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {imgUrl && (
            <div className="group relative aspect-[16/9] w-full overflow-hidden rounded-[16px] bg-[#F4EFE9]">
              <ServiceImage src={imgUrl} alt={active.title} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
