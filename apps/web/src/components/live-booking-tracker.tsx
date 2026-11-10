"use client";

import React from "react";
import { CheckCircle2, Clock, Wrench, Shield, Phone, MapPin, Download, AlertCircle } from "lucide-react";

export type BookingStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED_UNPAID"
  | "CONFIRMED"
  | "TECHNICIAN_ASSIGNED"
  | "TECHNICIAN_EN_ROUTE"
  | "TECHNICIAN_ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED";

const STEPS = [
  { key: "CONFIRMED", label: "Booking Placed", desc: "Order confirmed & slots locked" },
  { key: "TECHNICIAN_ASSIGNED", label: "Pro Assigned", desc: "Technician verified & allocated" },
  { key: "TECHNICIAN_EN_ROUTE", label: "On The Way", desc: "Technician en route to location" },
  { key: "IN_PROGRESS", label: "Service In Progress", desc: "Inspection & repair underway" },
  { key: "COMPLETED", label: "Completed", desc: "Service delivered & approved" },
];

function getActiveStepIndex(status: string) {
  switch (status) {
    case "PENDING_PAYMENT":
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
  onCallTechnician,
}: {
  status: string;
  technician?: {
    name: string;
    phone?: string;
    rating?: number;
    completed_jobs?: number;
    photo_url?: string;
  } | null;
  onCallTechnician?: () => void;
}) {
  const isCancelled = status === "CANCELLED";
  const activeIndex = getActiveStepIndex(status);

  if (isCancelled) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5 text-red-900">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <h3 className="font-bold">This booking was cancelled.</h3>
        </div>
        <p className="mt-1 text-xs text-red-700">
          Any advance payments made will be processed according to our cancellation and refund policy.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-black uppercase tracking-wider text-[#800020]">
            Live Service Tracker
          </span>
          <h2 className="text-xl font-bold text-slate-900">Job Status Journey</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live Tracking Active</span>
        </span>
      </div>

      {/* Stepper Progress Bar */}
      <div className="relative mt-4">
        <div className="hidden sm:block absolute top-4 left-6 right-6 h-0.5 bg-slate-100" />
        <div
          className="hidden sm:block absolute top-4 left-6 h-0.5 bg-[#800020] transition-all duration-500"
          style={{
            width: `${Math.max(0, Math.min(100, (activeIndex / (STEPS.length - 1)) * 100))}%`,
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
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all ${
                    isCurrent
                      ? "bg-[#800020] text-white ring-4 ring-[#f6e7eb]"
                      : isDone
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isDone && !isCurrent ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <div className="mt-1">
                  <p
                    className={`text-xs font-bold ${
                      isCurrent
                        ? "text-[#800020]"
                        : isDone
                        ? "text-slate-900"
                        : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-[11px] text-slate-500 hidden sm:block">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Technician Information Card */}
      {technician ? (
        <div className="mt-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[#f6e7eb] font-bold text-[#800020]">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900">{technician.name}</span>
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                  ★ {technician.rating ?? "4.9"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Verified NammaPros Technician · {technician.completed_jobs ?? "45+"} jobs delivered
              </p>
            </div>
          </div>

          {technician.phone && (
            <a
              href={`tel:${technician.phone}`}
              onClick={onCallTechnician}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#800020] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#5e0017] transition"
            >
              <Phone className="h-3.5 w-3.5" /> Call Pro
            </a>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500">
            A background-verified technician will be dispatched and displayed here ahead of your slot.
          </p>
        </div>
      )}
    </div>
  );
}
