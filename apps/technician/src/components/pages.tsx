"use client";

import React, { useEffect, useMemo, useState } from "react";
import { api, downloadFile, type EarningsReport, type Job } from "../lib/api";
import { useI18n, type TextKey } from "../lib/i18n";
import { Icon, label, Loading, money, Notice, OPS_PHONE, useAction } from "./ui";

type Period = "day" | "month" | "custom";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function EarningsPage() {
  const { t, lang } = useI18n();
  const today = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState<Period>("month");
  const [day, setDay] = useState(iso(today));
  const [month, setMonth] = useState(iso(today).slice(0, 7));
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(iso(today));
  const [report, setReport] = useState<EarningsReport | null>(null);
  const [error, setError] = useState("");
  const { busy, message, run } = useAction();

  const params = useMemo<Record<string, string>>(() => (
    period === "day" ? { period, date: day } : period === "month" ? { period, month } : { period, from, to }
  ), [period, day, month, from, to]);

  useEffect(() => {
    if (period === "custom" && (!from || !to || to < from)) return;
    let active = true;
    setError("");
    api.earningsReport(params).then((r) => active && setReport(r)).catch((e) => active && setError(e.message));
    return () => { active = false; };
  }, [params, period, from, to]);

  const max = Math.max(1, ...(report?.buckets.map((b) => b.amount_paise) ?? [1]));
  const fmtBucket = (l: string) => new Date(l).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN",
    report?.bucket === "month" ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  const periods: [Period, TextKey][] = [["day", "periodDay"], ["month", "periodMonth"], ["custom", "periodCustom"]];

  return (
    <div className="stack">
      <h1>{t("earnings")}</h1>
      <div className="grid2" role="tablist" aria-label={t("earnings")} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {periods.map(([p, k]) => (
          <button key={p} role="tab" aria-selected={period === p} className={`btn ${period === p ? "" : "ghost"}`} onClick={() => setPeriod(p)}>{t(k)}</button>
        ))}
      </div>
      <div className="card">
        {period === "day" && <label className="field">{t("date")}<input type="date" value={day} max={iso(today)} onChange={(e) => setDay(e.target.value)} /></label>}
        {period === "month" && <label className="field">{t("month")}<input type="month" value={month} max={iso(today).slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /></label>}
        {period === "custom" && (
          <div className="grid2">
            <label className="field">{t("from")}<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field">{t("to")}<input type="date" value={to} min={from} max={iso(today)} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        )}
      </div>
      {error && <p className="message error" role="alert">{error}</p>}
      {!report ? <Loading /> : (
        <>
          <div className="card">
            <span className="muted small">{t("collected")} · {report.jobs} {t("jobs").toLowerCase()}</span>
            <div className="big-number">{money(report.totals.ALL)}</div>
            <dl className="kv" style={{ marginTop: 8 }}>
              <dt>{t("cash")}</dt><dd>{money(report.totals.CASH)}</dd>
              <dt>{t("upi")}</dt><dd>{money(report.totals.UPI)}</dd>
            </dl>
          </div>
          {report.buckets.length > 1 && (
            <div className="card" aria-label={t("earnings")}>
              {report.buckets.map((b) => (
                <div key={b.label} style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 10, alignItems: "center", margin: "6px 0" }}>
                  <span className="small muted">{fmtBucket(b.label)}</span>
                  <span style={{ height: 12, borderRadius: 99, background: "var(--rose)", overflow: "hidden" }} aria-hidden="true">
                    <span style={{ display: "block", height: "100%", width: `${(b.amount_paise * 100) / max}%`, background: "var(--wine)" }} />
                  </span>
                  <strong className="small">{money(b.amount_paise)}</strong>
                </div>
              ))}
            </div>
          )}
          <Notice message={message} />
          <button className="btn secondary block" disabled={busy}
            onClick={() => run(() => downloadFile(api.statementPath(params), `nammapros-collections-${report.from}-to-${report.to}.pdf`))}>
            {t("downloadStatement")}
          </button>
          <h2 className="section-title">{t("history")}</h2>
          {report.rows.length ? report.rows.map((row) => (
            <div className="card row" key={row.id}>
              <div><strong>{row.service}</strong><br /><span className="muted small">{row.date} · {row.booking_reference} · {t(row.method === "UPI" ? "upi" : "cash")}</span></div>
              <strong>{money(row.amount_paise)}</strong>
            </div>
          )) : <div className="empty">—</div>}
        </>
      )}
    </div>
  );
}

export function InvoicesPage() {
  const { t, lang } = useI18n();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const { busy, message, run } = useAction();
  useEffect(() => { api.jobs().then((r) => setJobs(r.jobs.filter((j) => j.status === "SERVICE_COMPLETED"))).catch(() => setJobs([])); }, []);
  return (
    <div className="stack">
      <h1>{t("receipts")}</h1>
      <Notice message={message} />
      {jobs === null ? <Loading /> : jobs.length ? jobs
        .sort((a, b) => +new Date(b.start_at) - +new Date(a.start_at))
        .map((job) => (
          <div className="card" key={job.id}>
            <div className="row">
              <strong>{job.service}</strong>
              <span className="small muted">{new Date(job.start_at).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
            <p className="muted small" style={{ margin: "4px 0 0" }}>{job.booking_reference} · {job.address.locality}</p>
            {job.receipt_available ? (
              <button className="btn secondary block" style={{ marginTop: 10 }} disabled={busy}
                onClick={() => run(() => downloadFile(api.receiptPath(job.id), `${job.booking_reference}-receipt.pdf`))}>
                {t("downloadReceipt")}
              </button>
            ) : <p className="small muted" style={{ margin: "10px 0 0" }}>{t("receiptNotReady")}</p>}
          </div>
        )) : <div className="empty">{t("noInvoices")}</div>}
      {OPS_PHONE && <a className="btn ghost block" href={`tel:${OPS_PHONE}`}><Icon name="phone" /> {t("helpBtn")}</a>}
    </div>
  );
}
