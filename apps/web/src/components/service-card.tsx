"use client";

import React, { useState } from "react";
import type { Service } from "@nammapros/types";
import { ArrowUpRight, Eye } from "lucide-react";
import Link from "next/link";
import { formatStartingPrice } from "@/lib/services";
import { serviceListImage } from "@/lib/service-images";
import { ServiceImage } from "@/components/service-image";
import { ServiceDetailModal } from "./service-detail-modal";

export function ServiceCard({ service }: { service: Service }) {
  const [showModal, setShowModal] = useState(false);
  const imgSrc = serviceListImage(service);
  const detailHref = `/services/${encodeURIComponent(service.category)}/${encodeURIComponent(service.slug)}`;

  return (
    <>
      <article className="service-card group flex flex-col justify-between">
        <div>
          {imgSrc && (
            <Link
              href={detailHref}
              className="block relative mb-3 h-36 w-full overflow-hidden rounded-[10px]"
            >
              <ServiceImage src={imgSrc} alt={service.name} />
            </Link>
          )}
          <div className="service-card-body">
            <Link href={detailHref} className="hover:text-[#800020] transition">
              <h3>{service.name}</h3>
            </Link>
            <p>{service.summary}</p>
            <span className="price-note">{formatStartingPrice(service)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#800020] underline transition"
            >
              <Eye className="h-3.5 w-3.5" /> Quick View
            </button>
            <Link
              href={detailHref}
              className="text-xs font-bold text-slate-700 hover:text-[#800020] transition"
            >
              Details
            </Link>
          </div>
          <Link
            href={`/book?service=${encodeURIComponent(service.slug)}`}
            className="service-card-action"
            aria-label={`Start booking ${service.name}`}
          >
            Book <ArrowUpRight size={17} />
          </Link>
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
