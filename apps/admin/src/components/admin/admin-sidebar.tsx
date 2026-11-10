"use client";

import React from "react";
import {
  Bell,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileClock,
  Image,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageSquareText,
  Package,
  Plus,
  Settings,
  Shield,
  SlidersHorizontal,
  Star,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { AdminBrand } from "./admin-brand";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  child?: boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const adminNavigationSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Leads", href: "/leads", icon: ClipboardList },
      { label: "Create Lead", href: "/leads/create", icon: Plus, child: true },
      { label: "Customers", href: "/customers", icon: Users },
      { label: "Bookings", href: "/bookings", icon: CalendarCheck },
      { label: "Work Orders", href: "/work-orders", icon: ListChecks },
      { label: "Payments", href: "/finance/payments", icon: CreditCard },
      { label: "Technicians", href: "/technicians", icon: Wrench },
      { label: "Partner KYC", href: "/technicians/verification", icon: Shield, child: true },
      { label: "Assignments", href: "/assignments", icon: ListChecks },
      { label: "Service Areas", href: "/zones", icon: MapPin },
      { label: "Scheduling", href: "/scheduling", icon: CalendarCheck },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Reviews", href: "/reviews", icon: Star },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { label: "Services", href: "/services", icon: Package },
      { label: "Packages", href: "/services/packages", icon: SlidersHorizontal },
      { label: "FAQs", href: "/faqs", icon: MessageSquareText },
    ],
  },
  {
    title: "Website",
    items: [
      { label: "Homepage Banners", href: "/website/banners", icon: Image },
      { label: "Carousel", href: "/website/carousel", icon: Image },
    ],
  },
  {
    title: "Business",
    items: [
      { label: "Reports", href: "/reports", icon: FileBarChart },
      { label: "Staff and Roles", href: "/staff", icon: Shield },
      { label: "Audit Logs", href: "/audit-logs", icon: FileClock },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function AdminSidebar({
  pathname,
  userPhone,
  userRoles,
  pendingKycCount = 0,
  onSignOut,
}: {
  pathname: string;
  userPhone: string;
  userRoles: string[];
  pendingKycCount?: number;
  onSignOut: () => void;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden h-screen w-72 border-r border-slate-700 bg-[#172033] text-white lg:block">
      <div className="flex h-full flex-col">
        {/* Brand header */}
        <div className="border-b border-slate-700 px-5 py-5">
          <AdminBrand dark />
        </div>

        {/* Navigation scroll area */}
        <nav className="custom-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {adminNavigationSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {section.title}
              </p>
              <div className="mt-2 space-y-1">
                {section.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (!item.child && pathname.startsWith(`${item.href}/`));
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        item.child ? "ml-7 text-xs" : ""
                      } ${
                        active
                          ? "bg-teal-700 text-white shadow-sm"
                          : "text-slate-200 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.href === "/technicians/verification" && pendingKycCount > 0 ? (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-900">
                          {pendingKycCount}
                        </span>
                      ) : null}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer & sign out */}
        <div className="border-t border-slate-700 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-200">{userPhone}</p>
              <p className="truncate text-[11px] text-slate-400">{userRoles.join(" · ")}</p>
            </div>
            <button
              onClick={onSignOut}
              className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
