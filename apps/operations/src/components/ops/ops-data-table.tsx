"use client";

import type { LucideIcon } from "lucide-react";
import React, { type ReactNode } from "react";
import { EmptyState, SkeletonRows } from "./ops-states";

export type OpsColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  width?: string;
  render: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading = false,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  emptyAction,
  selectedIndex = -1,
  activeRowId,
  onRowClick,
  selectable = false,
  checkedIds,
  onToggleCheck,
  onToggleCheckAll,
  pagination,
}: {
  columns: OpsColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  loading?: boolean;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyMessage: string;
  emptyAction?: ReactNode;
  selectedIndex?: number;
  activeRowId?: string | null;
  onRowClick?: (row: T, index: number) => void;
  selectable?: boolean;
  checkedIds?: Set<string>;
  onToggleCheck?: (id: string) => void;
  onToggleCheckAll?: (checked: boolean) => void;
  pagination?: {
    page: number;
    count: number;
    pageSize?: number;
    onPageChange: (nextPage: number) => void;
  };
}) {
  if (loading && rows.length === 0) {
    return <SkeletonRows rows={8} cols={columns.length} />;
  }

  if (rows.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} action={emptyAction} />;
  }

  const allChecked = Boolean(
    selectable && checkedIds && rows.length > 0 && rows.every((r) => checkedIds.has(getRowKey(r)))
  );

  function isInteractiveTarget(target: EventTarget | null) {
    return (
      target instanceof Element &&
      Boolean(target.closest("button, a, input, select, textarea, label, [role=button]"))
    );
  }

  const pageSize = pagination?.pageSize ?? 20;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.count / pageSize)) : 1;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] shadow-[var(--op-shadow)]">
      <div className="max-h-[calc(100vh-270px)] overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-[var(--op-border)] bg-[var(--op-surface-alt)]">
            <tr className="h-9">
              {selectable && (
                <th className="w-9 px-3">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on page"
                    checked={allChecked}
                    onChange={(e) => onToggleCheckAll?.(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--op-brand)]"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={`px-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)] whitespace-nowrap ${
                    col.align === "right" ? "text-right" : ""
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--op-border)]">
            {rows.map((row, idx) => {
              const rowKey = getRowKey(row);
              const isHighlighted = idx === selectedIndex || (activeRowId && rowKey === activeRowId);
              const isChecked = Boolean(checkedIds?.has(rowKey));
              return (
                <tr
                  key={rowKey}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={(e) => {
                    if (!isInteractiveTarget(e.target)) {
                      onRowClick?.(row, idx);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onRowClick?.(row, idx);
                    }
                  }}
                  className={`h-10 transition-colors ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${
                    isHighlighted
                      ? "bg-[var(--op-row-selected)]"
                      : "hover:bg-[var(--op-row-hover)]"
                  }`}
                >
                  {selectable && (
                    <td className="px-3">
                      <input
                        type="checkbox"
                        aria-label={`Select row ${rowKey}`}
                        checked={isChecked}
                        onChange={() => onToggleCheck?.(rowKey)}
                        className="h-3.5 w-3.5 accent-[var(--op-brand)]"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-1.5 text-[13px] text-[var(--op-text)] whitespace-nowrap ${
                        col.align === "right" ? "text-right" : ""
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--op-border)] bg-[var(--op-surface-alt)] px-3 py-2 text-[12px]">
          <span className="text-[var(--op-muted)]">
            Page <strong className="text-[var(--op-text)]">{pagination.page}</strong> of{" "}
            <strong className="text-[var(--op-text)]">{totalPages}</strong> · {pagination.count} records
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--op-text)] hover:bg-[var(--op-row-hover)] disabled:opacity-45"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page * pageSize >= pagination.count}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--op-text)] hover:bg-[var(--op-row-hover)] disabled:opacity-45"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
