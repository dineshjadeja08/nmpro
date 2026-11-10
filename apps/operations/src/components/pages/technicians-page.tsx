"use client";

import type { OpsTechnician } from "@nammapros/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldAlert, Wrench } from "lucide-react";
import React, { useState } from "react";
import { DataTable, type OpsColumn } from "@/components/ops/ops-data-table";
import { DetailDrawer } from "@/components/ops/ops-detail-drawer";
import { useOpsUi } from "@/components/ops/ops-providers";
import { useBookingDrawer } from "@/components/ops/ops-shell";
import { ErrorState, PageHeader, Timeline } from "@/components/ops/ops-states";
import { StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatIstDateTime } from "@/lib/format";
import { useTableKeyboardShortcuts, useUrlDrawerParam } from "@/lib/hooks";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TechniciansPage() {
  const [techId, setTechId] = useUrlDrawerParam("technician");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const listQuery = useQuery({
    queryKey: ["ops", "technicians", q, page],
    queryFn: () => api.technicians({ q, page }),
    refetchInterval: 15_000,
  });

  const rows = listQuery.data?.results ?? [];

  useTableKeyboardShortcuts({
    rowCount: rows.length,
    selectedIndex,
    onChangeIndex: setSelectedIndex,
    onOpenRow: (idx) => {
      if (rows[idx]) setTechId(rows[idx].id);
    },
    drawerOpen: Boolean(techId),
    onCloseDrawer: () => setTechId(null),
  });

  const columns: OpsColumn<OpsTechnician>[] = [
    {
      key: "name",
      header: "Technician",
      render: (t) => <span className="font-semibold text-[var(--op-text)]">{t.name}</span>,
    },
    {
      key: "status",
      header: "Verification",
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: "online",
      header: "Availability",
      render: (t) => <StatusBadge status={t.online ? "ONLINE" : "OFFLINE"} />,
    },
    {
      key: "zones",
      header: "Zones",
      render: (t) => <span className="text-[12px]">{t.zones.join(", ") || "—"}</span>,
    },
    {
      key: "skills",
      header: "Verified Skills",
      render: (t) => <span className="text-[12px] text-[var(--op-muted)]">{t.skills.join(", ") || "—"}</span>,
    },
    {
      key: "active_jobs",
      header: "Active Jobs",
      align: "right",
      render: (t) => <span className="font-mono font-semibold">{t.active_jobs}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Technicians"
        subtitle="Field roster, zones, verified skills, and operator notes"
        actions={
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--op-muted)]" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search technician name..."
              className="h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] pl-8 pr-2.5 text-[12px]"
            />
          </div>
        }
      />

      {listQuery.isError ? (
        <ErrorState
          message={listQuery.error instanceof Error ? listQuery.error.message : "Could not load technicians."}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={listQuery.isLoading}
          selectedIndex={selectedIndex}
          activeRowId={techId}
          onRowClick={(r, idx) => {
            setSelectedIndex(idx);
            setTechId(r.id);
          }}
          emptyIcon={Wrench}
          emptyTitle="No technicians found"
          emptyMessage="Try clearing the search query or verifying pending technician partners in Admin."
          pagination={
            listQuery.data ? { page, count: listQuery.data.count, onPageChange: setPage } : undefined
          }
        />
      )}

      <TechnicianDrawer technicianId={techId} onClose={() => setTechId(null)} />
    </div>
  );
}

