"use client";

import { X } from "lucide-react";
import React, { useEffect, useState, type ReactNode } from "react";

export function ActionDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  requireReason = false,
  reasonLabel = "Reason",
  reasonPlaceholder = "Enter operational reason...",
  busy = false,
  onClose,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requireReason && !reason.trim()) {
      setError(`${reasonLabel} is required.`);
      return;
    }
    setError("");
    await onConfirm(reason.trim());
    setReason("");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="op-action-dialog-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="op-action-dialog-title" className="text-[15px] font-semibold text-[var(--op-text)]">
              {title}
            </h2>
            {description && <p className="mt-1 text-[12px] text-[var(--op-muted)]">{description}</p>}
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label="Close dialog"
            onClick={onClose}
            className="rounded p-1 text-[var(--op-muted)] hover:bg-[var(--op-row-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children && <div className="mt-3">{children}</div>}

        {requireReason && (
          <label className="mt-3 block">
            <span className="mb-1 block text-[12px] font-semibold text-[var(--op-text)]">
              {reasonLabel} *
            </span>
            <textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              placeholder={reasonPlaceholder}
              className="w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 py-2 text-[13px] text-[var(--op-text)]"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="mt-2 text-[12px] font-medium text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--op-text)] hover:bg-[var(--op-row-hover)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`rounded px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50 ${
              confirmVariant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-[var(--op-brand)] hover:bg-[var(--op-brand-hover)]"
            }`}
          >
            {busy ? "Processing..." : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
