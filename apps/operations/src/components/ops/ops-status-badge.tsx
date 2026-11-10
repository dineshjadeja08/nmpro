"use client";

import React from "react";
import { Clock } from "lucide-react";
import { useNowTick } from "@/lib/hooks";
import { evaluateSlaDeadline, getStatusMeta } from "@/lib/status";

export function StatusBadge({
  status,
  labelOverride,
  className = "",
}: {
  status: string;
  labelOverride?: string;
  className?: string;
}) {
  const meta = getStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap ${meta.badgeClass} ${className}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: meta.dotColor }}
      />
      <span>{labelOverride ?? meta.label}</span>
    </span>
  );
}

export function SlaChip({
  deadlineAt,
  nowMsOverride,
  className = "",
}: {
  deadlineAt: string | null | undefined;
  nowMsOverride?: number;
  className?: string;
}) {
  const tickedNow = useNowTick(1000);
  const nowMs = nowMsOverride ?? tickedNow;
  const sla = evaluateSlaDeadline(deadlineAt, nowMs);

  if (sla.severity === "NONE") {
    return <span className={`text-[12px] text-[var(--op-muted)] ${className}`}>—</span>;
  }

  const toneClass =
    sla.severity === "BREACHED"
      ? "bg-red-100 text-red-900 border-red-200"
      : sla.severity === "AT_RISK"
        ? "bg-amber-100 text-amber-900 border-amber-200"
        : "bg-emerald-100 text-emerald-900 border-emerald-200";

  return (
    <span
      title={`Deadline: ${new Date(deadlineAt as string).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap ${toneClass} ${className}`}
    >
      <Clock className="h-3 w-3 shrink-0" />
      <span>{sla.label}</span>
    </span>
  );
}
