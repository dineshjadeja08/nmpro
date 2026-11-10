"use client";

import type { OpsBooking } from "@nammapros/types";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  Clock,
  CreditCard,
  FileClock,
  PhoneCall,
  Radio,
  RefreshCw,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { MapPanel } from "@/components/ops/ops-map-panel";
import { useBookingDrawer } from "@/components/ops/ops-shell";
import { ErrorState, KpiCard, PageHeader, SkeletonRows } from "@/components/ops/ops-states";
import { SlaChip, StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime, formatMoneyPaise, todayIstDateString } from "@/lib/format";
import { useNowTick } from "@/lib/hooks";
import { formatStatusLabel, getEffectiveSlaDeadline } from "@/lib/status";

export function DashboardPage() {
  const router = useRouter();
  const { openBookingDrawer } = useBookingDrawer();
  const [dateRange, setDateRange] = useState(() => {
    const today = todayIstDateString();
    return { start: today, end: today };
  });
  const nowMs = useNowTick(15_000);

  const dashboardQuery = useQuery({
    queryKey: ["ops", "dashboard", dateRange],
    queryFn: () => api.dashboard(dateRange),
    refetchInterval: 15_000,
  });

  const dispatchQuery = useQuery({
    queryKey: ["ops", "dispatch"],
    queryFn: () => api.dispatch(),
    refetchInterval: 15_000,
  });

  const overdueFollowUpsQuery = useQuery({
    queryKey: ["ops", "leads-overdue-count"],
    queryFn: () => api.leadFollowUps("overdue", 1),
    refetchInterval: 15_000,
  });

  const pendingPaymentsQuery = useQuery({
    queryKey: ["ops", "bookings-awaiting-payment"],
    queryFn: () => api.bookings({ status: "AWAITING_PAYMENT", page: 1 }),
    refetchInterval: 15_000,
  });

  const openEscalationsQuery = useQuery({
    queryKey: ["ops", "escalations-open-count"],
    queryFn: () => api.escalations({ status: "OPEN", page: 1 }),
    refetchInterval: 15_000,
  });

  const data = dashboardQuery.data;

  const derivedMetrics = useMemo(() => {
    const dispatchGroups = dispatchQuery.data?.groups;
    const activeAssigned = dispatchGroups?.ASSIGNED ?? [];
    const inProgress = dispatchGroups?.IN_PROGRESS ?? [];
    const lateNotEnRoute = activeAssigned.filter((b) => {
      const started = new Date(b.start_at).getTime() <= nowMs;
      const techStatus = (b.technician?.status ?? "").toUpperCase();
      return started && techStatus === "ASSIGNED";
    }).length;
    const awaitingQuotation = inProgress.filter(
      (b) => (b.technician?.status ?? "").toUpperCase() === "AWAITING_QUOTATION_APPROVAL"
    ).length;
    const pendingPayOver30m = (pendingPaymentsQuery.data?.results ?? []).filter(
      (b) => nowMs - new Date(b.start_at).getTime() > 30 * 60_000
    ).length;

    const revenuePaise = (data?.recent_bookings ?? [])
      .filter((b) => b.status !== "CANCELLED" && b.price_paise)
      .reduce((acc, b) => acc + (b.price_paise ?? 0), 0);

    return {
      lateNotEnRoute,
      awaitingQuotation,
      pendingPayOver30m,
      offeredBacklog: dispatchGroups?.OFFERED?.length ?? 0,
      exceptionsCount: dispatchGroups?.EXCEPTIONS?.length ?? 0,
      revenuePaise,
    };
  }, [data, dispatchQuery.data, pendingPaymentsQuery.data, nowMs]);

  const mapPins = useMemo(() => {
    const combined: OpsBooking[] = [
      ...(data?.recent_bookings ?? []),
      ...(data?.upcoming_appointments ?? []),
    ];
    const seen = new Set<string>();
    return combined
      .filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      })
      .map((b) => ({
        id: b.id,
        label: `${b.reference} · ${b.service}`,
        subtitle: b.technician ? `Tech: ${b.technician.name}` : "Unassigned",
        status: b.status,
        addressText: b.address
          ? `${b.address.line_1}, ${b.address.locality}, ${b.address.city}`
          : b.zone,
        onSelect: () => openBookingDrawer(b.id),
      }));
  }, [data, openBookingDrawer]);

  const actionQueue = [
    {
      label: "Unassigned bookings",
      count: data?.metrics.unassigned ?? 0,
      href: "/bookings?unassigned=1",
      icon: UserX,
      tone: (data?.metrics.unassigned ?? 0) > 0 ? "danger" : "neutral",
    },
    {
      label: "Exceptions / Expired",
      count: derivedMetrics.exceptionsCount,
      href: "/dispatch",
      icon: Radio,
      tone: derivedMetrics.exceptionsCount > 0 ? "danger" : "neutral",
    },
    {
      label: "Tech late (not en route)",
      count: derivedMetrics.lateNotEnRoute,
      href: "/bookings?status=TECHNICIAN_ASSIGNED",
      icon: Clock,
      tone: derivedMetrics.lateNotEnRoute > 0 ? "warning" : "neutral",
    },
    {
      label: "Quotes awaiting customer",
      count: derivedMetrics.awaitingQuotation,
      href: "/bookings?status=IN_PROGRESS",
      icon: FileClock,
      tone: derivedMetrics.awaitingQuotation > 0 ? "warning" : "neutral",
    },
    {
      label: "Open escalations",
      count: openEscalationsQuery.data?.count ?? data?.urgent_escalations.length ?? 0,
      href: "/escalations?status=OPEN",
      icon: AlertOctagon,
      tone: (openEscalationsQuery.data?.count ?? 0) > 0 ? "danger" : "neutral",
    },
    {
      label: "Lead follow-ups overdue",
      count: overdueFollowUpsQuery.data?.count ?? 0,
      href: "/leads",
      icon: PhoneCall,
      tone: (overdueFollowUpsQuery.data?.count ?? 0) > 0 ? "danger" : "neutral",
    },
    {
      label: "Payment pending >30m",
      count: derivedMetrics.pendingPayOver30m || (pendingPaymentsQuery.data?.count ?? 0),
      href: "/bookings?status=AWAITING_PAYMENT",
      icon: CreditCard,
      tone: (pendingPaymentsQuery.data?.count ?? 0) > 0 ? "warning" : "neutral",
    },
  ] as const;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operations Dashboard — What needs me now"
        subtitle="Live priority queues & today's KPIs · refreshes every 15s"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Start date"
              value={dateRange.start}
              onChange={(e) => setDateRange((d) => ({ ...d, start: e.target.value }))}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            />
            <input
              type="date"
              aria-label="End date"
              value={dateRange.end}
              onChange={(e) => setDateRange((d) => ({ ...d, end: e.target.value }))}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            />
            <button
              type="button"
              onClick={() => void dashboardQuery.refetch()}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2.5 text-[12px] font-semibold text-[var(--op-text)] hover:border-[var(--op-brand)]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dashboardQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      {dashboardQuery.isError && (
        <ErrorState
          message={
            dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : "Could not load operational dashboard."
          }
          onRetry={() => void dashboardQuery.refetch()}
        />
      )}

      {/* Action Queue strip */}
      <section aria-label="Action queue">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
          Priority Action Queue
        </h2>
        <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          {actionQueue.map((item) => {
            const Icon = item.icon;
            const ringClass =
              item.tone === "danger"
                ? "border-red-300 bg-red-50/60 hover:border-red-500"
                : item.tone === "warning"
                  ? "border-amber-300 bg-amber-50/60 hover:border-amber-500"
                  : "border-[var(--op-border)] bg-[var(--op-surface)] hover:border-[var(--op-brand)]";
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => router.push(item.href)}
                className={`rounded-lg border p-3 text-left transition ${ringClass}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon
                    className={`h-4 w-4 ${
                      item.tone === "danger"
                        ? "text-red-600"
                        : item.tone === "warning"
                          ? "text-amber-600"
                          : "text-[var(--op-muted)]"
                    }`}
                  />
                  <span className="text-xl font-bold tabular-nums text-[var(--op-text)]">
                    {item.count}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] font-medium text-[var(--op-text)]">{item.label}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Today KPIs */}
      {dashboardQuery.isLoading ? (
        <SkeletonRows rows={3} cols={6} />
      ) : (
        data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Total bookings" value={data.metrics.total ?? 0} onClick={() => router.push("/bookings")} />
              <KpiCard label="Completed" value={data.metrics.completed ?? 0} accent="success" />
              <KpiCard label="In progress" value={data.metrics.active ?? 0} accent="brand" />
              <KpiCard label="Cancelled" value={data.metrics.cancelled ?? 0} />
              <KpiCard
                label="Today booked value"
                value={formatMoneyPaise(derivedMetrics.revenuePaise, true)}
                hint="Sum of active recent bookings in view"
              />
              <KpiCard
                label="Online pros / SLA breaches"
                value={`${data.metrics.available_technicians ?? 0} / ${data.metrics.sla_breaches ?? 0}`}
                accent={(data.metrics.sla_breaches ?? 0) > 0 ? "danger" : "default"}
                hint="Avg time-to-assign: — (not in dashboard API)"
              />
            </section>

            <div className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <MapPanel title="Today's Jobs & Field Coverage" pins={mapPins} heightClass="h-64" />
              </div>

              <div className="space-y-3 lg:col-span-5">
                <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-3.5 shadow-[var(--op-shadow)]">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold text-[var(--op-text)]">Approaching SLA Deadlines</h2>
                    <span className="text-[11px] text-[var(--op-muted)]">{data.sla_warnings.length} active</span>
                  </div>
                  {data.sla_warnings.length === 0 ? (
                    <p className="text-[12px] text-[var(--op-muted)]">No SLA warnings inside warning window.</p>
                  ) : (
                    <div className="divide-y divide-[var(--op-border)]">
                      {data.sla_warnings.map((w, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 text-[12px]">
                          <div>
                            <span className="font-semibold text-[var(--op-text)]">{formatStatusLabel(w.code)}</span>
                            <span className="ml-2 text-[11px] text-[var(--op-muted)]">
                              Due {formatIstDateTime(w.deadline_at)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <SlaChip deadlineAt={w.deadline_at} />
                            {w.booking_id && (
                              <button
                                type="button"
                                onClick={() => openBookingDrawer(w.booking_id!)}
                                className="font-semibold text-[var(--op-brand)] hover:underline"
                              >
                                Inspect
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-3.5 shadow-[var(--op-shadow)]">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold text-[var(--op-text)]">Urgent Escalations</h2>
                    <Link href="/escalations" className="text-[11px] font-semibold text-[var(--op-brand)] hover:underline">
                      View all →
                    </Link>
                  </div>
                  {data.urgent_escalations.length === 0 ? (
                    <p className="text-[12px] text-[var(--op-muted)]">No open urgent escalations.</p>
                  ) : (
                    <div className="divide-y divide-[var(--op-border)]">
                      {data.urgent_escalations.map((e) => (
                        <div key={e.id} className="flex items-center justify-between py-1.5 text-[12px]">
                          <div>
                            <StatusBadge status={e.priority} />{" "}
                            <span className="ml-1 font-medium">{formatStatusLabel(e.category)}</span>
                          </div>
                          {e.booking_id && (
                            <button
                              type="button"
                              onClick={() => openBookingDrawer(e.booking_id!)}
                              className="font-semibold text-[var(--op-brand)] hover:underline"
                            >
                              Open booking
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>

            {/* Upcoming & Recent Bookings */}
            <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] shadow-[var(--op-shadow)]">
              <div className="flex items-center justify-between border-b border-[var(--op-border)] px-3.5 py-2.5">
                <h2 className="text-[13px] font-semibold text-[var(--op-text)]">
                  Recent & Upcoming Jobs (click row for drawer)
                </h2>
                <Link href="/bookings" className="text-[12px] font-semibold text-[var(--op-brand)] hover:underline">
                  Full Bookings Queue →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="border-b border-[var(--op-border)] bg-[var(--op-surface-alt)]">
                    <tr className="h-9 text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                      <th className="px-3">Ref</th>
                      <th className="px-3">Customer</th>
                      <th className="px-3">Service</th>
                      <th className="px-3">Zone</th>
                      <th className="px-3">Slot (IST)</th>
                      <th className="px-3">Status</th>
                      <th className="px-3">Technician</th>
                      <th className="px-3">SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--op-border)]">
                    {(data.upcoming_appointments.length > 0
                      ? data.upcoming_appointments
                      : data.recent_bookings
                    ).map((b) => (
                      <tr
                        key={b.id}
                        onClick={() => openBookingDrawer(b.id)}
                        className="h-10 cursor-pointer hover:bg-[var(--op-row-hover)]"
                      >
                        <td className="px-3 font-mono text-[12px] font-semibold">{b.reference}</td>
                        <td className="px-3 text-[13px]">{b.customer_name || b.customer_phone}</td>
                        <td className="px-3 text-[13px]">{b.service}</td>
                        <td className="px-3 text-[12px] text-[var(--op-muted)]">{b.zone}</td>
                        <td className="px-3 font-mono text-[12px]">{formatIstDateTime(b.start_at)}</td>
                        <td className="px-3">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="px-3 text-[12px]">
                          {b.technician ? b.technician.name : <span className="text-amber-700">Unassigned</span>}
                        </td>
                        <td className="px-3">
                          <SlaChip deadlineAt={getEffectiveSlaDeadline(b)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
