"use client";

import { CalendarCheck2, Home, Layers3, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/services", label: "Services", icon: Layers3, match: (p: string) => p.startsWith("/services") || p.startsWith("/search") },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck2, match: (p: string) => p.startsWith("/bookings") || p.startsWith("/book") },
  { href: "/account", label: "Account", icon: UserRound, match: (p: string) => p.startsWith("/account") || p.startsWith("/payments") },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname() || "/";

  return (
    <nav
      aria-label="Bottom mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8E1DB] bg-[#FBF8F5]/95 backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[54px] flex-col items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold transition ${
                active ? "text-[#800020]" : "text-[#57534E]"
              }`}
            >
              <span
                className={`inline-flex h-7 w-11 items-center justify-center rounded-full ${
                  active ? "bg-[#f5ebe8]" : ""
                }`}
              >
                <Icon size={20} strokeWidth={1.5} />
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
