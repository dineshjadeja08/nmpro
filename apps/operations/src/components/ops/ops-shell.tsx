"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  HelpCircle,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Search,
  Settings,
  Sun,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { BookingDrawer } from "@/components/drawers/booking-drawer";
import { api } from "@/lib/api";
import { useUrlDrawerParam } from "@/lib/hooks";
import { CommandPalette } from "./ops-command-palette";
import { useOpsUi } from "./ops-providers";
import { ShortcutHelpDialog } from "./ops-shortcut-help";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: ClipboardList },
  { href: "/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/dispatch", label: "Dispatch", icon: Radio },
  { href: "/schedule", label: "Schedule", icon: CalendarRange },
  { href: "/technicians", label: "Technicians", icon: Wrench },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/escalations", label: "Escalations", icon: AlertOctagon },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

type BookingDrawerControls = {
  openBookingDrawer: (id: string) => void;
  closeBookingDrawer: () => void;
  activeBookingId: string | null;
  triggerBookingFocus: (type: "assign" | "note" | "reschedule") => void;
};

const BookingDrawerContext = createContext<BookingDrawerControls | null>(null);

export function useBookingDrawer() {
  const ctx = useContext(BookingDrawerContext);
  if (!ctx) throw new Error("useBookingDrawer must be used inside OpsShell");
  return ctx;
}

