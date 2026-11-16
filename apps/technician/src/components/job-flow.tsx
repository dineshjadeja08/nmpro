"use client";

import Link from "next/link";
import QRCode from "qrcode";
import React, { useCallback, useEffect, useState } from "react";
import { api, type CollectInfo, type Job } from "../lib/api";
import { useI18n, type TextKey } from "../lib/i18n";
import { useLocationSharing } from "../lib/use-location-sharing";
import { Icon, Loading, mapsDirections, money, Notice, OPS_PHONE, StatusPill, useAction, when } from "./ui";

const STEPS: TextKey[] = ["stepTravel", "stepInspect", "stepQuote", "stepStart", "stepWork", "stepPay", "stepDone"];

function stepFor(job: Job, collect: CollectInfo | null, skipQuote: boolean) {
  const approved = job.quotations.some((q) => q.status === "APPROVED");
  switch (job.status) {
    case "ASSIGNED":
    case "EN_ROUTE":
      return 0;
    case "ARRIVED":
      return 1;
    case "INSPECTING":
      if (!job.inspection) return 1;
      return skipQuote && job.pricing_model === "FIXED_PRICE" ? 3 : 2;
    case "AWAITING_QUOTATION_APPROVAL":
      return approved ? 3 : 2;
    case "IN_PROGRESS":
      return 4;
    case "SERVICE_COMPLETED":
      return collect && collect.total_due_paise > 0 ? 5 : 6;
    default:
      return 0;
  }
}

