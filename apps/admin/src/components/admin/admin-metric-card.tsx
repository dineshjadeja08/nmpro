import React from "react";
import { type LucideIcon } from "lucide-react";

export function AdminMetricCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  href?: string;
}) {
  const content = (
    <div className="rounded-xl border border-slate-200 border-l-4 border-l-teal-600 bg-white p-4 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50">
          <Icon className="h-4 w-4 text-teal-800" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-950">{value}</p>
    </div>
  );

  if (!href) return content;
  return <a href={href}>{content}</a>;
}
