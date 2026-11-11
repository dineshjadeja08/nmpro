import { CalendarCheck, ChevronRight, CreditCard, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type HubTabKey = "account" | "bookings" | "payments";

const HUB_TABS: ReadonlyArray<{
  key: HubTabKey;
  label: string;
  href: string;
  icon: typeof User;
}> = [
  { key: "account", label: "Account & Addresses", href: "/account", icon: User },
  { key: "bookings", label: "My Bookings", href: "/bookings", icon: CalendarCheck },
  { key: "payments", label: "Payments & Receipts", href: "/payments", icon: CreditCard },
];

/**
 * Branded hero strip and tab bar shared by customer account, bookings, and payment views.
 */
export function CustomerHubHeader({
  activeTab,
  crumb,
  badge,
  title,
  subtitle,
  actions,
}: {
  activeTab: HubTabKey;
  crumb: string;
  badge: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-[#EAE3DC] bg-gradient-to-b from-[#FBECEF] via-[#FDF4F6] to-[#FBF8F5] pt-6">
      <div className="container max-w-5xl">
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-[11px] font-medium text-[#78716C]">
          <Link href="/" className="hover:text-[#800020]">
            Home
          </Link>
          <ChevronRight size={12} />
          <span className="font-semibold text-[#1C1917]">{crumb}</span>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div className="space-y-1.5">
            <span className="inline-flex items-center rounded-md border border-[#800020]/15 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#800020] shadow-2xs">
              {badge}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#1C1917] sm:text-3xl">{title}</h1>
            <p className="max-w-xl text-xs leading-relaxed text-[#57534E] sm:text-sm">{subtitle}</p>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>

        <nav aria-label="Customer account navigation" className="-mb-px flex gap-1 overflow-x-auto">
          {HUB_TABS.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeTab;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-t-md border px-4 py-2.5 text-xs font-semibold transition ${
                  isActive
                    ? "border-[#EAE3DC] border-b-[#FBF8F5] bg-[#FBF8F5] font-bold text-[#800020] shadow-[0_-2px_10px_rgba(28,25,23,0.03)]"
                    : "border-transparent text-[#57534E] hover:bg-white/60 hover:text-[#1C1917]"
                }`}
              >
                <Icon size={14} strokeWidth={isActive ? 2.2 : 1.75} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
