"use client";

import type { Service } from "@nammapros/types";
import { ArrowUpRight, Clock, Eye, Minus, Plus, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { getPackageUnitPaise, pickDefaultPackage, useBookingCart } from "@/components/booking-cart-provider";
import { ServiceImage } from "@/components/service-image";
import { serviceListImage } from "@/lib/service-images";
import { formatInr, formatStartingPrice } from "@/lib/services";
import { ServiceDetailModal } from "./service-detail-modal";

export function ServiceCard({
  service,
  onQuickView,
}: {
  service: Service;
  onQuickView?: (service: Service) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const { items, addToCart, updateItemQuantity } = useBookingCart();
  const imgSrc = serviceListImage(service);
  const detailHref = `/services/${encodeURIComponent(service.category)}/${encodeURIComponent(service.slug)}`;
  const defaultPkg = pickDefaultPackage(service);
  const inCart = defaultPkg ? items.find((entry) => entry.pkg.id === defaultPkg.id) : undefined;
  const unitPaise = getPackageUnitPaise(service, defaultPkg);
  const originalPaise = defaultPkg?.original_price_paise ?? null;
  const showStrike = Boolean(originalPaise && unitPaise != null && originalPaise > unitPaise);

  const openQuickView = () => {
    if (onQuickView) {
      onQuickView(service);
      return;
    }
    setShowModal(true);
  };

  return (
    <>
      <article className="service-card group flex min-w-0 flex-col justify-between overflow-hidden rounded-lg">
        <div>
          <Link
            href={detailHref}
            className="relative mb-3.5 block aspect-[16/7] w-full overflow-hidden rounded-md bg-[#F4EFE9]"
          >
            {imgSrc ? (
              <ServiceImage src={imgSrc} alt={service.name} fit="contain" />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#F5E6EA] to-[#EFE9E2] text-[#800020]/65"
              >
                <Sparkles size={24} strokeWidth={1.5} />
                <span className="px-3 text-center text-[11px] font-semibold text-[#57534E]">
                  {service.category_name || "NammaPros Verified"}
                </span>
              </div>
            )}
          </Link>

          <div className="service-card-body">
            <div className="flex items-start justify-between gap-2">
              <Link href={detailHref} className="transition hover:text-[#800020]">
                <h3>{service.name}</h3>
              </Link>
              {service.rating_avg != null && (service.review_count ?? 0) > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#FBF8F5] px-2 py-0.5 text-[11px] font-bold text-[#1C1917]">
                  <Star size={11} strokeWidth={1.5} className="fill-[#C8A35B] text-[#C8A35B]" />
                  {service.rating_avg}
                </span>
              )}
            </div>

            {defaultPkg?.duration_minutes && (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#78716C]">
                <Clock size={11} strokeWidth={1.75} className="text-[#800020]" />
                <span>{defaultPkg.duration_minutes} mins</span>
              </p>
            )}

            <p className="mt-1 line-clamp-2">{service.summary}</p>

            <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
              <span className="price-note font-bold text-[#800020]">
                {unitPaise != null ? formatInr(unitPaise) : formatStartingPrice(service)}
              </span>
              {showStrike && originalPaise != null && (
                <span className="text-[11px] text-[#78716C] line-through">{formatInr(originalPaise)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-[#F4EFE9] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={openQuickView}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-[#57534E] transition hover:bg-[#FAF6F2] hover:text-[#800020]"
            >
              <Eye size={14} strokeWidth={1.5} /> Quick view
            </button>
            <Link
              href={`/book?service=${encodeURIComponent(service.slug)}`}
              className="service-card-action inline-flex min-h-[36px] items-center gap-0.5 px-1.5 text-xs font-bold"
              aria-label={`Start booking ${service.name}`}
            >
              Book <ArrowUpRight size={13} strokeWidth={1.5} />
            </Link>
          </div>

          {defaultPkg &&
            (inCart ? (
              <div className="flex min-h-[42px] w-full items-center justify-between rounded-md border border-[#800020] bg-[#f5ebe8] px-2 text-xs font-bold text-[#800020]">
                <button
                  type="button"
                  aria-label={`Remove one ${service.name}`}
                  onClick={() => updateItemQuantity(defaultPkg.id, inCart.quantity - 1)}
                  className="grid h-10 w-9 place-items-center"
                >
                  <Minus size={13} strokeWidth={2} />
                </button>
                <span className="min-w-[20px] text-center">{inCart.quantity} in cart</span>
                <button
                  type="button"
                  aria-label={`Add one more ${service.name}`}
                  onClick={() => updateItemQuantity(defaultPkg.id, inCart.quantity + 1)}
                  className="grid h-10 w-9 place-items-center"
                >
                  <Plus size={13} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => addToCart(service, defaultPkg, 1, "", false)}
                className="flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-md bg-[#f5ebe8] px-3 text-xs font-bold text-[#800020] transition hover:bg-[#800020] hover:text-white"
              >
                <Plus size={13} strokeWidth={1.75} /> Add to cart
              </button>
            ))}
        </div>
      </article>

      {showModal && !onQuickView && (
        <ServiceDetailModal
          service={service}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
