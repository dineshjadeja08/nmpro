import React from "react";
import { type LucideIcon } from "lucide-react";

export function AdminEmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-teal-50">
        <Icon className="h-6 w-6 text-teal-800" />
      </span>
      <h3 className="mt-4 text-sm font-bold text-slate-950">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-600">{message}</p>
    </div>
  );
}
