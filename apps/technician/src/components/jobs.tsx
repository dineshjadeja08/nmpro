"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { api, type Job, type JoiningFee } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Icon, isToday, Loading, mapsDirections, StatusPill, timeOnly } from "./ui";

const DONE = ["SERVICE_COMPLETED", "CANCELLED"];

function JobCard({ job }: { job: Job }) {
  const { t, lang } = useI18n();
  const day = isToday(job.start_at) ? t("today")
    : new Date(job.start_at).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="card">
      <div className="row">
        <StatusPill status={job.status} />
        <strong>{day} · {timeOnly(job.start_at, lang)}</strong>
      </div>
      <h3 style={{ marginTop: 10 }}>{job.service}</h3>
      <p className="muted" style={{ margin: 0 }}>{job.package} · {job.address.locality}, {job.address.city}</p>
      <div className="actions">
        {!DONE.includes(job.status) && (
          <>
            <a className="btn ghost" href={mapsDirections(job)} target="_blank" rel="noopener noreferrer"><Icon name="nav" /> {t("navigate")}</a>
            <a className="btn ghost" href={`tel:${job.customer.phone}`}><Icon name="phone" /> {t("call")}</a>
          </>
        )}
        <Link className="btn" href={`/jobs/${job.id}`}>{t("open")}</Link>
      </div>
    </div>
  );
}

export function JobsList({ name }: { name: string }) {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [tab, setTab] = useState<"upcoming" | "completed">("upcoming");
  const load = useCallback(() => { api.jobs().then((r) => setJobs(r.jobs)).catch(() => setJobs([])); }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);
  const list = (jobs ?? []).filter((j) => (tab === "completed" ? DONE.includes(j.status) : !DONE.includes(j.status)))
    .sort((a, b) => (tab === "completed" ? -1 : 1) * (+new Date(a.start_at) - +new Date(b.start_at)));
  const todayCount = (jobs ?? []).filter((j) => !DONE.includes(j.status) && isToday(j.start_at)).length;
  const [fee, setFee] = useState<JoiningFee | null>(null);
  useEffect(() => { api.joiningFee().then(setFee).catch(() => setFee(null)); }, []);
  const endsSoon = fee?.valid_until ? new Date(fee.valid_until).getTime() - Date.now() < 30 * 86400000 : false;
  return (
    <div className="stack">
      <h1>{t("hello")}, {name.split(" ")[0]}</h1>
      <div className="card row">
        <span className="muted">{t("todaysJobs")}</span>
        <span className="big-number">{todayCount}</span>
      </div>
      {fee && (
        <div className="card">
          <div className="row">
            <strong>{t("membership")}</strong>
            {fee.valid_until && <span className="small muted">{t("validUntil")} {new Date(fee.valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>}
          </div>
          <p className="small" style={{ margin: "6px 0 0" }}>{t("leadsThisYear")}: <strong>{fee.leads_this_year}{fee.leads_per_year ? ` / ${fee.leads_per_year}` : ""}</strong></p>
          {(fee.renewal_due || (fee.membership_active && endsSoon)) && (
            <>
              <p className="message warn">{fee.renewal_due ? t("membershipExpired") : t("membershipEndingSoon")}</p>
              {fee.renewal_due && <Link className="btn block" href="/fee">{t("renew")}</Link>}
            </>
          )}
        </div>
      )}
      <div className="grid2" role="tablist" aria-label={t("jobs")}>
        {(["upcoming", "completed"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn ${tab === k ? "" : "ghost"}`} onClick={() => setTab(k)}>{t(k)}</button>
        ))}
      </div>
      {jobs === null ? <Loading /> : list.length ? list.map((j) => <JobCard key={j.id} job={j} />) : <div className="empty">{t("noJobs")}</div>}
    </div>
  );
}
