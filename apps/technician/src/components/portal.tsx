"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Profile } from "../lib/api";
import { I18nProvider, useI18n, type TextKey } from "../lib/i18n";
import { JobFlow } from "./job-flow";
import { JobsList } from "./jobs";
import { JobAlert } from "./job-alert";
import { JoinRequest, KycPage, Login, OnboardingSteps, UnderReview, Welcome } from "./onboarding";
import { EarningsPage, InvoicesPage } from "./pages";
import { FeePage } from "./fee";
import { Icon } from "./ui";

const TABS: { href: string; key: TextKey; icon: "briefcase" | "wallet" | "user" | "check" }[] = [
  { href: "/jobs", key: "jobs", icon: "briefcase" },
  { href: "/earnings", key: "earnings", icon: "wallet" },
  { href: "/invoices", key: "receipts", icon: "check" },
  { href: "/kyc", key: "kyc", icon: "user" },
];
const PUBLIC_PATHS = ["/welcome", "/login", "/join"];

export default function Portal() {
  return (
    <I18nProvider>
      <PortalInner />
    </I18nProvider>
  );
}

function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label={t("language")}>
      <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
      <button aria-pressed={lang === "ta"} onClick={() => setLang("ta")} lang="ta">தமிழ்</button>
    </div>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar"><Link className="brand" href="/welcome">NammaPros</Link><LanguageToggle /></header>
      <main id="main">{children}</main>
    </>
  );
}

function PortalInner() {
  const path = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [blocked, setBlocked] = useState("");
  const [feeDue, setFeeDue] = useState(false);
  const [firstJoin, setFirstJoin] = useState(false);
  const [inReview, setInReview] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setProfile(await api.me()); } catch { setProfile(null); }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (PUBLIC_PATHS.includes(path)) {
        setLoading(false);
        return;
      }
      try {
        await api.authMe();
        // Jobs only open for approved technicians whose app login is switched on by admin.
        await api.jobs();
        const p = await api.me();
        if (!active) return;
        setProfile(p);
        setBlocked("");
        if (path === "/" || path === "/dashboard") router.replace("/jobs");
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 403) {
          // Signed in but jobs are locked: unpaid joining fee first, otherwise waiting for approval.
          const [fee, me] = await Promise.all([api.joiningFee().catch(() => null), api.me().catch(() => null)]);
          if (!active) return;
          setFeeDue(Boolean(fee && !fee.settled) || path === "/fee");
          setFirstJoin(Boolean(fee && !fee.paid_at));
          setInReview(Boolean(me && ["UNDER_REVIEW", "PENDING_DOCUMENTS"].includes(me.verification_status)));
          setBlocked(e.message);
        } else router.replace("/welcome");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [path, router]);

  if (loading) return <div className="auth"><div className="card" aria-busy="true">{t("loading")}</div></div>;
  if (path === "/welcome") return <PublicShell><Welcome /></PublicShell>;
  if (path === "/login") return <PublicShell><Login /></PublicShell>;
  if (path === "/join") return <PublicShell><JoinRequest /></PublicShell>;

  const signOut = async () => {
    await api.logout().catch(() => undefined);
    setProfile(null);
    router.replace("/welcome");
  };

  if (feeDue) {
    return (
      <PublicShell>
        {firstJoin && <div className="onb-steps-bar"><OnboardingSteps step={3} /></div>}
        <FeePage onSignOut={signOut} />
      </PublicShell>
    );
  }
  if (blocked && inReview) return <PublicShell><UnderReview note={blocked} onSignOut={signOut} /></PublicShell>;
  if (blocked || !profile) {
    return (
      <PublicShell>
        <div className="auth">
          <div className="card stack" role="alert">
            <h1>{t("appName")}</h1>
            <p>{blocked || t("loading")}</p>
            <button className="btn ghost block" onClick={signOut}>{t("signOut")}</button>
          </div>
        </div>
      </PublicShell>
    );
  }

  let screen: React.ReactNode;
  if (path === "/jobs") screen = <JobsList name={profile.display_name} />;
  else if (path.startsWith("/jobs/")) screen = <JobFlow id={path.split("/")[2]} />;
  else if (path === "/earnings") screen = <EarningsPage />;
  else if (path === "/invoices") screen = <InvoicesPage />;
  else if (path === "/kyc") screen = <KycPage profile={profile} refresh={refresh} />;
  else if (path === "/fee") screen = <FeePage onSignOut={signOut} />;
  else screen = <div className="empty">Page not found. <Link href="/jobs">{t("jobs")}</Link></div>;

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/jobs">NammaPros<small>{profile.display_name}</small></Link>
        <div className="topbar-actions">
          <LanguageToggle />
          <button className="icon-btn" onClick={signOut}>{t("signOut")}</button>
        </div>
      </header>
      <main className="main" id="main">{screen}</main>
      <JobAlert />
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => {
          const current = path === tab.href || (tab.href === "/jobs" && path.startsWith("/jobs/"));
          return (
            <Link key={tab.href} href={tab.href} aria-current={current ? "page" : undefined}>
              <Icon name={tab.icon} /> {t(tab.key)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
