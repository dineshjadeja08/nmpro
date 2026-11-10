"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, LogOut, Menu, Search, X } from "lucide-react";
import { api } from "../../lib/api";
import { AdminBrand } from "./admin-brand";
import { adminNavigationSections } from "./admin-sidebar";

type GlobalSearchItem = {
  key: string;
  title: string;
  subtitle: string;
  href: string;
};

export function AdminTopbar({
  pathname,
  userPhone,
  userRoles,
  search,
  onSearchChange,
  onSignOut,
}: {
  pathname: string;
  userPhone: string;
  userRoles: string[];
  search: string;
  onSearchChange: (value: string) => void;
  onSignOut: () => void;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [globalResults, setGlobalResults] = useState<GlobalSearchItem[]>([]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setGlobalResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api<{
          bookings?: Array<{ id: string; reference: string; service: string; status: string }>;
          leads?: Array<{ id: string; reference: string; customer_name: string; status: string }>;
          customers?: Array<{ id: number; customer_code: string; phone: string; name: string }>;
          technicians?: Array<{ id: string; name: string; phone: string; status: string }>;
        }>(`/admin/search/?q=${encodeURIComponent(q)}`);
        if (!active) return;
        const flat: GlobalSearchItem[] = [
          ...(res.bookings ?? []).map((b) => ({
            key: `b-${b.id}`,
            title: `${b.reference} · ${b.service}`,
            subtitle: `Booking · ${b.status}`,
            href: `/bookings/${b.id}`,
          })),
          ...(res.leads ?? []).map((l) => ({
            key: `l-${l.id}`,
            title: `${l.reference} · ${l.customer_name}`,
            subtitle: `Lead · ${l.status}`,
            href: `/leads/${l.id}`,
          })),
          ...(res.customers ?? []).map((c) => ({
            key: `c-${c.id}`,
            title: `${c.customer_code || "Customer"} · ${c.name || c.phone}`,
            subtitle: `Customer · ${c.phone}`,
            href: `/customers/${c.id}`,
          })),
          ...(res.technicians ?? []).map((t) => ({
            key: `t-${t.id}`,
            title: `${t.name} · ${t.phone}`,
            subtitle: `Partner · ${t.status}`,
            href: `/technicians/${t.id}`,
          })),
        ];
        setGlobalResults(flat);
      } catch {
        if (active) setGlobalResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 280);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.04)] backdrop-blur sm:px-4 lg:px-8">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {/* Mobile hamburger button */}
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open mobile navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* PurpleSquad Global Search */}
          <div className="relative order-3 w-full sm:order-none sm:max-w-md sm:flex-1">
            <label htmlFor="admin-global-search" className="sr-only">
              Search admin
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="admin-global-search"
              value={search}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 shadow-none outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
              placeholder="Search work orders, leads, customers, technicians"
            />
            {searchFocused && search.trim().length >= 2 ? (
              <div className="absolute inset-x-0 top-12 z-50 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                {searching ? (
                  <p className="p-3 text-sm text-slate-500">Searching…</p>
                ) : globalResults.length > 0 ? (
                  globalResults.map((result) => (
                    <a
                      key={result.key}
                      href={result.href}
                      onClick={() => setSearchFocused(false)}
                      className="block rounded-md p-3 hover:bg-slate-50"
                    >
                      <span className="block text-sm font-bold text-slate-950">{result.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{result.subtitle}</span>
                    </a>
                  ))
                ) : (
                  <p className="p-3 text-sm text-slate-500">No results found.</p>
                )}
              </div>
            ) : null}
          </div>

          {/* User profile dropdown */}
          <div className="relative ml-auto">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50 transition"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-black text-violet-800">
                {userPhone.slice(-2)}
              </span>
              <span className="min-w-0 hidden sm:block">
                <span className="block truncate text-sm font-bold text-slate-950">{userPhone}</span>
                <span className="block text-[11px] text-slate-500">{userRoles.join(" · ").replaceAll("_", " ")}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${userDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {userDropdownOpen ? (
              <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                <div className="px-3 py-2 border-b border-slate-100 sm:hidden">
                  <p className="text-xs font-bold text-slate-900">{userPhone}</p>
                  <p className="text-[10px] text-slate-500">{userRoles.join(" · ")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUserDropdownOpen(false);
                    onSignOut();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 transition"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <nav className="relative flex h-full w-80 max-w-[85vw] flex-col overflow-y-auto bg-[#172033] p-4 text-white">
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-4">
              <AdminBrand dark />
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-slate-800"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 pb-6">
              {adminNavigationSections.map((section) => (
                <div key={section.title}>
                  <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {section.title}
                  </p>
                  <div className="mt-2 space-y-1">
                    {section.items.map((item) => {
                      const active = pathname === item.href;
                      const Icon = item.icon;
                      return (
                        <a
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                            active
                              ? "bg-teal-700 text-white font-bold"
                              : "text-slate-200 hover:bg-slate-800"
                          }`}
                          onClick={() => setMobileNavOpen(false)}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={onSignOut}
              className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-950/20 py-2.5 text-sm font-bold text-red-300 hover:bg-red-950/40"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </nav>
        </div>
      ) : null}
    </>
  );
}
