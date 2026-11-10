"use client";

import { AlertTriangle, Bookmark, RefreshCw, Trash2, type LucideIcon } from "lucide-react";
import React, { useState, type ReactNode } from "react";
import type { SavedFilterView } from "@/lib/hooks";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-[var(--op-text)]">{title}</h1>
        {subtitle && <p className="text-[12px] text-[var(--op-muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  accent,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "danger" | "warning" | "success" | "brand";
  onClick?: () => void;
}) {
  const valueClass =
    accent === "danger"
      ? "text-red-600"
      : accent === "warning"
        ? "text-amber-600"
        : accent === "success"
          ? "text-emerald-600"
          : accent === "brand"
            ? "text-[var(--op-brand)]"
            : "text-[var(--op-text)]";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-3.5 text-left shadow-[var(--op-shadow)] ${
        onClick ? "cursor-pointer transition hover:border-[var(--op-brand)]" : ""
      }`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--op-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${valueClass}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-[var(--op-muted)]">{hint}</div>}
    </Wrapper>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--op-border)] bg-[var(--op-surface)] px-6 py-12 text-center">
      <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--op-surface-alt)] text-[var(--op-muted)]">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-[14px] font-semibold text-[var(--op-text)]">{title}</h3>
      <p className="mt-1 max-w-md text-[12px] text-[var(--op-muted)]">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Unable to load data",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div>
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-[12px] text-red-800">{message}</div>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-red-800 hover:bg-red-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)]">
      <div className="divide-y divide-[var(--op-border)]">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid h-10 items-center gap-3 px-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((__, c) => (
              <div key={c} className="h-3 animate-pulse rounded bg-[var(--op-border)]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Timeline({
  items,
  emptyText = "No events recorded yet.",
}: {
  items: { id?: string; title: string; subtitle?: string; timestamp: string; badge?: ReactNode }[];
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="text-[12px] text-[var(--op-muted)]">{emptyText}</p>;
  }
  return (
    <ol className="relative space-y-3 border-l border-[var(--op-border)] pl-4">
      {items.map((item, idx) => (
        <li key={item.id ?? `${item.timestamp}-${idx}`} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-[var(--op-surface)] bg-[var(--op-brand)]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-[var(--op-text)]">{item.title}</span>
            {item.badge}
          </div>
          {item.subtitle && <p className="mt-0.5 text-[12px] text-[var(--op-muted)]">{item.subtitle}</p>}
          <p className="mt-0.5 text-[11px] text-[var(--op-muted)]">{item.timestamp}</p>
        </li>
      ))}
    </ol>
  );
}

export function SavedViewsBar<T extends Record<string, string>>({
  views,
  currentFilters,
  onApply,
  onSave,
  onRemove,
}: {
  views: SavedFilterView<T>[];
  currentFilters: T;
  onApply: (filters: T) => void;
  onSave: (name: string, filters: T) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), currentFilters);
    setName("");
    setAdding(false);
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--op-muted)]">
        <Bookmark className="h-3 w-3" /> Views:
      </span>
      {views.map((view) => {
        const isActive = Object.keys(view.filters).every(
          (k) => (currentFilters[k] ?? "") === (view.filters[k] ?? "")
        );
        return (
          <div key={view.id} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => onApply(view.filters)}
              className={`rounded-l border px-2 py-1 text-[12px] font-medium transition ${
                view.builtIn ? "rounded-r" : "border-r-0"
              } ${
                isActive
                  ? "border-[var(--op-brand)] bg-[var(--op-brand-soft)] text-[var(--op-brand)]"
                  : "border-[var(--op-border)] bg-[var(--op-surface)] text-[var(--op-text)] hover:bg-[var(--op-row-hover)]"
              }`}
            >
              {view.name}
            </button>
            {!view.builtIn && (
              <button
                type="button"
                aria-label={`Delete saved view ${view.name}`}
                onClick={() => onRemove(view.id)}
                className="rounded-r border border-[var(--op-border)] bg-[var(--op-surface)] px-1.5 py-1 text-[12px] text-[var(--op-muted)] hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
      {adding ? (
        <form onSubmit={submit} className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="View name..."
            className="h-7 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px] text-[var(--op-text)]"
          />
          <button
            type="submit"
            className="h-7 rounded bg-[var(--op-brand)] px-2.5 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="h-7 rounded border border-[var(--op-border)] px-2 text-[12px] text-[var(--op-muted)]"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded border border-dashed border-[var(--op-border)] px-2 py-1 text-[12px] text-[var(--op-muted)] hover:border-[var(--op-brand)] hover:text-[var(--op-brand)]"
        >
          + Save current view
        </button>
      )}
    </div>
  );
}

export function LiveRefreshBanner({
  deltaCount,
  onRefresh,
  isFetching,
}: {
  deltaCount: number;
  onRefresh: () => void;
  isFetching?: boolean;
}) {
  if (deltaCount <= 0) return null;
  return (
    <button
      type="button"
      onClick={onRefresh}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--op-brand)] bg-[var(--op-brand-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--op-brand)] hover:opacity-90"
    >
      <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
      <span>{deltaCount} updated — click to refresh</span>
    </button>
  );
}
