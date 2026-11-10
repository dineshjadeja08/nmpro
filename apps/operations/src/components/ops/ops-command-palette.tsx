"use client";

import { ArrowRight, Calendar, ClipboardList, Search, Users, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isTypingTarget } from "@/lib/hooks";

type SearchResult = {
  id: string;
  kind: "booking" | "customer" | "technician" | "lead";
  title: string;
  subtitle: string;
  href: string;
};

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "/" && !open && !isTypingTarget(e.target)) {
        e.preventDefault();
        onOpenChange(true);
      } else if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const [bookings, customers, technicians, leads] = await Promise.all([
          api.bookings({ q: term, page: 1 }).catch(() => ({ results: [] })),
          api.customers({ q: term, page: 1 }).catch(() => ({ results: [] })),
          api.technicians({ q: term, page: 1 }).catch(() => ({ results: [] })),
          api.leads({ q: term, page: 1 }).catch(() => ({ results: [] })),
        ]);
        if (!active) return;
        const merged: SearchResult[] = [
          ...bookings.results.slice(0, 5).map((b) => ({
            id: `booking-${b.id}`,
            kind: "booking" as const,
            title: `${b.reference} · ${b.service}`,
            subtitle: `${b.customer_name || b.customer_phone} · ${b.zone}`,
            href: `/bookings?booking=${b.id}`,
          })),
          ...leads.results.slice(0, 4).map((l) => ({
            id: `lead-${l.id}`,
            kind: "lead" as const,
            title: `${l.lead_reference} · ${l.customer_name}`,
            subtitle: `${l.service} · ${l.mobile_number}`,
            href: `/leads?lead=${l.id}`,
          })),
          ...technicians.results.slice(0, 4).map((t) => ({
            id: `tech-${t.id}`,
            kind: "technician" as const,
            title: t.name,
            subtitle: `${t.online ? "Online" : "Offline"} · ${t.zones.join(", ") || "No zone"}`,
            href: `/technicians?technician=${t.id}`,
          })),
          ...customers.results.slice(0, 4).map((c) => ({
            id: `cust-${c.id}`,
            kind: "customer" as const,
            title: `Customer #${c.id}${c.customer_code ? ` (${c.customer_code})` : ""}`,
            subtitle: `${c.phone} · ${c.bookings} bookings`,
            href: `/customers?customer=${c.id}`,
          })),
        ];
        setResults(merged);
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  if (!open) return null;

  const quickNav = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Dispatch Queue", href: "/dispatch" },
    { label: "Bookings", href: "/bookings" },
    { label: "Leads CRM", href: "/leads" },
    { label: "Schedule Timeline", href: "/schedule" },
    { label: "Support Inbox", href: "/support" },
    { label: "Escalations", href: "/escalations" },
  ];

  const iconFor = (kind: SearchResult["kind"]) =>
    kind === "booking"
      ? Calendar
      : kind === "lead"
        ? ClipboardList
        : kind === "technician"
          ? Wrench
          : Users;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command search"
      className="fixed inset-0 z-[75] flex items-start justify-center bg-black/45 p-4 pt-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--op-border)] bg-[var(--op-surface)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--op-border)] px-3.5 py-2.5">
          <Search className="h-4 w-4 text-[var(--op-muted)]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              if (val.trim().length < 2) {
                setResults([]);
                setLoading(false);
              }
            }}
            placeholder="Search booking ref, customer phone, lead, or technician..."
            className="w-full bg-transparent text-[13px] text-[var(--op-text)] outline-none placeholder:text-[var(--op-muted)]"
          />
          <button
            type="button"
            aria-label="Close search"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-[var(--op-muted)] hover:bg-[var(--op-row-hover)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                Quick jump
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {quickNav.map((item) => (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      router.push(item.href);
                    }}
                    className="flex items-center justify-between rounded px-2.5 py-2 text-left text-[13px] text-[var(--op-text)] hover:bg-[var(--op-row-hover)]"
                  >
                    <span>{item.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[var(--op-muted)]" />
                  </button>
                ))}
              </div>
            </div>
          ) : loading ? (
            <p className="px-3 py-6 text-center text-[12px] text-[var(--op-muted)]">Searching operations records...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-[var(--op-muted)]">
              No matching booking, customer, lead, or technician found.
            </p>
          ) : (
            <div className="divide-y divide-[var(--op-border)]">
              {results.map((item) => {
                const Icon = iconFor(item.kind);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      setQuery("");
                      router.push(item.href);
                    }}
                    className="flex w-full items-center gap-3 px-2.5 py-2 text-left hover:bg-[var(--op-row-hover)]"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[var(--op-brand)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--op-text)]">{item.title}</p>
                      <p className="truncate text-[11px] text-[var(--op-muted)]">{item.subtitle}</p>
                    </div>
                    <span className="rounded bg-[var(--op-surface-alt)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--op-muted)]">
                      {item.kind}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
