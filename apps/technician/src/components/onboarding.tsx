"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { api, type JoinOptions, type Profile } from "../lib/api";
import { useI18n } from "../lib/i18n";
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

export function JoinRequest() {
  const { t } = useI18n();
  const router = useRouter();
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
  const [idDoc, setIdDoc] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const { busy, message, run } = useAction();
  useEffect(() => { api.joinOptions().then(setOptions).catch(() => setOptions({ skills: [], zones: [] })); }, []);
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

  const phoneOk = /^\+?\d[\d\s]{9,14}$/.test(phone.trim());
  const canSend = name.trim() && phoneOk && city.trim() && skills.length > 0 && idDoc && consent && challenge && code.length >= 4;
  return (
    <div className="auth">
      <form className="card stack" onSubmit={(e) => {
        e.preventDefault();
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
        if (idDoc) form.append("id_document", idDoc);
        if (photo) form.append("photo", photo);
        void run(async () => {
          await api.joinRequest(form);
          router.replace("/fee");
        });
      }}>
        <h1>{t("joinTitle")}</h1>
        <p className="muted">{t("joinHint")}</p>
        <label className="field">{t("name")}<input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>{t("verifyPhone")}</legend>
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
        <label className="field">{t("city")}<input required value={city} onChange={(e) => setCity(e.target.value)} /></label>
        <label className="field">{t("experience")}<input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>{t("pickSkills")}</legend>
          {options?.skills.map((code) => (
            <label key={code} className="checkbox"><input type="checkbox" checked={skills.includes(code)} onChange={(e) => setSkills(toggle(skills, code, e.target.checked))} />{label(code)}</label>
          ))}
        </fieldset>
        {options && options.zones.length > 0 && (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 700, marginBottom: 6 }}>{t("pickAreas")}</legend>
            {options.zones.map((z) => (
              <label key={z.id} className="checkbox"><input type="checkbox" checked={zones.includes(z.id)} onChange={(e) => setZones(toggle(zones, z.id, e.target.checked))} />{z.name}, {z.city} · {z.postal_code}</label>
            ))}
          </fieldset>
        )}
        <label className="field">{t("idProof")}<input required type="file" accept=".pdf,.jpg,.jpeg,.png,image/*" capture="environment" onChange={(e) => setIdDoc(e.target.files?.[0] ?? null)} /></label>
        <label className="field">{t("yourPhoto")}<input type="file" accept="image/jpeg,image/png" capture="user" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
        <label className="checkbox"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t("consentText")}</label>
        <Notice message={message} />
        <button className="btn block huge" disabled={busy || !canSend}>{busy ? t("loading") : t("submitJoin")}</button>
        <Link className="btn ghost block" href="/login">{t("haveAccount")}</Link>
      </form>
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