export function JobFlow({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [collect, setCollect] = useState<CollectInfo | null>(null);
  const [skipQuote, setSkipQuote] = useState(false);
  const { busy, message, run } = useAction();

  const reload = useCallback(() => {
    api.job(id).then(setJob).catch(() => setJob(null));
    api.collectInfo(id).then(setCollect).catch(() => setCollect(null));
  }, [id]);
  useEffect(reload, [reload]);
  // While waiting for the customer's approval, check every 10 seconds.
  useEffect(() => {
    if (job?.status !== "AWAITING_QUOTATION_APPROVAL") return;
    const timer = window.setInterval(reload, 10000);
    return () => window.clearInterval(timer);
  }, [job?.status, reload]);

  const sharing = useLocationSharing(id, job?.status === "EN_ROUTE");

  if (job === undefined) return <Loading />;
  if (job === null) return <div className="empty">This job is not available. <Link href="/jobs">{t("allJobs")}</Link></div>;

  const step = stepFor(job, collect, skipQuote);
  const action = (name: string, body?: Record<string, string>) => run(() => api.jobAction(id, name, body), reload);
  const rejected = job.status === "INSPECTING" && job.quotations.some((q) => q.status === "REJECTED") && !job.quotations.some((q) => q.status === "SUBMITTED");

  return (
    <div className="stack">
      <Link href="/jobs" className="small muted">← {t("allJobs")}</Link>
      <div className="row"><StatusPill status={job.status} /><span className="small muted">{job.booking_reference}</span></div>
      <h1>{job.service}</h1>
      <p className="muted" style={{ margin: 0 }}>{job.package} · {when(job.start_at, lang)}</p>

      <div className="stepper" aria-hidden="true">
        {STEPS.map((s, i) => <span key={s} className={i < step ? "done" : i === step ? "now" : ""} />)}
      </div>
      <p className="step-label">{t("step")} {Math.min(step + 1, STEPS.length)} {t("of")} {STEPS.length} · {t(STEPS[step])}</p>

      <div className="card">
        <dl className="kv">
          <dt>{t("name")}</dt><dd>{job.customer.name}</dd>
          <dt>Address</dt><dd>{job.address.line_1}, {job.address.locality}, {job.address.city} {job.address.postal_code}{job.address.landmark ? ` (${job.address.landmark})` : ""}</dd>
          {job.problem_description ? <><dt>{t("issueReported")}</dt><dd>{job.problem_description}</dd></> : null}
        </dl>
        <div className="actions">
          <a className="btn ghost" href={mapsDirections(job)} target="_blank" rel="noopener noreferrer"><Icon name="nav" /> {t("navigate")}</a>
          <a className="btn ghost" href={`tel:${job.customer.phone}`}><Icon name="phone" /> {t("call")}</a>
        </div>
      </div>

      {!["SERVICE_COMPLETED", "CANCELLED"].includes(job.status) && <CustomerLocation job={job} />}

      <Notice message={message} />

      {step === 0 && (
        <section className="card">
          {job.status === "ASSIGNED" ? (
            <>
              <p>{t("startTripHint")}</p>
              <button className="btn block huge" disabled={busy} onClick={() => action("en-route")}><Icon name="nav" /> {t("startTrip")}</button>
            </>
          ) : (
            <>
              {sharing === "sharing" && <p className="message">● {t("sharingLocation")}</p>}
              {sharing === "denied" && <p className="message error">{t("locationDenied")}</p>}
              <button className="btn block huge" disabled={busy} onClick={() => action("arrived")}><Icon name="check" /> {t("arrivedBtn")}</button>
            </>
          )}
        </section>
      )}

      {step === 1 && (job.status === "ARRIVED" ? (
        <section className="card">
          <button className="btn block huge" disabled={busy} onClick={() => action("start-inspection")}>{t("startInspection")}</button>
        </section>
      ) : <InspectionForm job={job} onSaved={reload} />)}

      {step === 2 && (
        job.status === "AWAITING_QUOTATION_APPROVAL" ? (
          <section className="card">
            <p className="message warn">{t("waitingApproval")}</p>
            {job.quotations.filter((q) => q.status === "SUBMITTED").map((q) => <p key={q.id}><strong>{t("total")}: {money(q.total_paise)}</strong></p>)}
          </section>
        ) : (
          <>
            {rejected && <p className="message warn">{t("quoteRejected")}</p>}
            {job.pricing_model === "FIXED_PRICE" && (
              <section className="card">
                <button className="btn block huge ok" onClick={() => setSkipQuote(true)}><Icon name="check" /> {t("noExtraWork")}</button>
              </section>
            )}
            <QuoteBuilder job={job} onSent={reload} />
          </>
        )
      )}

      {step === 3 && <StartCode onStart={(otp) => action("start-work", { otp })} busy={busy} />}

      {step === 4 && <WorkAndFinish job={job} onDone={reload} />}

      {step === 5 && collect && <CollectPayment jobId={id} info={collect} onDone={reload} />}

      {step === 6 && (
        <section className="card" style={{ textAlign: "center" }}>
          <div className="big-number" aria-hidden="true">✓</div>
          <h2>{t("jobDone")}</h2>
          {collect?.total_due_paise === 0 && collect.payment_status === "PAID" && <p className="muted">{t("nothingDue")}</p>}
          <Link className="btn block" href="/dashboard">{t("backToToday")}</Link>
        </section>
      )}

      {OPS_PHONE && <a className="btn ghost block" href={`tel:${OPS_PHONE}`}><Icon name="phone" /> {t("helpBtn")}</a>}
    </div>
  );
}

function InspectionForm({ job, onSaved }: { job: Job; onSaved: () => void }) {
  const { t } = useI18n();
  const [issue, setIssue] = useState(job.problem_description ?? "");
  const [diagnosis, setDiagnosis] = useState("");
  const [work, setWork] = useState("");
  const { busy, message, run } = useAction();
  return (
    <section className="card stack">
      <h2>{t("stepInspect")}</h2>
      <label className="field">{t("issueReported")}<textarea value={issue} onChange={(e) => setIssue(e.target.value)} /></label>
      <label className="field">{t("diagnosis")}<textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></label>
      <label className="field">{t("workRecommended")}<textarea value={work} onChange={(e) => setWork(e.target.value)} /></label>
      <Notice message={message} />
      <button className="btn block huge" disabled={busy || !issue.trim() || !diagnosis.trim() || !work.trim()}
        onClick={() => run(() => api.inspect(job.id, { reported_issue: issue, diagnosis, work_recommended: work }), onSaved)}>{t("saveInspection")}</button>
    </section>
  );
}

function QuoteBuilder({ job, onSent }: { job: Job; onSent: () => void }) {
  const { t } = useI18n();
  const [labour, setLabour] = useState("");
  const [parts, setParts] = useState<{ description: string; price: string }[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const { busy, message, run } = useAction();
  const rupees = (v: string) => Math.max(0, Math.round(Number(v || 0) * 100));
  const total = rupees(labour) + parts.reduce((s, p) => s + rupees(p.price), 0);
  return (
    <section className="card stack">
      <h2>{t("needExtraWork")}</h2>
      <label className="field">{t("labour")}<input inputMode="decimal" value={labour} onChange={(e) => setLabour(e.target.value.replace(/[^\d.]/g, ""))} /></label>
      {parts.map((p, i) => (
        <div className="row" key={i}>
          <span>{p.description}</span>
          <span><strong>{money(rupees(p.price))}</strong> <button className="btn ghost" style={{ minHeight: 40 }} onClick={() => setParts(parts.filter((_, n) => n !== i))}>{t("remove")}</button></span>
        </div>
      ))}
      <div className="grid2">
        <label className="field">{t("partName")}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">{t("partPrice")}<input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} /></label>
      </div>
      <button className="btn secondary block" disabled={!name.trim() || !price} onClick={() => { setParts([...parts, { description: name.trim(), price }]); setName(""); setPrice(""); }}>+ {t("addPart")}</button>
      <p className="row"><span>{t("total")}</span><strong className="big-number" style={{ fontSize: 26 }}>{money(total)}</strong></p>
      <Notice message={message} />
      <button className="btn block huge" disabled={busy || total <= 0} onClick={() => run(() => api.quotation(job.id, {
        labour_paise: rupees(labour),
        items: parts.map((p) => ({ description: p.description, quantity: 1, unit_paise: rupees(p.price) })),
        valid_until: new Date(Date.now() + 24 * 3600000).toISOString(),
      }), onSent)}>{t("sendQuote")}</button>
    </section>
  );
}

function StartCode({ onStart, busy }: { onStart: (otp: string) => void; busy: boolean }) {
  const { t } = useI18n();
  const [otp, setOtp] = useState("");
  return (
    <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (otp.length === 4) onStart(otp); }}>
      <h2>{t("stepStart")}</h2>
      <p>{t("askCode")}</p>
      <label className="field">{t("startCode")}
        <input className="otp-input" inputMode="numeric" autoComplete="off" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
      </label>
      <button className="btn block huge" disabled={busy || otp.length !== 4}>{t("startWork")}</button>
    </form>
  );
}

