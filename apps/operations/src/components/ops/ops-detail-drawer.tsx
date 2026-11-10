"use client";

import { X } from "lucide-react";
import React, { useEffect, type ReactNode } from "react";

export function DetailDrawer({
  open,
  title,
  subtitle,
  headerActions,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex justify-end bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="false"
        aria-label="Details drawer"
        className="flex h-full w-full max-w-[540px] flex-col border-l border-[var(--op-border)] bg-[var(--op-surface)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--op-border)] px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-[var(--op-text)]">
              {title}
            </div>
            {subtitle && <div className="mt-0.5 text-[12px] text-[var(--op-muted)]">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              title="Close (Esc)"
              className="rounded border border-[var(--op-border)] p-1 text-[var(--op-muted)] hover:bg-[var(--op-row-hover)] hover:text-[var(--op-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </div>
  );
}
