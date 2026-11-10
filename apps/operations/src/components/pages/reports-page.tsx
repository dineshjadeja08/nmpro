"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import React, { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorState, KpiCard, PageHeader, SkeletonRows } from "@/components/ops/ops-states";
import { api } from "@/lib/api";
import { shiftIsoDate, todayIstDateString } from "@/lib/format";

export function ReportsPage() {
  const [range, setRange] = useState(() => {
    const end = todayIstDateString();
    return { start: shiftIsoDate(end, -30), end };
  });

  const reportsQuery = useQuery({
    queryKey: ["ops", "reports", range],
    queryFn: () => api.reports(range),
  });

  const leadSummaryQuery = useQuery({
    queryKey: ["ops", "lead-summary-report"],
    queryFn: () => api.leadSummary(),
  });

  const data = reportsQuery.data;
  const pct = (val: number) => `${(val * 100).toFixed(1)}%`;

  const leadFunnelData = leadSummaryQuery.data
    ? [
        { stage: "Total", count: leadSummaryQuery.data.total },
        { stage: "New", count: leadSummaryQuery.data.new },
        { stage: "Qualified", count: leadSummaryQuery.data.qualified },
        { stage: "Converted", count: leadSummaryQuery.data.converted },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operational Reports"
        subtitle="Zone/service volume, SLA breaches, technician utilization, and lead conversion funnel"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Report start date"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            />
            <input
              type="date"
              aria-label="Report end date"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            />
            <a
              href={api.reportCsvUrl(range)}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-[var(--op-brand)] px-3 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)]"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </a>
          </div>
        }
      />

      {reportsQuery.isError && (
        <ErrorState
          message={reportsQuery.error instanceof Error ? reportsQuery.error.message : "Could not load reports."}
          onRetry={() => void reportsQuery.refetch()}
        />
      )}

      {reportsQuery.isLoading ? (
        <SkeletonRows rows={6} cols={4} />
      ) : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Total Bookings" value={data.total} />
              <KpiCard label="Assignment Rate" value={pct(data.assignment_rate)} accent="brand" />
              <KpiCard label="Completion Rate" value={pct(data.completion_rate)} accent="success" />
              <KpiCard label="Cancellation Rate" value={pct(data.cancellation_rate)} accent="warning" />
              <KpiCard
                label="SLA Breaches"
                value={data.sla_breaches}
                accent={data.sla_breaches > 0 ? "danger" : "default"}
              />
              <KpiCard label="Support Tickets" value={data.support_tickets} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)]">
                <h2 className="mb-3 text-[13px] font-semibold text-[var(--op-text)]">Daily Booking Trend</h2>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.by_date}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                      <XAxis dataKey="created_at__date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Bookings"
                        stroke="#800020"
                        fill="#FDF2F4"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)]">
                <h2 className="mb-3 text-[13px] font-semibold text-[var(--op-text)]">Bookings by Zone</h2>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.by_zone.map((z) => ({
                        zone: z.slot__zone__name || "Unzoned",
                        count: z.count,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                      <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Bookings" fill="#800020" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)]">
                <h2 className="mb-3 text-[13px] font-semibold text-[var(--op-text)]">Bookings by Service</h2>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.by_service.map((s) => ({
                        service: s.service__name || "Unknown",
                        count: s.count,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                      <XAxis dataKey="service" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Bookings" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)]">
                <h2 className="mb-3 text-[13px] font-semibold text-[var(--op-text)]">
                  Lead Conversion Funnel ({leadSummaryQuery.data?.conversion_rate ?? 0}%)
                </h2>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadFunnelData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4E4E7" />
                      <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Leads" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            {/* Technician Performance Table */}
            <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)]">
              <h2 className="mb-2 text-[13px] font-semibold text-[var(--op-text)]">Technician Utilization</h2>
              <p className="mb-3 text-[11px] text-[var(--op-muted)]">
                Completed appointment minutes divided by scheduled weekly minutes in range (cancellation reason breakdown is not yet aggregated by `/operations/reports/`).
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="border-b border-[var(--op-border)] bg-[var(--op-surface-alt)]">
                    <tr className="h-9 text-[11px] font-semibold uppercase text-[var(--op-muted)]">
                      <th className="px-3">Technician</th>
                      <th className="px-3 text-right">Completed Jobs</th>
                      <th className="px-3 text-right">Utilization</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--op-border)]">
                    {data.technician_utilization.map((u) => (
                      <tr key={u.id} className="h-10">
                        <td className="px-3 text-[13px] font-medium">{u.display_name}</td>
                        <td className="px-3 text-right font-mono text-[12px]">{u.completed}</td>
                        <td className="px-3 text-right font-mono text-[12px]">
                          {u.utilization_rate === null ? "No schedule" : pct(u.utilization_rate)}
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
