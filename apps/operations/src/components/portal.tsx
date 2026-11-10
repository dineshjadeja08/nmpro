"use client";

import { usePathname, useRouter } from "next/navigation";
import React, { Suspense, useEffect } from "react";
import { OpsShell } from "@/components/ops/ops-shell";
import { EmptyState } from "@/components/ops/ops-states";
import { BookingsPage } from "@/components/pages/bookings-page";
import { CustomersPage } from "@/components/pages/customers-page";
import { DashboardPage } from "@/components/pages/dashboard-page";
import { DispatchPage } from "@/components/pages/dispatch-page";
import { EscalationsPage } from "@/components/pages/escalations-page";
import { LeadsPage } from "@/components/pages/leads-page";
import { ReportsPage } from "@/components/pages/reports-page";
import { SchedulePage } from "@/components/pages/schedule-page";
import { SettingsPage } from "@/components/pages/settings-page";
import { SupportPage } from "@/components/pages/support-page";
import { TechniciansPage } from "@/components/pages/technicians-page";
import { LayoutDashboard } from "lucide-react";

function LegacyRedirectNotice({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return (
    <div className="p-6 text-[13px] text-[var(--op-muted)]">
      Opening {label} in drawer...
    </div>
  );
}

function PortalContent() {
  const path = usePathname() || "/dashboard";
  const parts = path.split("/").filter(Boolean);
  const segment = parts[0] ?? "dashboard";
  const subId = parts[1];

  if (segment === "login") {
    return (
      <OpsShell>
        <div />
      </OpsShell>
    );
  }

  let content: React.ReactNode;
  switch (segment) {
    case "dashboard":
      content = <DashboardPage />;
      break;
    case "leads":
      content = subId && subId !== "new" ? <LegacyRedirectNotice href={`/leads?lead=${subId}`} label="lead" /> : <LeadsPage />;
      break;
    case "bookings":
      content = subId ? <LegacyRedirectNotice href={`/bookings?booking=${subId}`} label="booking" /> : <BookingsPage />;
      break;
    case "dispatch":
      content = <DispatchPage />;
      break;
    case "schedule":
      content = <SchedulePage />;
      break;
    case "technicians":
      content = subId ? (
        <LegacyRedirectNotice href={`/technicians?technician=${subId}`} label="technician" />
      ) : (
        <TechniciansPage />
      );
      break;
    case "customers":
      content = subId ? (
        <LegacyRedirectNotice href={`/customers?customer=${subId}`} label="customer" />
      ) : (
        <CustomersPage />
      );
      break;
    case "support":
      content = subId ? (
        <LegacyRedirectNotice href={`/support?ticket=${subId}`} label="ticket" />
      ) : (
        <SupportPage />
      );
      break;
    case "escalations":
      content = <EscalationsPage />;
      break;
    case "reports":
      content = <ReportsPage />;
      break;
    case "settings":
      content = <SettingsPage />;
      break;
    default:
      content = (
        <EmptyState
          icon={LayoutDashboard}
          title="Page not found"
          message="Select a workspace from the Operations sidebar."
        />
      );
  }

  return <OpsShell>{content}</OpsShell>;
}

export default function Portal() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--op-bg)] p-6 text-[13px] text-[var(--op-muted)]">
          Loading Operations Control Room...
        </div>
      }
    >
      <PortalContent />
    </Suspense>
  );
}
