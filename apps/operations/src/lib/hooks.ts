"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type SavedFilterView<T extends Record<string, string>> = {
  id: string;
  name: string;
  filters: T;
  builtIn?: boolean;
};

export function useSavedViews<T extends Record<string, string>>(
  pageKey: string,
  builtInViews: SavedFilterView<T>[] = []
) {
  const storageKey = `nammapros.ops.savedViews.${pageKey}`;
  const [customViews, setCustomViews] = useState<SavedFilterView<T>[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as SavedFilterView<T>[]) : [];
    } catch {
      return [];
    }
  });

  const saveView = useCallback(
    (name: string, filters: T) => {
      const nextItem: SavedFilterView<T> = {
        id: `custom-${Date.now()}`,
        name: name.trim(),
        filters,
      };
      setCustomViews((prev) => {
        const next = [...prev, nextItem];
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore quota error
        }
        return next;
      });
    },
    [storageKey]
  );

  const removeView = useCallback(
    (id: string) => {
      setCustomViews((prev) => {
        const next = prev.filter((item) => item.id !== id);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [storageKey]
  );

  return {
    views: [...builtInViews.map((v) => ({ ...v, builtIn: true })), ...customViews],
    saveView,
    removeView,
  };
}

export function useUrlDrawerParam(paramName: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(paramName);

  const setDrawerParam = useCallback(
    (nextValue: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextValue) {
        params.set(paramName, nextValue);
      } else {
        params.delete(paramName);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [paramName, pathname, router, searchParams]
  );

  return [value, setDrawerParam] as const;
}

export function useNowTick(intervalMs = 1000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useTableKeyboardShortcuts(options: {
  rowCount: number;
  selectedIndex: number;
  onChangeIndex: (index: number) => void;
  onOpenRow: (index: number) => void;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onAssign?: () => void;
  onNote?: () => void;
  onReschedule?: () => void;
}) {
  const {
    rowCount,
    selectedIndex,
    onChangeIndex,
    onOpenRow,
    drawerOpen,
    onCloseDrawer,
    onAssign,
    onNote,
    onReschedule,
  } = options;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "Escape" && drawerOpen) {
        event.preventDefault();
        onCloseDrawer();
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "j") {
        if (rowCount === 0) return;
        event.preventDefault();
        onChangeIndex(Math.min(rowCount - 1, selectedIndex < 0 ? 0 : selectedIndex + 1));
      } else if (key === "k") {
        if (rowCount === 0) return;
        event.preventDefault();
        onChangeIndex(Math.max(0, selectedIndex <= 0 ? 0 : selectedIndex - 1));
      } else if (event.key === "Enter" && !drawerOpen && selectedIndex >= 0 && selectedIndex < rowCount) {
        const active = document.activeElement;
        if (active && (active.tagName === "BUTTON" || active.tagName === "A")) return;
        event.preventDefault();
        onOpenRow(selectedIndex);
      } else if (key === "a" && drawerOpen && onAssign) {
        event.preventDefault();
        onAssign();
      } else if (key === "n" && drawerOpen && onNote) {
        event.preventDefault();
        onNote();
      } else if (key === "r" && drawerOpen && onReschedule) {
        event.preventDefault();
        onReschedule();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rowCount, selectedIndex, onChangeIndex, onOpenRow, drawerOpen, onCloseDrawer, onAssign, onNote, onReschedule]);
}
