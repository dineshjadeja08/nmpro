"use client";

import React, { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { AdminEmptyState } from "./admin-empty-state";

export type AdminColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
};

export function AdminDataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  onRowClick,
}: {
  columns: AdminColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyMessage: string;
  onRowClick?: (row: T) => void;
}) {
  const canOpen = Boolean(onRowClick || columns.some((column) => column.key === "actions"));
  const dense = columns.length > 6;

  function openRow(row: T, element: HTMLElement) {
    if (onRowClick) return onRowClick(row);
    const action = Array.from(
      element.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button, a")
    ).find((control) => /^(edit|manage|view|open|details)\b/i.test(control.textContent?.trim() ?? ""));
    if (action && !("disabled" in action && action.disabled)) action.click();
  }

  function isControl(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, summary, [role=button]"));
  }

  if (rows.length === 0) {
    return <AdminEmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />;
  }

  return (
    <>
      {/* Mobile Card Layout */}
      <div className={`grid gap-3 ${dense ? "xl:hidden" : "md:hidden"}`}>
        {rows.map((row) => (
          <article
            key={getRowKey(row)}
            tabIndex={canOpen ? 0 : undefined}
            aria-label={canOpen ? "Open record details" : undefined}
            onClick={(event) => {
              if (!isControl(event.target)) openRow(row, event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                openRow(row, event.currentTarget);
              }
            }}
            className={`min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-teal-500 ${
              canOpen ? "cursor-pointer hover:border-teal-300" : ""
            }`}
          >
            <dl className="grid min-w-0 gap-3">
              {columns.map((column) => (
                <div
                  key={column.key}
                  className="grid min-w-0 grid-cols-[100px_minmax(0,1fr)] items-start gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                >
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {column.header}
                  </dt>
                  <dd className="min-w-0 break-words text-sm text-slate-700 [overflow-wrap:anywhere]">
                    {column.render(row)}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>

      {/* Desktop Responsive Table Layout */}
      <div
        className={`hidden w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm ${
          dense ? "xl:block" : "md:block"
        }`}
      >
        <table className="w-full table-auto divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="break-words px-3 py-3 text-left text-[11px] font-bold uppercase text-slate-500"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                tabIndex={canOpen ? 0 : undefined}
                aria-label={canOpen ? "Open record details" : undefined}
                onClick={(event) => {
                  if (!isControl(event.target)) openRow(row, event.currentTarget);
                }}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    openRow(row, event.currentTarget);
                  }
                }}
                className={`odd:bg-white even:bg-slate-50/60 hover:bg-teal-50/70 focus-visible:outline-2 focus-visible:outline-teal-700 transition ${
                  canOpen ? "cursor-pointer" : ""
                }`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className="min-w-0 break-words px-3.5 py-3 align-middle text-slate-700 [overflow-wrap:anywhere]"
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
