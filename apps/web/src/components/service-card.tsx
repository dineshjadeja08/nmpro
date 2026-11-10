"use client";

import type { Service } from "@nammapros/types";
import { ArrowUpRight, Eye, Plus, Star } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { pickDefaultPackage, useBookingCart } from "@/components/booking-cart-provider";
import { ServiceImage } from "@/components/service-image";
import { serviceListImage } from "@/lib/service-images";
import { formatStartingPrice } from "@/lib/services";
import { ServiceDetailModal } from "./service-detail-modal";

export function ServiceCard({ service }: { service: Service }) {
  const [showModal, setShowModal] = useState(false);
  const { addToCart } = useBookingCart();
  const imgSrc = serviceListImage(service);
  const detailHref = `/services/${encodeURIComponent(service.category)}/${encodeURIComponent(service.slug)}`;
  const defaultPkg = pickDefaultPackage(service);

  return (
    <>
      <article className="service-card group flex flex-col justify-between">
        <div>
          {imgSrc && (
            <Link
              href={detailHref}
              className="relative mb-3.5 block aspect-[4/3] w-full overflow-hidden rounded-[16px] bg-[#F4EFE9]"
            >
              <ServiceImage src={imgSrc} alt={service.name} />
            </Link>
          )}
          <div className="service-card-body">
            <div className="flex items-start justify-between gap-2">
              <Link href={detailHref} className="transition hover:text-[#800020]">
                <h3>{service.name}</h3>
              </Link>
              {service.rating_avg != null && (service.review_count ?? 0) > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FBF8F5] px-2 py-0.5 text-[11px] font-bold text-[#1C1917]">
                  <Star size={11} strokeWidth={1.5} className="fill-[#C8A35B] text-[#C8A35B]" />
                  {service.rating_avg}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2">{service.summary}</p>
            <span className="price-note">{formatStartingPrice(service)}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#F4EFE9] pt-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-[#57534E] transition hover:text-[#800020]"
            >
              <Eye size={14} strokeWidth={1.5} /> Quick view
            </button>
            <Link
              href={`/book?service=${encodeURIComponent(service.slug)}`}
              className="service-card-action text-xs font-bold"
              aria-label={`Start booking ${service.name}`}
            >
              Book <ArrowUpRight size={14} strokeWidth={1.5} />
            </Link>
          </div>
          {defaultPkg && (
            <button
              type="button"
              onClick={() => addToCart(service, defaultPkg, 1)}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-full bg-[#f5ebe8] px-3.5 text-xs font-bold text-[#800020] transition hover:bg-[#800020] hover:text-white"
            >
              <Plus size={13} strokeWidth={1.75} /> Add
            </button>
          )}
        </div>
      </article>

      {showModal && (
        <ServiceDetailModal
          service={service}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