function WorkAndFinish({ job, onDone }: { job: Job; onDone: () => void }) {
  const { t } = useI18n();
  const [uploaded, setUploaded] = useState<{ BEFORE: boolean; AFTER: boolean }>({ BEFORE: false, AFTER: false });
  const items: TextKey[] = ["chkWork", "chkClean", "chkInformed"];
  const [checked, setChecked] = useState<TextKey[]>([]);
  const [partsUsed, setPartsUsed] = useState("");
  const [notes, setNotes] = useState("");
  const { busy, message, run } = useAction();
  const upload = (kind: "BEFORE" | "AFTER", file?: File | null) =>
    file && run(() => api.upload(kind, file, job.id), () => setUploaded((u) => ({ ...u, [kind]: true })), t("photoAdded"));
  return (
    <>
      <section className="card stack">
        <h2>{t("photosTitle")}</h2>
        <div className="photo-grid">
          {(["BEFORE", "AFTER"] as const).map((kind) => (
            <label key={kind} className={`photo-btn ${uploaded[kind] ? "done" : ""}`}>
              <Icon name={uploaded[kind] ? "check" : "camera"} size={28} />
              {t(kind === "BEFORE" ? "before" : "after")}
              <input className="sr-only" type="file" accept="image/jpeg,image/png" capture="environment" onChange={(e) => upload(kind, e.target.files?.[0])} />
            </label>
          ))}
        </div>
      </section>
      <section className="card stack">
        <h2>{t("checklist")}</h2>
        {items.map((k) => (
          <label key={k} className="checkbox">
            <input type="checkbox" checked={checked.includes(k)} onChange={(e) => setChecked(e.target.checked ? [...checked, k] : checked.filter((x) => x !== k))} />
            {t(k)}
          </label>
        ))}
        <label className="field">{t("partsUsed")}<textarea value={partsUsed} onChange={(e) => setPartsUsed(e.target.value)} /></label>
        <label className="field">{t("workNotes")}<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <Notice message={message} />
        <button className="btn block huge ok" disabled={busy || checked.length !== items.length || !notes.trim()}
          onClick={() => run(() => api.complete(job.id, { checklist: items.map((k) => t(k)), parts_used: partsUsed, work_notes: notes }), onDone)}>
          <Icon name="check" /> {t("finishJob")}
        </button>
      </section>
    </>
  );
}

