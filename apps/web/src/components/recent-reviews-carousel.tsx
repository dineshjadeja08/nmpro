"use client";

import type { PublicReview } from "@nammapros/types";
import { Star } from "lucide-react";
import { useEffect, useRef } from "react";
import { ServiceImage } from "@/components/service-image";
import { resolveUploadedMediaUrl } from "@/lib/service-images";

const GAP_PX = 16;
const SPEED_PX_PER_MS = 0.05;

function ReviewCard({ review }: { review: PublicReview }) {
  const initial = (review.customer_name?.trim()[0] || "N").toUpperCase();
  return (
    <li className="w-[280px] shrink-0 sm:w-[320px]">
      <article className="flex h-full flex-col justify-between rounded-lg border border-[#EAE3DC] bg-white p-5 shadow-[0_4px_16px_rgba(28,25,23,0.03)]">
        <div>
          <div className="flex items-center gap-0.5 text-[#C8A35B]" aria-label={`${review.rating} out of 5 stars`}>
            {Array.from({ length: review.rating }).map((_, idx) => (
              <Star key={idx} size={13} className="fill-[#C8A35B] text-[#C8A35B]" />
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#1C1917]">
            “{review.comment || "Smooth visit, clear communication, and tidy finish."}”
          </p>
          {review.photo_url && resolveUploadedMediaUrl(review.photo_url) && (
            <div className="relative mt-3 aspect-[16/7] w-full overflow-hidden rounded-md bg-slate-50">
              <ServiceImage src={review.photo_url} alt={`Work done for ${review.customer_name}`} fit="contain" />
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2.5 border-t border-[#F4EFE9] pt-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#F5E6EA] text-xs font-bold text-[#800020]">
            {initial}
          </span>
          <div className="min-w-0 text-[11px]">
            <strong className="block truncate text-[#1C1917]">{review.customer_name}</strong>
            <span className="block truncate text-[#57534E]">
              {[review.service_name, review.area].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
      </article>
    </li>
  );
}

export function RecentReviewsCarousel({ reviews }: { reviews: PublicReview[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const firstGroupRef = useRef<HTMLUListElement>(null);
  const pausedRef = useRef(false);
  const repeatCount = reviews.length < 2 ? 1 : reviews.length < 4 ? 4 : 2;

  useEffect(() => {
    const scroller = scrollerRef.current;
    const firstGroup = firstGroupRef.current;
    if (!scroller || !firstGroup || reviews.length < 2) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previousTime = 0;
    const advance = (time: number) => {
      if (previousTime && !pausedRef.current && !reducedMotion.matches && !document.hidden) {
        const loopWidth = firstGroup.offsetWidth + GAP_PX;
        if (loopWidth > 0) {
          const distance = Math.min(time - previousTime, 64) * SPEED_PX_PER_MS;
          scroller.scrollLeft = (scroller.scrollLeft + distance) % loopWidth;
        }
      }
      previousTime = time;
      frame = window.requestAnimationFrame(advance);
    };
    frame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frame);
  }, [reviews.length]);

  if (reviews.length === 0) return null;

  return (
    <section className="container py-8 sm:py-12" aria-labelledby="recent-reviews-heading">
      <h2 id="recent-reviews-heading" className="mb-5 font-serif text-2xl font-semibold text-[#1C1917] sm:text-3xl">
        From homes near you
      </h2>
      <div
        ref={scrollerRef}
        role="region"
        aria-label="Recent customer reviews. Scroll horizontally to read more."
        tabIndex={0}
        onPointerEnter={() => { pausedRef.current = true; }}
        onPointerLeave={() => { pausedRef.current = false; }}
        onFocus={() => { pausedRef.current = true; }}
        onBlur={() => { pausedRef.current = false; }}
        className="overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline-2 focus-visible:outline-[#800020] [scrollbar-width:thin]"
      >
        <div className="flex w-max gap-4">
          {Array.from({ length: repeatCount }).map((_, groupIndex) => (
            <ul
              key={groupIndex}
              ref={groupIndex === 0 ? firstGroupRef : undefined}
              aria-hidden={groupIndex === 0 ? undefined : "true"}
              className="flex shrink-0 items-stretch gap-4"
            >
              {reviews.map((review) => <ReviewCard key={review.id} review={review} />)}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
