"use client";

import type { HomepageBannerItem } from "@nammapros/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
    <section className="container py-8">
      <div className="overflow-hidden rounded-lg bg-[#27201C] text-white shadow-[0_14px_38px_rgba(28,25,23,0.12)]">
        <div className={`grid items-stretch ${imgUrl ? "md:grid-cols-2" : ""}`}>
          <div className="flex flex-col justify-center space-y-3 p-7 sm:p-10">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#D8B46A]">
              Featured service
            </span>
            <h2 className="font-serif text-2xl font-semibold text-white sm:text-3xl">{active.title}</h2>
            {active.subtitle && <p className="text-sm text-[#D6CEC6]">{active.subtitle}</p>}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {active.target_url && (
                <Link
                  href={active.target_url}
                  className="inline-flex min-h-[44px] items-center rounded-md bg-white px-6 text-xs font-bold text-[#1C1917] transition hover:bg-[#FAF6F2]"
                >
                  <span>Book now</span>
                </Link>
              )}
              {banners.length > 1 && (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Previous offer"
                    onClick={() => setIndex((i) => (i - 1 + banners.length) % banners.length)}
                    className="grid h-9 w-9 place-items-center rounded-md bg-white/10 text-white hover:bg-white/20"
                  >
                    <ChevronLeft size={16} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next offer"
                    onClick={() => setIndex((i) => (i + 1) % banners.length)}
                    className="grid h-9 w-9 place-items-center rounded-md bg-white/10 text-white hover:bg-white/20"
                  >
                    <ChevronRight size={16} strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {imgUrl && (
            <div className="relative aspect-[16/7] w-full overflow-hidden bg-[#1C1614]">
              <ServiceImage src={imgUrl} alt={active.title} fit="contain" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