function CollectPayment({ jobId, info, onDone }: { jobId: string; info: CollectInfo; onDone: () => void }) {
  const { t } = useI18n();
  const [method, setMethod] = useState<"CASH" | "UPI">(info.upi_uri ? "UPI" : "CASH");
  const [qr, setQr] = useState("");
  const [ref, setRef] = useState("");
  const { busy, message, run } = useAction();
  useEffect(() => {
    if (!info.upi_uri) return;
    QRCode.toDataURL(info.upi_uri, { width: 480, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [info.upi_uri]);
  return (
    <section className="card stack">
      <h2>{t("amountDue")}</h2>
      <p className="big-number">{money(info.total_due_paise)}</p>
      <dl className="kv">
        {info.service_due_paise > 0 && <><dt>{t("serviceAmount")}</dt><dd>{money(info.service_due_paise)}</dd></>}
        {info.extra_work_due_paise > 0 && <><dt>{t("extraWork")}</dt><dd>{money(info.extra_work_due_paise)}</dd></>}
      </dl>
      <div className="grid2" role="radiogroup" aria-label="Payment method">
        {(["UPI", "CASH"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={method === m} className={`btn ${method === m ? "" : "ghost"}`} onClick={() => setMethod(m)}>{t(m === "UPI" ? "upi" : "cash")}</button>
        ))}
      </div>
      {method === "UPI" && (info.upi_uri ? (
        <>
          <p>{t("scanToPay")}</p>
          <div className="qr-box">{qr ? <img src={qr} alt={`UPI QR code to pay ${money(info.total_due_paise)} to ${info.upi_payee}`} /> : <Loading />}</div>
          <p className="small muted" style={{ textAlign: "center" }}>{info.upi_payee}</p>
          <label className="field">{t("upiRef")}<input inputMode="numeric" maxLength={40} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        </>
      ) : <p className="message warn">{t("upiNotSet")}</p>)}
      <Notice message={message} />
      <button className="btn block huge ok" disabled={busy || (method === "UPI" && !info.upi_uri)}
        onClick={() => run(() => api.collect(jobId, method, info.total_due_paise, ref), onDone, t("collectedOk"))}>
        <Icon name="check" /> {t(method === "UPI" ? "confirmUpi" : "confirmCash")}
      </button>
    </section>
  );
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Map of the customer's pinned location, shown once the job is assigned. */
function CustomerLocation({ job }: { job: Job }) {
  const { t } = useI18n();
  const lat = job.address.latitude;
  const lng = job.address.longitude;
  const [km, setKm] = useState<number | null>(null);
  const [locError, setLocError] = useState("");
  const hasPin = lat != null && lng != null;

  const measure = () => {
    if (!navigator.geolocation || !hasPin) return;
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => setKm(distanceKm({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { lat: lat!, lng: lng! })),
      (err) => setLocError(err.code === err.PERMISSION_DENIED ? t("locationDenied") : t("retry")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };
  useEffect(() => {
    if (!hasPin || !navigator.permissions) return;
    navigator.permissions.query({ name: "geolocation" as PermissionName })
      .then((p) => { if (p.state === "granted") measure(); })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPin, lat, lng]);

  if (!hasPin) {
    return (
      <section className="card" aria-labelledby="cust-loc">
        <h2 id="cust-loc">{t("customerLocation")}</h2>
        <p className="muted small" style={{ margin: 0 }}>{t("noPinnedLocation")}</p>
      </section>
    );
  }
  const d = 0.006;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${lng! - d},${lat! - d},${lng! + d},${lat! + d}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <section className="card stack" aria-labelledby="cust-loc">
      <div className="row">
        <h2 id="cust-loc" style={{ margin: 0 }}>{t("customerLocation")}</h2>
        {km != null && <strong>{km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} {t("awayFromYou")}</strong>}
      </div>
      <iframe
        title={`${t("customerLocation")}: ${job.address.locality}`}
        src={embed}
        loading="lazy"
        style={{ width: "100%", height: 220, border: 0, borderRadius: 14 }}
        referrerPolicy="no-referrer"
      />
      {locError && <p className="message error">{locError}</p>}
      <div className="actions">
        <a className="btn" href={mapsDirections(job)} target="_blank" rel="noopener noreferrer"><Icon name="nav" /> {t("navigate")}</a>
        {km == null && <button type="button" className="btn ghost" onClick={measure}>{t("showMyDistance")}</button>}
      </div>
    </section>
  );
}
