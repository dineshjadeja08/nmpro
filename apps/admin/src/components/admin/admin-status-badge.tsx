import React from "react";

const toneByStatus: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  PAYMENT_FAILED: "bg-red-100 text-red-800",
  CONFIRMED: "bg-sky-100 text-sky-900",
  TECHNICIAN_ASSIGNED: "bg-blue-100 text-blue-900",
  TECHNICIAN_EN_ROUTE: "bg-cyan-100 text-cyan-900",
  TECHNICIAN_ARRIVED: "bg-cyan-100 text-cyan-900",
  IN_PROGRESS: "bg-teal-100 text-teal-900",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-200 text-slate-700",
  PAID: "bg-emerald-100 text-emerald-800",
  UNPAID: "bg-amber-100 text-amber-800",
  PARTIALLY_PAID: "bg-blue-100 text-blue-800",
  FAILED: "bg-red-100 text-red-800",
  AVAILABLE: "bg-emerald-100 text-emerald-800",
  VERIFIED: "bg-emerald-100 text-emerald-800",
  PENDING: "bg-amber-100 text-amber-800",
  SUSPENDED: "bg-red-100 text-red-800",
  ACTIVE: "bg-emerald-100 text-emerald-900",
  INACTIVE: "bg-slate-200 text-slate-800",
  UNDER_REVIEW: "bg-amber-100 text-amber-900",
  REJECTED: "bg-red-100 text-red-900",
  OPEN: "bg-sky-100 text-sky-900",
  CLOSED: "bg-slate-200 text-slate-800",
  NEW: "bg-indigo-100 text-indigo-900",
  CONTACTED: "bg-cyan-100 text-cyan-900",
  FOLLOW_UP: "bg-amber-100 text-amber-900",
  QUALIFIED: "bg-emerald-100 text-emerald-900",
  CONVERTED: "bg-teal-100 text-teal-900",
  LOST: "bg-slate-200 text-slate-700",
  CAPTURED: "bg-emerald-100 text-emerald-900",
  AUTHORIZED: "bg-blue-100 text-blue-900",
};

export function AdminStatusBadge({ status }: { status: string }) {
  const norm = (status || "").toUpperCase();
  const tone = toneByStatus[norm] ?? "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-bold tracking-wide ${tone}`}
    >
      {status ? status.replaceAll("_", " ") : "—"}
    </span>
  );
}