function TechnicianDrawer({ technicianId, onClose }: { technicianId: string | null; onClose: () => void }) {
  const { toast } = useOpsUi();
  const { openBookingDrawer } = useBookingDrawer();
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState("");

  const detailQuery = useQuery({
    queryKey: ["ops", "technician", technicianId],
    queryFn: () => api.technician(technicianId as string),
    enabled: Boolean(technicianId),
  });

  const noteMutation = useMutation({
    mutationFn: (text: string) => api.technicianNote(technicianId as string, text),
    onSuccess: () => {
      toast("success", "Note saved");
      setNoteText("");
      void queryClient.invalidateQueries({ queryKey: ["ops", "technician", technicianId] });
    },
    onError: (err) => {
      toast("error", "Failed to save note", err instanceof Error ? err.message : undefined);
    },
  });

  const tech = detailQuery.data;

  return (
    <DetailDrawer
      open={Boolean(technicianId)}
      onClose={onClose}
      title={
        tech ? (
          <>
            <span>{tech.name}</span>
            <StatusBadge status={tech.status} />
            <StatusBadge status={tech.online ? "ONLINE" : "OFFLINE"} />
          </>
        ) : (
          "Loading technician..."
        )
      }
    >
      {detailQuery.isLoading ? (
        <div className="h-32 animate-pulse rounded bg-[var(--op-border)]" />
      ) : detailQuery.isError ? (
        <ErrorState
          message={detailQuery.error instanceof Error ? detailQuery.error.message : "Could not load technician."}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : tech ? (
        <div className="space-y-4">
          <section className="rounded border border-[var(--op-border)] p-3 text-[12px] space-y-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">Profile</h3>
            <p>
              <strong>Zones:</strong> {tech.zones.join(", ") || "None assigned"}
            </p>
            <p>
              <strong>Verified Skills:</strong> {tech.skills.join(", ") || "None verified"}
            </p>
            <p>
              <strong>Active jobs:</strong> {tech.active_jobs}
            </p>
            <div className="flex items-start gap-2 rounded bg-[var(--op-surface-alt)] p-2 text-[11px] text-[var(--op-muted)]">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                Rating, acceptance rate, documents review, and suspend/reactivate controls require Admin endpoints (
                <code className="font-mono">/api/v1/admin/technicians/</code>).
              </span>
            </div>
          </section>

          <section className="rounded border border-[var(--op-border)] p-3 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Weekly Availability
            </h3>
            {(tech.availability?.length ?? 0) === 0 ? (
              <p className="text-[12px] text-[var(--op-muted)]">No weekly availability windows set.</p>
            ) : (
              <div className="grid gap-1 text-[12px]">
                {tech.availability?.map((w, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="font-medium">{WEEKDAYS[w.weekday] ?? `Day ${w.weekday}`}</span>
                    <span className="font-mono text-[var(--op-muted)]">
                      {Math.floor(w.start_minute / 60)}:{String(w.start_minute % 60).padStart(2, "0")} –{" "}
                      {Math.floor(w.end_minute / 60)}:{String(w.end_minute % 60).padStart(2, "0")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {(tech.time_off?.length ?? 0) > 0 && (
            <section className="rounded border border-[var(--op-border)] p-3 space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
                Time Off / Leaves
              </h3>
              {tech.time_off?.map((to, i) => (
                <div key={i} className="op-hatched rounded border border-[var(--op-border)] p-2 text-[12px]">
                  <div className="font-medium">
                    {formatIstDateTime(to.start_at)} → {formatIstDateTime(to.end_at)}
                  </div>
                  {to.reason && <div className="text-[11px] text-[var(--op-muted)]">{to.reason}</div>}
                </div>
              ))}
            </section>
          )}

          <section className="rounded border border-[var(--op-border)] p-3 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Recent & Upcoming Assignments
            </h3>
            {(tech.jobs?.length ?? 0) === 0 ? (
              <p className="text-[12px] text-[var(--op-muted)]">No assignments found.</p>
            ) : (
              <div className="divide-y divide-[var(--op-border)]">
                {tech.jobs?.map((j, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => openBookingDrawer(j.booking_id)}
                    className="flex w-full items-center justify-between py-1.5 text-left text-[12px] hover:text-[var(--op-brand)]"
                  >
                    <span className="font-mono">{formatIstDateTime(j.start_at)}</span>
                    <StatusBadge status={j.status} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded border border-[var(--op-border)] p-3 space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--op-muted)]">
              Operator Notes
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!noteText.trim()) return;
                noteMutation.mutate(noteText.trim());
              }}
              className="flex gap-2"
            >
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add internal note..."
                className="h-8 flex-1 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
              />
              <button
                type="submit"
                disabled={noteMutation.isPending || !noteText.trim()}
                className="h-8 rounded bg-[var(--op-brand)] px-3 text-[12px] font-semibold text-white hover:bg-[var(--op-brand-hover)] disabled:opacity-45"
              >
                Save
              </button>
            </form>
            <Timeline
              emptyText="No operator notes yet."
              items={(tech.notes ?? []).map((n, i) => ({
                id: String(i),
                title: n.text,
                timestamp: formatIstDateTime(n.at),
              }))}
            />
          </section>
        </div>
      ) : null}
    </DetailDrawer>
  );
}
