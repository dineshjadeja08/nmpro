"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { api, type JoinOptions, type Profile } from "../lib/api";
import { useI18n, type TextKey } from "../lib/i18n";
import { label, Notice, useAction } from "./ui";

export function Welcome() {
  const { t } = useI18n();
  return (
    <div className="auth">
      <div className="card stack">
        <div className="brand" style={{ color: "var(--wine)" }}>NammaPros<small style={{ color: "var(--muted)" }}>{t("appName")}</small></div>
        <h1>{t("welcomeTitle")}</h1>
        <p className="muted">{t("welcomeHint")}</p>
        <Link className="btn block huge" href="/login">{t("loginOtp")}</Link>
        <Link className="btn secondary block huge" href="/join">{t("requestJoin")}</Link>
      </div>
    </div>
  );
}

export function Login() {
  const router = useRouter();
  const { t } = useI18n();
  const [phone, setPhone] = useState("+91");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const { busy, message, run } = useAction();
  return (
    <div className="auth">
      <form className="card stack" onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          if (!challenge) {
            const result = await api.otpRequest(phone.replace(/\s/g, ""));
            setChallenge(result.challenge_id);
            setDevCode(result.development_code ?? "");
          } else {
            await api.otpVerify(phone.replace(/\s/g, ""), challenge, code);
            router.replace("/jobs");
          }
        });
      }}>
        <h1>{t("welcomeBack")}</h1>
        <p className="muted">{t("signInHint")}</p>
        <label className="field">{t("phone")}<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" disabled={Boolean(challenge)} /></label>
        {challenge && (
          <label className="field">{t("code")}
            <input className="otp-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus />
          </label>
        )}
        {devCode && <p className="message warn">Development code: {devCode}</p>}
        <Notice message={message} />
        <button className="btn block huge" disabled={busy}>{busy ? t("loading") : challenge ? t("verifyCode") : t("sendCode")}</button>
        {challenge && <button type="button" className="btn ghost block" onClick={() => { setChallenge(""); setCode(""); setDevCode(""); }}>{t("otherNumber")}</button>}
        <Link className="btn ghost block" href="/join">{t("requestJoin")}</Link>
      </form>
    </div>
  );
}

