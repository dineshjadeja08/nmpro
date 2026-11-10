"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; title: string; detail?: string };

type OpsUiContextValue = {
  toast: (kind: ToastKind, title: string, detail?: string) => void;
  theme: "light" | "dark";
  setTheme: (next: "light" | "dark") => void;
  toggleTheme: () => void;
  showShortcutHints: boolean;
  setShowShortcutHints: (value: boolean) => void;
};

const OpsUiContext = createContext<OpsUiContextValue | null>(null);

export function useOpsUi() {
  const ctx = useContext(OpsUiContext);
  if (!ctx) throw new Error("useOpsUi must be used inside OpsProviders");
  return ctx;
}

export function OpsProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("nammapros.ops.theme") === "dark" ? "dark" : "light";
  });
  const [showShortcutHints, setShowShortcutHintsState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("nammapros.ops.shortcutHints") !== "false";
  });
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((next: "light" | "dark") => {
    setThemeState(next);
    try {
      window.localStorage.setItem("nammapros.ops.theme", next);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const setShowShortcutHints = useCallback((value: boolean) => {
    setShowShortcutHintsState(value);
    try {
      window.localStorage.setItem("nammapros.ops.shortcutHints", String(value));
    } catch {
      // ignore
    }
  }, []);

  const toast = useCallback((kind: ToastKind, title: string, detail?: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-3), { id, kind, title, detail }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <OpsUiContext.Provider
        value={{ toast, theme, setTheme, toggleTheme, showShortcutHints, setShowShortcutHints }}
      >
        {children}
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
        >
          {toasts.map((item) => (
            <div
              key={item.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-3 shadow-lg"
            >
              {item.kind === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : item.kind === "error" ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--op-text)]">{item.title}</p>
                {item.detail && <p className="mt-0.5 text-[12px] text-[var(--op-muted)]">{item.detail}</p>}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(item.id)}
                className="rounded p-0.5 text-[var(--op-muted)] hover:bg-[var(--op-row-hover)] hover:text-[var(--op-text)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </OpsUiContext.Provider>
    </QueryClientProvider>
  );
}
