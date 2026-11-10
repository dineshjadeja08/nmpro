"use client";

import React, { useState } from "react";
import type { Service } from "@nammapros/types";
import { X, Check, Clock, ShieldCheck, ArrowRight } from "lucide-react";
import { ServiceImage } from "@/components/service-image";
import { servicePopupCoverImage } from "@/lib/service-images";

export type ServiceModalProps = {
  service: Service;
  onClose: () => void;
};

export function ServiceDetailModal({ service, onClose }: ServiceModalProps) {
  const [selectedPkgIndex, setSelectedPkgIndex] = useState(0);
  const pkg = service.packages?.[selectedPkgIndex] || service.packages?.[0];

  const popupCover = servicePopupCoverImage(service);

  const priceText = service.starting_price_paise
    ? `₹${(service.starting_price_paise / 100).toLocaleString("en-IN")}`
    : "Inspection charges apply";

  const inclusions =
    (service.inclusions && service.inclusions.length > 0 ? service.inclusions : pkg?.inclusions) ?? [];
  const exclusions =
    (service.exclusions && service.exclusions.length > 0 ? service.exclusions : pkg?.exclusions) ?? [];

  return (
    <div className="ui-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-slate-700 shadow-md hover:bg-white"
        >
          <X className="h-5 w-5" />
        </button>

        {popupCover ? (
          <div className="relative h-56 w-full overflow-hidden bg-slate-900 sm:h-64">
            <ServiceImage src={popupCover} alt={service.name} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5 text-white">
              <span className="inline-block rounded-full bg-[#800020] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white">
                NammaPros Certified
              </span>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">{service.name}</h2>
              {service.summary && <p className="mt-0.5 text-xs text-slate-200 line-clamp-1">{service.summary}</p>}
            </div>
          </div>
        ) : (
          <div className="border-b border-slate-100 bg-[#800020] px-6 py-6 text-white pr-14">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white">
              NammaPros Certified
            </span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{service.name}</h2>
            {service.summary && <p className="mt-1 text-xs text-white/85">{service.summary}</p>}
          </div>
        )}

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {service.price_note || "Starting Rate / Inspection"}
              </span>
              <p className="text-2xl font-black text-[#800020]">{priceText}</p>
            </div>
            {pkg && (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Clock className="h-4 w-4 text-[#800020]" />
                <span>Estimated Duration: {pkg.duration_minutes} mins</span>
              </div>
            )}
          </div>

          {service.description && (
            <div
              className="prose prose-sm max-w-none text-sm text-slate-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: service.description }}
            />
          )}

          {service.packages && service.packages.length > 1 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                Available Service Packages
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {service.packages.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPkgIndex(idx)}
                    className={`rounded-xl border p-3 text-left transition ${
                      selectedPkgIndex === idx
                        ? "border-[#800020] bg-[#f6e7eb] font-bold text-[#800020]"
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                    }`}
                  >
                    <p className="text-xs font-bold">{p.name}</p>
                    <span className="text-[11px] text-slate-500">{p.pricing_model.replace("_", " ")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(inclusions.length > 0 || exclusions.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {inclusions.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5 mb-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> What&apos;s Included
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700">
                    {inclusions.map((inc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{inc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {exclusions.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                    What&apos;s Excluded
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {exclusions.map((exc, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-slate-400 font-bold shrink-0">✕</span>
                        <span>{exc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100">
            <button
              onClick={onClose}
              className="rounded-full border border-slate-300 px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/services/${encodeURIComponent(service.category)}/${encodeURIComponent(service.slug)}`}
                className="rounded-full border border-[#800020] px-5 py-2.5 text-xs font-bold text-[#800020] hover:bg-[#f6e7eb] transition"
              >
                Full Details
              </a>
              <a
                href={`/book?service=${encodeURIComponent(service.slug)}${
                  pkg ? `&package=${encodeURIComponent(pkg.id)}` : ""
                }`}
                className="button button-primary inline-flex items-center justify-center gap-2 rounded-full px-7 py-2.5 text-sm font-bold text-white shadow-md transition"
              >
                <span>Proceed to Booking</span>
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
