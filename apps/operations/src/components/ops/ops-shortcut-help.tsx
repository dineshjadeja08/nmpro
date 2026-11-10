"use client";

import { Keyboard, X } from "lucide-react";
import React, { useEffect } from "react";
import { isTypingTarget } from "@/lib/hooks";

const SHORTCUTS: [string, string][] = [
  ["/ or Ctrl+K", "Open global search / command bar"],
  ["J / K", "Move highlight down / up table rows"],
  ["Enter", "Open selected row in right drawer"],
  ["Esc", "Close active drawer or modal"],
  ["A", "Quick assign / reassign (when booking drawer open)"],
  ["N", "Focus add internal note (when booking drawer open)"],
  ["R", "Open reschedule tab (when booking drawer open)"],
  ["?", "Toggle this keyboard shortcuts help"],
];

export function ShortcutHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/45 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-[var(--op-brand)]" />
            <h2 className="text-[15px] font-semibold text-[var(--op-text)]">Keyboard shortcuts</h2>
          </div>
          <button
            type="button"
            aria-label="Close shortcuts help"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-[var(--op-muted)] hover:bg-[var(--op-row-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="divide-y divide-[var(--op-border)]">
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} className="flex items-center justify-between gap-3 py-2 text-[12px]">
              <span className="text-[var(--op-muted)]">{desc}</span>
              <kbd className="rounded border border-[var(--op-border)] bg-[var(--op-surface-alt)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--op-text)]">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