export function OpsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { theme, toggleTheme, toast } = useOpsUi();

  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [bookingDrawerId, setBookingDrawerId] = useUrlDrawerParam("booking");
  const [focusSignal, setFocusSignal] = useState<{
    type: "assign" | "note" | "reschedule";
    seq: number;
  } | null>(null);

  const meQuery = useQuery({
    queryKey: ["ops", "me"],
    queryFn: () => api.me(),
    retry: false,
  });

  const grantsQuery = useQuery({
    queryKey: ["ops", "zone-grants"],
    queryFn: () => api.zoneGrants(),
    enabled: Boolean(meQuery.data),
    retry: false,
  });

  const areasQuery = useQuery({
    queryKey: ["ops", "service-areas"],
    queryFn: () => api.serviceAreas(),
    enabled: Boolean(meQuery.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (meQuery.isError && pathname !== "/login") {
      router.replace("/login");
    }
  }, [meQuery.isError, pathname, router]);

  const openBookingDrawer = useCallback(
    (id: string) => {
      setBookingDrawerId(id);
    },
    [setBookingDrawerId]
  );

  const closeBookingDrawer = useCallback(() => {
    setBookingDrawerId(null);
  }, [setBookingDrawerId]);

  const triggerBookingFocus = useCallback((type: "assign" | "note" | "reschedule") => {
    setFocusSignal((prev) => ({ type, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  if (pathname === "/login") {
    return (
      <LoginScreen
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ["ops", "me"] });
          router.replace("/dashboard");
        }}
      />
    );
  }

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--op-bg)] p-6">
        <div className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] px-5 py-4 text-[13px] font-medium text-[var(--op-muted)] shadow-sm">
          Opening NammaPros Operations control room...
        </div>
      </div>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--op-bg)] p-6">
        <div className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] px-5 py-4 text-[13px] text-[var(--op-muted)]">
          Redirecting to sign in...
        </div>
      </div>
    );
  }

  const user = meQuery.data;
  const userGrants = (grantsQuery.data?.results ?? []).filter((g) => g.user_id === user.id);
  const grantedZoneNames = userGrants
    .map((g) => areasQuery.data?.find((a) => a.id === g.zone_id)?.name ?? g.zone_id.slice(0, 8))
    .slice(0, 3);

  async function handleLogout() {
    try {
      await api.logout();
      queryClient.clear();
      router.replace("/login");
    } catch (err) {
      toast("error", "Sign out failed", err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <BookingDrawerContext.Provider
      value={{
        openBookingDrawer,
        closeBookingDrawer,
        activeBookingId: bookingDrawerId,
        triggerBookingFocus,
      }}
    >
      <div className="flex min-h-screen bg-[var(--op-bg)] text-[var(--op-text)]">
        {/* Sidebar: 240px expanded / 64px collapsed */}
        <aside
          className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-[var(--op-border)] bg-[var(--op-surface)] transition-all duration-150 ${
            sidebarCompact ? "w-16" : "w-60"
          }`}
        >
          <div className="flex h-12 items-center justify-between border-b border-[var(--op-border)] px-3">
            <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--op-brand)] text-[14px] font-bold text-white">
                n.
              </span>
              {!sidebarCompact && (
                <div className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold tracking-tight text-[var(--op-text)]">
                    NammaPros
                  </span>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--op-muted)]">
                    Operations
                  </span>
                </div>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setSidebarCompact((v) => !v)}
              aria-label={sidebarCompact ? "Expand sidebar" : "Collapse sidebar"}
              className="rounded p-1 text-[var(--op-muted)] hover:bg-[var(--op-row-hover)] hover:text-[var(--op-text)]"
            >
              {sidebarCompact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          <nav aria-label="Operations navigation" className="flex-1 space-y-0.5 overflow-y-auto p-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={sidebarCompact ? item.label : undefined}
                  className={`flex h-8 items-center gap-2.5 rounded px-2.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--op-brand)] text-white"
                      : "text-[var(--op-text)] hover:bg-[var(--op-row-hover)]"
                  } ${sidebarCompact ? "justify-center px-0" : ""}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCompact && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {!sidebarCompact && (
            <div className="border-t border-[var(--op-border)] p-3 text-[11px] text-[var(--op-muted)]">
              <div className="truncate font-semibold text-[var(--op-text)]">
                {user.full_name || user.username || user.phone_e164}
              </div>
              <div className="truncate font-mono">{user.phone_e164}</div>
            </div>
          )}
        </aside>

        {/* Main workspace */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-[var(--op-border)] bg-[var(--op-surface)] px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="flex h-8 w-full max-w-md items-center justify-between gap-2 rounded border border-[var(--op-border)] bg-[var(--op-surface-alt)] px-2.5 text-[12px] text-[var(--op-muted)] hover:border-[var(--op-brand)]"
              >
                <span className="flex items-center gap-2 truncate">
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Search booking ID, customer, lead, technician...</span>
                </span>
                <kbd className="hidden rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
                  Ctrl+K
                </kbd>
              </button>

              <span
                title="Lead & Operations Zone Scope"
                className="hidden items-center gap-1 rounded border border-[var(--op-border)] bg-[var(--op-surface-alt)] px-2 py-1 text-[11px] font-medium text-[var(--op-muted)] lg:inline-flex"
              >
                <MapPin className="h-3 w-3 text-[var(--op-brand)]" />
                {grantedZoneNames.length > 0
                  ? `Zones: ${grantedZoneNames.join(", ")}${userGrants.length > 3 ? ` +${userGrants.length - 3}` : ""}`
                  : "Zone scope enforced"}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle dark mode"
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--op-border)] bg-[var(--op-surface)] text-[var(--op-muted)] hover:text-[var(--op-text)]"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                aria-label="Keyboard shortcuts help"
                title="Keyboard shortcuts (?)"
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--op-border)] bg-[var(--op-surface)] text-[var(--op-muted)] hover:text-[var(--op-text)]"
              >
                <HelpCircle className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[12px] font-medium text-[var(--op-text)] hover:border-red-300 hover:text-red-600"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-5">
            <div className="mx-auto max-w-[1680px]">{children}</div>
          </main>
        </div>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <ShortcutHelpDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <BookingDrawer
        bookingId={bookingDrawerId}
        focusActionSignal={focusSignal}
        onClose={closeBookingDrawer}
      />
    </BookingDrawerContext.Provider>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useOpsUi();
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [phone, setPhone] = useState("+91");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!challengeId) {
        const res = await api.otpRequest(phone.trim());
        setChallengeId(res.challenge_id);
        setDevCode(res.development_code ?? "");
        toast("info", "Verification code sent");
      } else {
        await api.otpVerify(phone.trim(), challengeId, code.trim());
        toast("success", "Signed in to Operations");
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.passwordLogin(username.trim(), password);
      toast("success", "Signed in to Operations");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--op-bg)] p-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--op-brand)] text-[14px] font-bold text-white">
            n.
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--op-brand)]">
            NammaPros Operations
          </span>
        </div>
        <h1 className="mt-3 text-[20px] font-semibold tracking-tight text-[var(--op-text)]">
          Control Room Sign In
        </h1>
        <p className="mt-1 text-[12px] text-[var(--op-muted)]">
          Staff session with an active Operations or Admin grant is required.
        </p>

        <div className="mt-4 grid grid-cols-2 rounded border border-[var(--op-border)] bg-[var(--op-surface-alt)] p-0.5 text-[12px]">
          <button
            type="button"
            onClick={() => {
              setMode("otp");
              setError("");
            }}
            className={`rounded py-1.5 font-semibold ${
              mode === "otp" ? "bg-[var(--op-surface)] text-[var(--op-brand)] shadow-xs" : "text-[var(--op-muted)]"
            }`}
          >
            Staff Phone OTP
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError("");
            }}
            className={`rounded py-1.5 font-semibold ${
              mode === "password"
                ? "bg-[var(--op-surface)] text-[var(--op-brand)] shadow-xs"
                : "text-[var(--op-muted)]"
            }`}
          >
            Password
          </button>
        </div>

        {mode === "otp" ? (
          <form onSubmit={(e) => void handleOtpSubmit(e)} className="mt-4 space-y-3">
            <label className="block text-[12px] font-semibold text-[var(--op-text)]">
              Staff Mobile (+91)
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="+919876543210"
                className="mt-1 h-9 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[13px]"
              />
            </label>
            {challengeId && (
              <label className="block text-[12px] font-semibold text-[var(--op-text)]">
                Verification Code
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  required
                  placeholder="6-digit OTP"
                  className="mt-1 h-9 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[13px]"
                />
              </label>
            )}
            {devCode && (
              <p className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-mono text-[12px] text-emerald-900">
                Dev code: {devCode}
              </p>
            )}
            {error && (
              <p role="alert" className="text-[12px] font-medium text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="h-9 w-full rounded bg-[var(--op-brand)] text-[13px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-50"
            >
              {busy ? "Verifying..." : challengeId ? "Verify & Open Control Room" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void handlePasswordSubmit(e)} className="mt-4 space-y-3">
            <label className="block text-[12px] font-semibold text-[var(--op-text)]">
              Username or Phone
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="mt-1 h-9 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[13px]"
              />
            </label>
            <label className="block text-[12px] font-semibold text-[var(--op-text)]">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 h-9 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[13px]"
              />
            </label>
            {error && (
              <p role="alert" className="text-[12px] font-medium text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="h-9 w-full rounded bg-[var(--op-brand)] text-[13px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-50"
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
