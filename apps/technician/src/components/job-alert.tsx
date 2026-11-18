"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Offer } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { timeOnly } from "./ui";

/**
 * Job requests: an online/offline switch, a ringing pop-up for each new job offered in the technician's
 * areas, and a list of open requests. Jobs go to everyone eligible at once; the first to accept gets it.
 *
 * Sound: browsers only let a page play sound after a tap, so "Go online" also unlocks the ringtone and asks
 * for push permission. With the site closed, the push notification uses the phone's own sound.
 */
const POLL_MS = 10000;
const RING_LIMIT_MS = 60000;
const RINGTONE = "/sounds/job-alert.wav";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;
  const config = await api.pushConfig().catch(() => null);
  if (!config?.enabled || !config.public_key) return;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.public_key),
  });
  await api.pushSubscribe(sub.toJSON());
}

function isOpen(o: Offer) {
  return o.status === "OFFERED" && new Date(o.expires_at).getTime() > Date.now();
}

export function JobAlert() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [online, setOnline] = useState<boolean | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [ringing, setRinging] = useState<Offer | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const seen = useRef<Set<string>>(new Set());
  const ringingRef = useRef<Offer | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopTimer = useRef<number | null>(null);

  const stopRing = useCallback(() => {
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    if (stopTimer.current) window.clearTimeout(stopTimer.current);
    if ("vibrate" in navigator) navigator.vibrate(0);
  }, []);

  const startRing = useCallback(() => {
    if (!audio.current) audio.current = new Audio(RINGTONE);
    audio.current.loop = true;
    audio.current.play().catch(() => undefined);  // blocked until the first tap; the pop-up still shows
    if ("vibrate" in navigator) navigator.vibrate([600, 250, 600, 250, 600]);
    if (stopTimer.current) window.clearTimeout(stopTimer.current);
    stopTimer.current = window.setTimeout(() => audio.current?.pause(), RING_LIMIT_MS);
  }, []);

  const load = useCallback(async () => {
    const result = await api.offers().catch(() => null);
    if (!result) return;
    const open = result.offers.filter(isOpen);
    setOffers(open);
    // Decide outside the state setter: React may run setters twice, and these steps have side effects.
    const current = ringingRef.current;
    if (current && !open.some((o) => o.id === current.id)) {
      stopRing();
      ringingRef.current = null;
      ringingRef.current = null; setRinging(null);
      setNote(t("jobTakenByOther"));
      return;
    }
    if (current) return;
    const fresh = open.find((o) => !seen.current.has(o.id));
    if (fresh) {
      seen.current.add(fresh.id);
      ringingRef.current = fresh;
      setRinging(fresh);
      startRing();
    }
  }, [startRing, stopRing, t]);

  useEffect(() => {
    let active = true;
    api.me().then((p) => active && setOnline(p.is_online)).catch(() => active && setOnline(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!online) return;
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onMessage = (e: MessageEvent) => { if (e.data?.type === "JOB_OFFER") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [online, load]);

  useEffect(() => () => stopRing(), [stopRing]);

  const goOnline = async () => {
    setBusy(true);
    setNote("");
    // This tap unlocks sound for the rest of the visit.
    if (!audio.current) audio.current = new Audio(RINGTONE);
    audio.current.muted = true;
    await audio.current.play().catch(() => undefined);
    audio.current.pause();
    audio.current.muted = false;
    try {
      const p = await api.update({ is_online: true });
      setOnline(p.is_online);
      await subscribeToPush().catch(() => undefined);
    } catch (e) {
      setNote(e instanceof Error ? e.message : t("retry"));
    } finally {
      setBusy(false);
    }
  };

  const goOffline = async () => {
    setBusy(true);
    try {
      const p = await api.update({ is_online: false });
      setOnline(p.is_online);
      stopRing();
      ringingRef.current = null; setRinging(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : t("retry"));
    } finally {
      setBusy(false);
    }
  };

  const accept = async (offer: Offer) => {
    setBusy(true);
    stopRing();
    try {
      const result = await api.offerAction(offer.id, "accept") as { assignment_id?: string };
      ringingRef.current = null; setRinging(null);
      setListOpen(false);
      setNote(t("jobAccepted"));
      void load();
      if (result.assignment_id) router.push(`/jobs/${result.assignment_id}`);
    } catch (e) {
      ringingRef.current = null; setRinging(null);
      setNote(e instanceof ApiError && e.status === 409 ? t("jobTakenByOther") : e instanceof Error ? e.message : t("retry"));
      void load();
    } finally {
      setBusy(false);
    }
  };

  const decline = async (offer: Offer) => {
    setBusy(true);
    try {
      await api.offerAction(offer.id, "decline");
      void load();
    } catch { /* already gone */ }
    finally { setBusy(false); }
  };

  const when = (o: Offer) => {
    const d = new Date(o.start_at);
    const today = new Date().toDateString() === d.toDateString();
    const day = today ? t("today") : d.toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { weekday: "short", day: "numeric", month: "short" });
    return `${day} · ${timeOnly(o.start_at, lang)}`;
  };

  if (online === null) return null;

  return (
    <>
      <div className={`alert-bar ${online ? "is-online" : ""}`} role="region" aria-label={t("jobRequests")}>
        <span className="alert-state"><span className="dot" aria-hidden="true" />{online ? t("onlineReceiving") : t("offlineHint")}</span>
        {online && offers.length > 0 && (
          <button className="btn secondary" onClick={() => setListOpen(true)}>{t("jobRequests")} · {offers.length}</button>
        )}
        <button className={`btn ${online ? "ghost" : ""}`} disabled={busy} onClick={() => void (online ? goOffline() : goOnline())}>
          {online ? t("goOffline") : t("goOnline")}
        </button>
      </div>
      {note && (
        <p className="message alert-note" role="status" onClick={() => setNote("")}>{note}</p>
      )}

      {ringing && (
        <div className="offer-overlay" role="alertdialog" aria-modal="true" aria-labelledby="offer-title">
          <div className="offer-card">
            <div className="offer-ring" aria-hidden="true">🔔</div>
            <h2 id="offer-title">{t("newJobOffer")}</h2>
            <p className="offer-service">{ringing.service}</p>
            <p className="muted" style={{ margin: 0 }}>{ringing.package}</p>
            <dl className="kv">
              <dt>{t("when")}</dt><dd>{when(ringing)}</dd>
              <dt>{t("area")}</dt><dd>{ringing.zone} · {ringing.postal_code}</dd>
            </dl>
            <p className="small muted">{t("firstToAccept")}</p>
            <button className="btn ok block huge" disabled={busy} onClick={() => void accept(ringing)}>{t("acceptJob")}</button>
            <button className="btn ghost block" disabled={busy} onClick={() => { stopRing(); ringingRef.current = null; setRinging(null); }}>{t("notNow")}</button>
          </div>
        </div>
      )}

      {listOpen && !ringing && (
        <div className="offer-overlay" role="dialog" aria-modal="true" aria-labelledby="requests-title" onClick={() => setListOpen(false)}>
          <div className="offer-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="requests-title">{t("jobRequests")}</h2>
            {offers.length === 0 ? <p className="muted">{t("noRequests")}</p> : offers.map((o) => (
              <div className="card" key={o.id}>
                <strong>{o.service}</strong>
                <p className="small muted" style={{ margin: "2px 0 8px" }}>{o.package} · {when(o)} · {o.zone}</p>
                <div className="grid2">
                  <button className="btn ok" disabled={busy} onClick={() => void accept(o)}>{t("accept")}</button>
                  <button className="btn ghost" disabled={busy} onClick={() => void decline(o)}>{t("decline")}</button>
                </div>
              </div>
            ))}
            <button className="btn ghost block" onClick={() => setListOpen(false)}>{t("close")}</button>
          </div>
        </div>
      )}
    </>
  );
}
