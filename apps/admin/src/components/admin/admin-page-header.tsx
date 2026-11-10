import React, { type ReactNode } from "react";

export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4 sm:mb-6 sm:pb-5">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">
          NammaPros · Admin
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">{action}</div>
      ) : null}
    </div>
  );
}
