"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import React, { useState } from "react";
import { ActionDialog } from "@/components/ops/ops-action-dialog";
import { useOpsUi } from "@/components/ops/ops-providers";
import { ErrorState, PageHeader } from "@/components/ops/ops-states";
import { StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatStatusLabel } from "@/lib/status";

export function SettingsPage() {
  const { toast, theme, setTheme, showShortcutHints, setShowShortcutHints } = useOpsUi();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["ops", "settings"],
    queryFn: () => api.settings(),
  });

  const [editMode, setEditMode] = useState(false);
  const [confirmDispatchOpen, setConfirmDispatchOpen] = useState(false);

  const [name, setName] = useState("Standard dispatch");
  const [active, setActive] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(15);
  const [attempts, setAttempts] = useState(3);
  const [buffer, setBuffer] = useState(30);
  const [workload, setWorkload] = useState(10);
  const [availability, setAvailability] = useState(10);

  function openEditMode() {
    const d = settingsQuery.data?.dispatch;
    if (d) {
      setName(d.name);
      setActive(d.is_active);
      setAutomatic(d.automatic_enabled);
      setTimeoutMinutes(d.offer_timeout_minutes);
      setAttempts(d.maximum_attempts);
      setBuffer(d.travel_buffer_minutes);
      setWorkload(d.weight_workload);
      setAvailability(d.weight_availability);
    }
    setEditMode(true);
  }

  const saveDispatchMutation = useMutation({
    mutationFn: () =>
      api.saveSettings({
        kind: "dispatch",
        name,
        is_active: active,
        automatic_enabled: automatic,
        offer_timeout_minutes: timeoutMinutes,
        maximum_attempts: attempts,
        travel_buffer_minutes: buffer,
        weight_workload: workload,
        weight_availability: availability,
      }),
    onSuccess: () => {
      toast("success", "Dispatch rule updated");
      setConfirmDispatchOpen(false);
      setEditMode(false);
      void queryClient.invalidateQueries({ queryKey: ["ops", "settings"] });
    },
    onError: (err) => {
      toast("error", "Could not save dispatch rule", err instanceof Error ? err.message : undefined);
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operations Settings"
        subtitle="Dispatch configuration, active SLA targets, and personal workspace preferences"
      />

      {settingsQuery.isError && (
        <ErrorState
          message={settingsQuery.error instanceof Error ? settingsQuery.error.message : "Could not load settings."}
          onRetry={() => void settingsQuery.refetch()}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Dispatch Rule */}
        <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[var(--op-text)]">Active Dispatch Rule</h2>
            <button
              type="button"
              onClick={() => (editMode ? setEditMode(false) : openEditMode())}
              className="rounded border border-[var(--op-border)] px-2.5 py-1 text-[12px] font-semibold hover:border-[var(--op-brand)]"
            >
              {editMode ? "Read-only view" : "Edit (Manager)"}
            </button>
          </div>

          {!editMode ? (
            settingsQuery.data?.dispatch ? (
              <dl className="divide-y divide-[var(--op-border)] text-[12px]">
                <div className="flex justify-between py-2">
                  <dt className="text-[var(--op-muted)]">Rule name</dt>
                  <dd className="font-semibold">{settingsQuery.data.dispatch.name}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-[var(--op-muted)]">Rule status</dt>
                  <dd>
                    <StatusBadge status={settingsQuery.data.dispatch.is_active ? "ACTIVE" : "INACTIVE"} />
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-[var(--op-muted)]">Automatic dispatch</dt>
                  <dd className="font-semibold">
                    {settingsQuery.data.dispatch.automatic_enabled ? "Enabled" : "Disabled (Manual)"}
                  </dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-[var(--op-muted)]">Offer timeout</dt>
                  <dd className="font-mono">{settingsQuery.data.dispatch.offer_timeout_minutes} min</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-[var(--op-muted)]">Max offer attempts</dt>
                  <dd className="font-mono">{settingsQuery.data.dispatch.maximum_attempts}</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-[var(--op-muted)]">Travel buffer</dt>
                  <dd className="font-mono">{settingsQuery.data.dispatch.travel_buffer_minutes} min</dd>
                </div>
                <div className="flex justify-between py-2">
                  <dt className="text-[var(--op-muted)]">Ranking weights (Availability / Workload)</dt>
                  <dd className="font-mono">
                    {settingsQuery.data.dispatch.weight_availability} / {settingsQuery.data.dispatch.weight_workload}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-[12px] text-[var(--op-muted)]">No active dispatch rule configured.</p>
            )
          ) : (
            <div className="space-y-2.5 text-[12px]">
              <label className="block font-semibold">
                Rule Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2"
                />
              </label>
              <div className="flex gap-4">
                <label className="inline-flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Active rule
                </label>
                <label className="inline-flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={automatic} onChange={(e) => setAutomatic(e.target.checked)} />
                  Automatic offers
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="font-semibold">
                  Offer timeout (min)
                  <input
                    type="number"
                    min="1"
                    value={timeoutMinutes}
                    onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
                    className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2"
                  />
                </label>
                <label className="font-semibold">
                  Max attempts
                  <input
                    type="number"
                    min="1"
                    value={attempts}
                    onChange={(e) => setAttempts(Number(e.target.value))}
                    className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2"
                  />
                </label>
                <label className="font-semibold">
                  Travel buffer (min)
                  <input
                    type="number"
                    min="0"
                    value={buffer}
                    onChange={(e) => setBuffer(Number(e.target.value))}
                    className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2"
                  />
                </label>
                <label className="font-semibold">
                  Availability weight
                  <input
                    type="number"
                    min="0"
                    value={availability}
                    onChange={(e) => setAvailability(Number(e.target.value))}
                    className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2"
                  />
                </label>
                <label className="font-semibold">
                  Workload weight
                  <input
                    type="number"
                    min="0"
                    value={workload}
                    onChange={(e) => setWorkload(Number(e.target.value))}
                    className="mt-1 h-8 w-full rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDispatchOpen(true)}
                className="rounded bg-[var(--op-brand)] px-3.5 py-1.5 font-semibold text-white hover:bg-[var(--op-brand-hover)]"
              >
                Save Dispatch Settings
              </button>
            </div>
          )}
        </section>

        {/* SLA Policies + Personal Preferences */}
        <div className="space-y-4">
          <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)] space-y-2.5">
            <h2 className="text-[14px] font-semibold text-[var(--op-text)]">Configured SLA Policies</h2>
            {(settingsQuery.data?.sla.length ?? 0) === 0 ? (
              <p className="text-[12px] text-[var(--op-muted)]">No SLA policies configured in `/operations/settings/`.</p>
            ) : (
              <div className="divide-y divide-[var(--op-border)] text-[12px]">
                {settingsQuery.data?.sla.map((p) => (
                  <div key={p.code} className="flex items-center justify-between py-2">
                    <div>
                      <span className="font-semibold">{formatStatusLabel(p.code)}</span>
                      <span className="ml-2 text-[var(--op-muted)]">
                        Target {p.duration_minutes}m · Warning {p.warning_minutes}m
                      </span>
                    </div>
                    <StatusBadge status={p.is_active ? "ACTIVE" : "INACTIVE"} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-[var(--op-border)] bg-[var(--op-surface)] p-4 shadow-[var(--op-shadow)] space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[var(--op-brand)]" />
              <h2 className="text-[14px] font-semibold text-[var(--op-text)]">Personal Control Room Preferences</h2>
            </div>
            <div className="space-y-2 text-[13px]">
              <label className="flex items-center justify-between gap-2">
                <span>Color theme</span>
                <select
                  aria-label="Theme preference"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as "light" | "dark")}
                  className="h-8 rounded border border-[var(--op-border)] bg-[var(--op-surface)] px-2 text-[12px]"
                >
                  <option value="light">Neutral Light (#F7F7F8)</option>
                  <option value="dark">Control Room Dark</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Show keyboard shortcut hints in subtitles</span>
                <input
                  type="checkbox"
                  checked={showShortcutHints}
                  onChange={(e) => setShowShortcutHints(e.target.checked)}
                  className="h-4 w-4 accent-[var(--op-brand)]"
                />
              </label>
            </div>
          </section>
        </div>
      </div>

      <ActionDialog
        open={confirmDispatchOpen}
        busy={saveDispatchMutation.isPending}
        title="Confirm Dispatch Rule Update"
        description="Saving creates a new active DispatchRule version for operations."
        confirmLabel="Save Rule"
        onClose={() => setConfirmDispatchOpen(false)}
        onConfirm={async () => {
          await saveDispatchMutation.mutateAsync();
        }}
      />
    </div>
  );
}