/** Progress across the four onboarding steps: about you, documents, joining fee, review. */
export function OnboardingSteps({ step }: { step: 1 | 2 | 3 | 4 }) {
  const { t } = useI18n();
  const names: TextKey[] = ["stepAbout", "stepDocs", "stepFee", "stepReview"];
  return (
    <ol className="steps" aria-label={t("joinProgress")}>
      {names.map((key, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "now" : "todo";
        return (
          <li key={key} className={`step ${state}`} aria-current={n === step ? "step" : undefined}>
            <span className="step-dot">{n < step ? "✓" : n}</span>
            <span className="step-name">{t(key)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** "AC_SPECIALIST" → "AC", "WATER_TANK_CLEANING_SPECIALIST" → "Water tank cleaning". */
function serviceName(code: string) {
  const words = code.replace(/_SPECIALIST$/, "").toLowerCase().split("_").filter(Boolean);
  const text = words.join(" ");
  return text.replace(/\b(ac|tv|cctv)\b/g, (w) => w.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
}

type DocKey = "aadhaar_front" | "aadhaar_back" | "pan" | "photo";
const MAX_FILE = 5 * 1024 * 1024;

function DocTile({ id, label: text, file, onPick, photo = false }: {
  id: string; label: string; file: File | null; onPick: (f: File | null) => void; photo?: boolean;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const timer = window.setTimeout(() => setPreview(url), 0);
    return () => { window.clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file]);
  const isImage = Boolean(file && file.type.startsWith("image/") && preview);
  return (
    <label className={`doc-tile ${file ? "has-file" : ""}`} htmlFor={id}>
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="doc-preview" />
      ) : (
        <span className="doc-icon" aria-hidden="true">{file ? "✓" : photo ? "👤" : "🪪"}</span>
      )}
      <span className="doc-text">{file ? `${file.name.slice(0, 22)} · ${t("change")}` : `+ ${text}`}</span>
      <input id={id} className="sr-only" type="file"
        accept={photo ? "image/jpeg,image/png" : ".pdf,.jpg,.jpeg,.png,image/jpeg,image/png"}
        capture={photo ? "user" : "environment"}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </label>
  );
}

export function JoinRequest() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [options, setOptions] = useState<JoinOptions | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+91");
  const [city, setCity] = useState("");
  const [years, setYears] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [docs, setDocs] = useState<Record<DocKey, File | null>>({ aadhaar_front: null, aadhaar_back: null, pan: null, photo: null });
  const [consent, setConsent] = useState(false);
  const [fileError, setFileError] = useState("");
  const { busy, message, run } = useAction();
  useEffect(() => { api.joinOptions().then(setOptions).catch(() => setOptions({ skills: [], zones: [] })); }, []);
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

  const cities = Array.from(new Set((options?.zones ?? []).map((z) => z.city))).sort();
  const cityZones = (options?.zones ?? []).filter((z) => z.city === city);
  const phoneOk = /^\+?\d[\d\s]{9,14}$/.test(phone.trim());
  const aboutDone = Boolean(name.trim() && phoneOk && city.trim() && skills.length > 0
    && (cityZones.length === 0 || zones.length > 0) && challenge && code.length >= 4);
  const docsDone = Boolean(docs.aadhaar_front && docs.aadhaar_back && docs.pan && docs.photo && consent);

  const pick = (key: DocKey) => (file: File | null) => {
    if (file && file.size > MAX_FILE) {
      setFileError(t("fileTooBig"));
      return;
    }
    setFileError("");
    setDocs((d) => ({ ...d, [key]: file }));
  };

  const submit = () => {
    const form = new FormData();
    form.append("name", name.trim());
    form.append("phone", phone.replace(/\s/g, ""));
    form.append("city", city.trim());
    form.append("experience_years", years || "0");
    form.append("skills", skills.join(","));
    form.append("zone_ids", zones.join(","));
    form.append("consent", consent ? "true" : "false");
    form.append("challenge_id", challenge);
    form.append("code", code);
    (Object.keys(docs) as DocKey[]).forEach((key) => { const f = docs[key]; if (f) form.append(key, f); });
    void run(async () => {
      await api.joinRequest(form);
      router.replace("/fee");
    });
  };

  return (
    <div className="auth">
      <div className="card stack onboarding">
        <h1 className="onb-title">{step === 1 ? t("joinHeadline") : t("docsHeadline")}</h1>
        <p className="muted">{step === 1 ? t("joinSub") : t("docsSub")}</p>
        <OnboardingSteps step={step} />

        {step === 1 ? (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (aboutDone) setStep(2); }}>
            <h2>{t("tellUs")}</h2>
            <label className="field">{t("name")}<input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={t("namePlaceholder")} /></label>
            <fieldset className="field plain">
              <legend>{t("verifyPhone")}</legend>
              <label className="field">{t("phone")}<input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" disabled={Boolean(challenge)} /></label>
              {!challenge ? (
                <button type="button" className="btn secondary block" disabled={busy || !phoneOk}
                  onClick={() => run(async () => {
                    const r = await api.joinOtp(phone.replace(/\s/g, ""));
                    setChallenge(r.challenge_id);
                    setDevCode(r.development_code ?? "");
                  })}>{t("sendCode")}</button>
              ) : (
                <>
                  <p className="small muted" style={{ margin: 0 }}>{t("codeSentTo")} {phone}</p>
                  <label className="field">{t("code")}
                    <input className="otp-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                  </label>
                  {devCode && <p className="message warn">Development code: {devCode}</p>}
                  <button type="button" className="btn ghost" onClick={() => { setChallenge(""); setCode(""); setDevCode(""); }}>{t("changeNumber")}</button>
                </>
              )}
            </fieldset>
            <fieldset className="field plain">
              <legend>{t("pickSkills")}</legend>
              <div className="chips">
                {options?.skills.map((c) => (
                  <label key={c} className={`chip ${skills.includes(c) ? "on" : ""}`}>
                    <input type="checkbox" className="sr-only" checked={skills.includes(c)} onChange={(e) => setSkills(toggle(skills, c, e.target.checked))} />{serviceName(c)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="field">{t("city")}
              {cities.length > 0 ? (
                <select required value={city} onChange={(e) => { setCity(e.target.value); setZones([]); }}>
                  <option value="">{t("chooseCity")}</option>
                  {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input required value={city} onChange={(e) => setCity(e.target.value)} />
              )}
            </label>
            {cityZones.length > 0 && (
              <fieldset className="field plain">
                <legend>{t("pickAreas")}</legend>
                <p className="small muted" style={{ margin: "0 0 6px" }}>{t("areasHint")}</p>
                <div className="chips">
                  {cityZones.map((z) => (
                    <label key={z.id} className={`chip ${zones.includes(z.id) ? "on" : ""}`}>
                      <input type="checkbox" className="sr-only" checked={zones.includes(z.id)} onChange={(e) => setZones(toggle(zones, z.id, e.target.checked))} />{z.name} · {z.postal_code}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="field">{t("experience")}<input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
            <Notice message={message} />
            <button className="btn block huge" disabled={busy || !aboutDone}>{t("continueBtn")}</button>
            <Link className="btn ghost block" href="/login">{t("haveAccount")}</Link>
          </form>
        ) : (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (docsDone) submit(); }}>
            <h2>{t("completeVerification")}</h2>
            <p className="field-label">{t("aadhaarCard")}</p>
            <div className="doc-grid">
              <DocTile id="aadhaar-front" label={t("uploadFront")} file={docs.aadhaar_front} onPick={pick("aadhaar_front")} />
              <DocTile id="aadhaar-back" label={t("uploadBack")} file={docs.aadhaar_back} onPick={pick("aadhaar_back")} />
            </div>
            <p className="field-label">{t("panCard")}</p>
            <div className="doc-grid">
              <DocTile id="pan" label={t("uploadPan")} file={docs.pan} onPick={pick("pan")} />
            </div>
            <p className="field-label">{t("profilePhoto")}</p>
            <div className="doc-grid">
              <DocTile id="photo" label={t("uploadPhoto")} file={docs.photo} onPick={pick("photo")} photo />
            </div>
            {fileError && <p className="message error" role="alert">{fileError}</p>}
            <p className="message ok secure-note">🛡️ {t("docsSecure")}</p>
            <label className="checkbox"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t("consentText")}</label>
            <Notice message={message} />
            <button className="btn block huge" disabled={busy || !docsDone}>{busy ? t("loading") : t("submitVerification")}</button>
            <button type="button" className="btn ghost block" onClick={() => setStep(1)}>{t("back")}</button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Step 4: application sent, waiting for the team to verify documents and services. */
export function UnderReview({ note, onSignOut }: { note?: string; onSignOut: () => void }) {
  const { t } = useI18n();
  return (
    <div className="auth">
      <div className="card stack onboarding" role="status">
        <OnboardingSteps step={4} />
        <div className="review-badge" aria-hidden="true">⏳</div>
        <h1 className="onb-title">{t("reviewTitle")}</h1>
        <p className="muted">{t("reviewHint")}</p>
        {note && <p className="small muted">{note}</p>}
        <button className="btn ghost block" onClick={onSignOut}>{t("signOut")}</button>
      </div>
    </div>
  );
}

const STATUS_PILL: Record<string, string> = { VERIFIED: "st-done", APPROVED: "st-done", REJECTED: "st-issue", SUSPENDED: "st-issue" };

export function KycPage({ profile, refresh }: { profile: Profile; refresh: () => Promise<void> }) {
  const { t, lang, setLang } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("IDENTITY");
  const { busy, message, run } = useAction();
  const docs = profile.documents.filter((d) => ["IDENTITY", "ADDRESS", "CERTIFICATION", "PROFILE_PHOTO"].includes(d.kind));
  return (
    <div className="stack">
      <h1>{t("kyc")}</h1>
      <div className="card">
        <div className="row">
          <strong>{t("kycStatus")}</strong>
          <span className={`pill ${STATUS_PILL[profile.verification_status] ?? "st-offered"}`}>{label(profile.verification_status)}</span>
        </div>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>{t("name")}</dt><dd>{profile.display_name}</dd>
          <dt>{t("phone")}</dt><dd>{profile.phone_e164}</dd>
          <dt>{t("city")}</dt><dd>{profile.city || "—"}</dd>
          <dt>{t("skills")}</dt><dd>{profile.skills.filter((s) => s.is_verified).map((s) => label(s.code)).join(", ") || "—"}</dd>
          <dt>{t("areas")}</dt><dd>{profile.zones.map((z) => z.name).join(", ") || "—"}</dd>
        </dl>
      </div>

      <div className="card stack">
        <h2>{t("documents")}</h2>
        {docs.length ? docs.map((d) => (
          <div className="row" key={d.id}>
            <span>{label(d.kind)}</span>
            <span className={`pill ${STATUS_PILL[d.status] ?? "st-offered"}`}>{label(d.status)}</span>
          </div>
        )) : <p className="muted">—</p>}
        <label className="field">{t("docType")}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="IDENTITY">Identity proof</option>
            <option value="ADDRESS">Address proof</option>
            <option value="CERTIFICATION">Certificate</option>
            <option value="PROFILE_PHOTO">Profile photo</option>
          </select>
        </label>
        <label className="field">File<input type="file" accept=".pdf,.jpg,.jpeg,.png,image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <Notice message={message} />
        <button className="btn secondary block" disabled={busy || !file} onClick={() => file && run(() => api.upload(kind, file), refresh, t("saved"))}>{t("uploadDoc")}</button>
      </div>

      <div className="card">
        <h2>{t("language")}</h2>
        <div className="grid2" role="radiogroup" aria-label={t("language")}>
          <button role="radio" aria-checked={lang === "en"} className={`btn ${lang === "en" ? "" : "ghost"}`} onClick={() => setLang("en")}>English</button>
          <button role="radio" aria-checked={lang === "ta"} className={`btn ${lang === "ta" ? "" : "ghost"}`} onClick={() => setLang("ta")} lang="ta">தமிழ்</button>
        </div>
      </div>
    </div>
  );
}
