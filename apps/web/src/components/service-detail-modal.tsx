"use client";

import type { Service } from "@nammapros/types";
import { ArrowRight, Check, Clock, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { useBookingCart } from "@/components/booking-cart-provider";
import { ServiceImage } from "@/components/service-image";
import { servicePopupCoverImage } from "@/lib/service-images";

export type ServiceModalProps = {
  service: Service;
  onClose: () => void;
};

export function ServiceDetailModal({ service, onClose }: ServiceModalProps) {
  const [selectedPkgIndex, setSelectedPkgIndex] = useState(0);
  const { addToCart } = useBookingCart();
  const pkg = service.packages?.[selectedPkgIndex] || service.packages?.[0];

  const popupCover = servicePopupCoverImage(service);

  const priceText = service.starting_price_paise
    ? `₹${(service.starting_price_paise / 100).toLocaleString("en-IN")}`
    : "Price shared before confirmation";

  const inclusions =
    (service.inclusions && service.inclusions.length > 0 ? service.inclusions : pkg?.inclusions) ?? [];
  const exclusions =
    (service.exclusions && service.exclusions.length > 0 ? service.exclusions : pkg?.exclusions) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-[20px] bg-[#FBF8F5] shadow-2xl sm:rounded-[20px] animate-[slideUpSheet_.22s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-[#1C1917] shadow-md hover:bg-white"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        {popupCover ? (
          <div className="relative h-56 w-full overflow-hidden bg-[#1C1917] sm:h-64">
            <ServiceImage src={popupCover} alt={service.name} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5 text-white">
              <span className="inline-block rounded-full bg-[#800020] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                NammaPros Verified
              </span>
              <h2 className="mt-1 font-serif text-2xl font-bold text-white">{service.name}</h2>
              {service.summary && <p className="mt-0.5 text-xs text-white/85 line-clamp-1">{service.summary}</p>}
            </div>
          </div>
        ) : (
          <div className="border-b border-[#E8E1DB] bg-[#800020] px-6 py-6 pr-14 text-white">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
              NammaPros Verified
            </span>
            <h2 className="mt-2 font-serif text-2xl font-bold text-white">{service.name}</h2>
            {service.summary && <p className="mt-1 text-xs text-white/85">{service.summary}</p>}
          </div>
        )}

        <div className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-xs">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#57534E]">
                {service.price_note || "Transparent Starting Rate"}
              </span>
              <p className="text-xl font-bold text-[#800020]">{priceText}</p>
            </div>
            {pkg && (
              <div className="flex items-center gap-2 text-xs font-semibold text-[#57534E]">
                <Clock size={15} strokeWidth={1.5} className="text-[#800020]" />
                <span>About {pkg.duration_minutes} mins</span>
              </div>
            )}
          </div>

          {service.description && (
            <div
              className="prose prose-sm max-w-none text-sm leading-relaxed text-[#57534E]"
              dangerouslySetInnerHTML={{ __html: service.description }}
            />
          )}

          {service.packages && service.packages.length > 1 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#57534E]">
                Choose an option
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {service.packages.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPkgIndex(idx)}
                    className={`min-h-[48px] rounded-2xl border p-3 text-left transition ${
                      selectedPkgIndex === idx
                        ? "border-[#800020] bg-[#f5ebe8] font-bold text-[#800020]"
                        : "border-[#E8E1DB] bg-white text-[#1C1917] hover:border-[#800020]/50"
                    }`}
                  >
                    <p className="text-xs font-bold">{p.name}</p>
                    <span className="text-[11px] text-[#57534E]">{p.duration_minutes} min</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(inclusions.length > 0 || exclusions.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {inclusions.length > 0 && (
                <div className="rounded-2xl bg-white p-4">
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
                    <ShieldCheck size={15} strokeWidth={1.5} className="text-emerald-700" /> What&apos;s Included
                  </h4>
                  <ul className="space-y-1.5 text-xs text-[#57534E]">
                    {inclusions.map((inc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-emerald-700" />
                        <span>{inc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {exclusions.length > 0 && (
                <div className="rounded-2xl bg-[#F4EFE9] p-4">
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#57534E]">
                    Not Included
                  </h4>
                  <ul className="space-y-1.5 text-xs text-[#57534E]">
                    {exclusions.map((exc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <X size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#57534E]" />
                        <span>{exc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-[#E8E1DB] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-full border border-[#D6CEC6] bg-white px-5 text-xs font-bold text-[#57534E]"
            >
              Back
            </button>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/services/${encodeURIComponent(service.category)}/${encodeURIComponent(service.slug)}`}
                onClick={onClose}
                className="inline-flex min-h-[48px] items-center rounded-full border border-[#800020] bg-white px-5 text-xs font-bold text-[#800020] hover:bg-[#f5ebe8]"
              >
                Full Details
              </Link>
              {pkg ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    addToCart(service, pkg, 1);
                  }}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#800020] px-7 text-sm font-bold text-white shadow-md hover:bg-[#5e0017]"
                >
                  <span>Add &amp; pick slot</span>
                  <ArrowRight size={16} strokeWidth={1.5} />
                </button>
              ) : (
                <Link
                  href={`/book?service=${encodeURIComponent(service.slug)}`}
                  onClick={onClose}
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#800020] px-7 text-sm font-bold text-white shadow-md hover:bg-[#5e0017]"
                >
                  <span>Proceed to Booking</span>
                  <ArrowRight size={16} strokeWidth={1.5} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
