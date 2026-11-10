"use client";

import type { OpsBooking } from "@nammapros/types";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useBookingDrawer } from "@/components/ops/ops-shell";
import { EmptyState, ErrorState, PageHeader } from "@/components/ops/ops-states";
import { StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstTime, shiftIsoDate, todayIstDateString } from "@/lib/format";
import { getStatusMeta } from "@/lib/status";

// 07:00 to 21:00 IST (14 hours = 840 minutes)
const TIMELINE_START_MIN = 7 * 60;
const TIMELINE_END_MIN = 21 * 60;
const TIMELINE_SPAN_MIN = TIMELINE_END_MIN - TIMELINE_START_MIN;
const HOURS = Array.from({ length: 14 }, (_, i) => 7 + i);

function getIstMinutesOfDay(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

export function SchedulePage() {
  const { openBookingDrawer } = useBookingDrawer();
  const [day, setDay] = useState(() => todayIstDateString());
  const [zoneFilter, setZoneFilter] = useState("");
  const [skillFilter, setSkillFilter] = useState("");

  // TODO: Phase 2 — Drag-to-reschedule on timeline blocks once multi-status operations reschedule is unlocked on backend.
  const scheduleQuery = useQuery({
    queryKey: ["ops", "schedule", day, zoneFilter],
    queryFn: () => api.schedule({ start: day, end: day, ...(zoneFilter ? { zone: zoneFilter } : {}) }),
    refetchInterval: 15_000,
  });

  const techniciansQuery = useQuery({
    queryKey: ["ops", "technicians-schedule"],
    queryFn: () => api.technicians({ page: 1 }),
    staleTime: 30_000,
  });

  const zonesQuery = useQuery({
    queryKey: ["ops", "service-areas"],
    queryFn: () => api.serviceAreas(),
    staleTime: 60_000,
  });

  const allSkills = useMemo(() => {
    const s = new Set<string>();
    for (const t of techniciansQuery.data?.results ?? []) {
      for (const sk of t.skills) s.add(sk);
    }
    return Array.from(s).sort();
  }, [techniciansQuery.data]);

  const conflictRefs = useMemo(() => {
    const set = new Set<string>();
    for (const c of scheduleQuery.data?.conflicts ?? []) {
      set.add(c.first);
      set.add(c.second);
    }
    return set;
  }, [scheduleQuery.data]);

  const rows = useMemo(() => {
    const bookings = scheduleQuery.data?.bookings ?? [];
    const techs = (techniciansQuery.data?.results ?? []).filter((t) => {
      if (skillFilter && !t.skills.includes(skillFilter)) return false;
      if (zoneFilter) {
        const zName = zonesQuery.data?.find((z) => z.id === zoneFilter)?.name;
        if (zName && !t.zones.includes(zName)) return false;
      }
      return true;
    });

    const unassigned = bookings.filter((b) => !b.technician);
    const techRows = techs.map((t) => ({
      id: t.id,
      name: t.name,
      online: t.online,
      subtitle: t.zones.join(", ") || "No zone",
      bookings: bookings.filter((b) => b.technician?.id === t.id),
    }));

    return [
      {
        id: "unassigned",
        name: "Unassigned Queue",
        online: false,
        subtitle: "Needs technician assignment",
        bookings: unassigned,
      },
      ...techRows,
    ];
  }, [scheduleQuery.data, techniciansQuery.data, skillFilter, zoneFilter, zonesQuery.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schedule Timeline"
        subtitle="Gantt technician view (07:00–21:00 IST) · conflicts highlighted red"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setDay((d) => shiftIsoDate(d, -1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--op-border)] bg-[var(--op-surface)] hover:border-[var(--op-brand)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              aria-label="Schedule date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            />
            <button
              type="button"
              aria-label="Next day"
              onClick={() => setDay((d) => shiftIsoDate(d, 1))}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--op-border)] bg-[var(--op-surface)] hover:border-[var(--op-brand)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <select
              aria-label="Zone filter"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            >
              <option value="">All zones</option>
              {(zonesQuery.data ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Skill filter"
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
            >
              <option value="">All skills</option>
              {allSkills.map((sk) => (
                <option key={sk} value={sk}>
                  {sk}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {scheduleQuery.isError && (
        <ErrorState
          message={scheduleQuery.error instanceof Error ? scheduleQuery.error.message : "Could not load schedule."}
          onRetry={() => void scheduleQuery.refetch()}
        />
      )}

      {(scheduleQuery.data?.conflicts.length ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
          <span>
            <strong>{scheduleQuery.data?.conflicts.length} overlap conflict(s):</strong>{" "}
            {scheduleQuery.data?.conflicts.map((c) => `${c.first} ↔ ${c.second}`).join(", ")}
          </span>
        </div>
      )}

      <section className="overflow-x-auto rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] shadow-[var(--op-shadow)]">
        <div className="min-w-[980px]">
          {/* Time Header */}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] border-b border-[var(--op-border)] bg-[var(--op-surface-alt)]">
            <div className="border-r border-[var(--op-border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Technician / Lane
            </div>
            <div className="grid grid-cols-14">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="border-r border-[var(--op-border)] px-1.5 py-2 text-center font-mono text-[11px] text-[var(--op-muted)] last:border-r-0"
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {scheduleQuery.isLoading ? (
            <p className="p-6 text-center text-[12px] text-[var(--op-muted)]">Loading schedule grid...</p>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={CalendarRange} title="No schedule rows" message="Adjust zone or skill filters." />
            </div>
          ) : (
            <div className="divide-y divide-[var(--op-border)]">
              {rows.map((row) => (
                <div key={row.id} className="grid grid-cols-[200px_minmax(0,1fr)]">
                  <div className="border-r border-[var(--op-border)] px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          row.id === "unassigned" ? "bg-amber-500" : row.online ? "bg-emerald-500" : "bg-zinc-400"
                        }`}
                      />
                      <span className="truncate text-[13px] font-medium text-[var(--op-text)]">{row.name}</span>
                    </div>
                    <p className="truncate text-[11px] text-[var(--op-muted)]">{row.subtitle}</p>
                  </div>

                  <div className="relative h-14 bg-[var(--op-surface)]">
                    {/* Vertical hour lines */}
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-14">
                      {HOURS.map((h) => (
                        <div key={h} className="border-r border-[var(--op-border)]/50 last:border-r-0" />
                      ))}
                    </div>

                    {row.bookings.map((b: OpsBooking) => {
                      const startMin = getIstMinutesOfDay(b.start_at);
                      const endMin = b.end_at ? getIstMinutesOfDay(b.end_at) : startMin + 60;
                      const clampedStart = Math.max(TIMELINE_START_MIN, Math.min(TIMELINE_END_MIN - 30, startMin));
                      const clampedEnd = Math.max(clampedStart + 30, Math.min(TIMELINE_END_MIN, endMin));
                      const leftPct = ((clampedStart - TIMELINE_START_MIN) / TIMELINE_SPAN_MIN) * 100;
                      const widthPct = Math.max(4, ((clampedEnd - clampedStart) / TIMELINE_SPAN_MIN) * 100);
                      const isConflict = conflictRefs.has(b.reference);
                      const meta = getStatusMeta(b.status);

                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => openBookingDrawer(b.id)}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          title={`${b.reference} · ${b.service} · ${formatIstTime(b.start_at)}`}
                          className={`absolute top-1.5 bottom-1.5 overflow-hidden rounded border px-1.5 py-0.5 text-left text-[11px] shadow-xs transition hover:z-20 hover:ring-2 hover:ring-[var(--op-brand)] ${
                            isConflict
                              ? "border-red-600 bg-red-100 text-red-900 ring-1 ring-red-500"
                              : meta.badgeClass
                          }`}
                        >
                          <div className="truncate font-mono font-semibold">{b.reference}</div>
                          <div className="truncate text-[10px] opacity-90">{b.service}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Available open capacity slots */}
      {(scheduleQuery.data?.available_slots.length ?? 0) > 0 && (
        <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-3.5 shadow-[var(--op-shadow)]">
          <h2 className="mb-2 text-[13px] font-semibold text-[var(--op-text)]">Open Slot Capacity in Selected Day</h2>
          <div className="flex flex-wrap gap-2">
            {scheduleQuery.data?.available_slots.slice(0, 20).map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded border border-[var(--op-border)] bg-[var(--op-surface-alt)] px-2.5 py-1 text-[11px]"
              >
                <span className="font-mono font-semibold">{formatIstTime(s.start_at)}</span>
                <span>{s.package}</span>
                <StatusBadge status="ACTIVE" labelOverride={`${s.remaining} left`} />
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
