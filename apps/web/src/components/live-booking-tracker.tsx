"use client";

import { AlertCircle, CheckCircle2, Phone, Star, UserRound, Wrench } from "lucide-react";
import React from "react";
import { ServiceImage } from "@/components/service-image";
import { resolveUploadedMediaUrl } from "@/lib/service-images";

const STEPS = [
  { key: "CONFIRMED", label: "Booked", desc: "Slot confirmed" },
  { key: "TECHNICIAN_ASSIGNED", label: "Pro assigned", desc: "Verified pro matched" },
  { key: "TECHNICIAN_EN_ROUTE", label: "On the way", desc: "Heading to your home" },
  { key: "IN_PROGRESS", label: "In progress", desc: "Work underway" },
  { key: "COMPLETED", label: "Done", desc: "Completed & warranted" },
];

function getActiveStepIndex(status: string) {
  switch (status) {
    case "PENDING_PAYMENT":
    case "AWAITING_PAYMENT":
      return -1;
    case "CONFIRMED_UNPAID":
    case "CONFIRMED":
      return 0;
    case "TECHNICIAN_ASSIGNED":
      return 1;
    case "TECHNICIAN_EN_ROUTE":
    case "TECHNICIAN_ARRIVED":
      return 2;
    case "IN_PROGRESS":
      return 3;
    case "COMPLETED":
    case "CLOSED":
      return 4;
    default:
      return 0;
  }
}

export function LiveBookingTracker({
  status,
  technician,
  startOtpCode,
  onCallTechnician,
}: {
  status: string;
  technician?: {
    name: string;
    phone?: string;
    rating?: number | null;
    completed_jobs?: number;
    photo_url?: string | null;
  } | null;
  startOtpCode?: string;
  onCallTechnician?: () => void;
}) {
  const isCancelled = status === "CANCELLED";
  const activeIndex = getActiveStepIndex(status);
  const photoSrc = technician?.photo_url ? resolveUploadedMediaUrl(technician.photo_url) : null;

  if (isCancelled) {
    return (
      <div className="rounded-[20px] border border-rose-200 bg-rose-50/80 p-5 text-rose-950">
        <div className="flex items-center gap-2">
          <AlertCircle size={18} strokeWidth={1.5} className="text-rose-700" />
          <h3 className="font-serif text-lg font-bold">This booking was cancelled.</h3>
        </div>
        <p className="mt-1 text-xs text-rose-800">
          Any advance payment made will be processed automatically under our refund policy.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-[20px] bg-white p-6 shadow-[0_10px_30px_rgba(28,25,23,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#800020]">
            LIVE TRACKER
          </span>
          <h2 className="font-serif text-xl font-bold text-[#1C1917]">Visit progress</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-600" />
          <span>Updates active</span>
        </span>
      </div>

      {/* 5-step Timeline */}
      <div className="relative pt-1">
        <div className="hidden sm:block absolute top-5 left-7 right-7 h-0.5 bg-[#E8E1DB]" />
        <div
          className="hidden sm:block absolute top-5 left-7 h-0.5 bg-[#800020] transition-all duration-300"
          style={{
            width: `${Math.max(0, Math.min(100, (Math.max(0, activeIndex) / (STEPS.length - 1)) * 100))}%`,
          }}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5 sm:gap-2">
          {STEPS.map((step, idx) => {
            const isDone = idx <= activeIndex;
            const isCurrent = idx === activeIndex;

            return (
              <div
                key={step.key}
                className="relative flex items-start gap-3 sm:flex-col sm:items-center sm:text-center"
              >
                <div
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold transition ${
                    isCurrent
                      ? "bg-[#800020] text-white ring-4 ring-[#f5ebe8]"
                      : isDone
                        ? "bg-emerald-700 text-white"
                        : "bg-[#F4EFE9] text-[#57534E]"
                  }`}
                >
                  {isDone && !isCurrent ? (
                    <CheckCircle2 size={16} strokeWidth={1.75} />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <div className="mt-0.5">
                  <p className={`text-xs font-bold ${isCurrent ? "text-[#800020]" : isDone ? "text-[#1C1917]" : "text-[#57534E]"}`}>
                    {step.label}
                  </p>
                  <p className="hidden text-[11px] text-[#57534E] sm:block">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assigned Technician Card + Start OTP */}
      <div className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
        {technician ? (
          <div className="flex flex-col justify-between gap-4 rounded-2xl bg-[#FBF8F5] p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3.5">
              {photoSrc ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full">
                  <ServiceImage src={photoSrc} alt={technician.name} zoomOnHover={false} sizes="56px" />
                </div>
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#f5ebe8] text-[#800020]">
                  <UserRound size={22} strokeWidth={1.5} />
                </div>
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-serif text-base font-bold text-[#1C1917]">{technician.name}</span>
                  {technician.rating != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#C8A35B]/20 px-2 py-0.5 text-[11px] font-bold text-[#8a6823]">
                      <Star size={11} strokeWidth={1.5} className="fill-[#C8A35B] text-[#C8A35B]" />
                      {technician.rating}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#57534E]">
                  Verified NammaPros pro
                  {typeof technician.completed_jobs === "number" && technician.completed_jobs > 0
                    ? ` · ${technician.completed_jobs} jobs done`
                    : ""}
                </p>
              </div>
            </div>

            {technician.phone && (
              <a
                href={`tel:${technician.phone}`}
                onClick={onCallTechnician}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#800020] px-5 text-xs font-bold text-white shadow-sm hover:bg-[#5e0017]"
              >
                <Phone size={14} strokeWidth={1.5} /> Call pro
              </a>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-[#FBF8F5] p-4">
            <Wrench size={18} strokeWidth={1.5} className="shrink-0 text-[#800020]" />
            <p className="text-xs text-[#57534E]">
              A verified technician will appear here once assigned ahead of your visit slot.
            </p>
          </div>
        )}

        {startOtpCode && (
          <div className="flex flex-col justify-center rounded-2xl border border-[#800020]/20 bg-[#f5ebe8] p-4 text-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#800020]">
              Arrival Start OTP
            </span>
            <strong className="mt-1 font-mono text-3xl font-bold tracking-[0.28em] text-[#800020]">
              {startOtpCode}
            </strong>
            <span className="mt-1 text-[11px] text-[#57534E]">Share when your pro arrives</span>
          </div>
        )}
      </div>
    </div>
  );
}
