"use client";

import React, { useState } from "react";
import { useI18n } from "../lib/i18n";

export const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const when = (value: string, lang: string = "en") =>
  new Date(value).toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const timeOnly = (value: string, lang: string = "en") =>
  new Date(value).toLocaleTimeString(lang === "ta" ? "ta-IN" : "en-IN", { hour: "numeric", minute: "2-digit" });
export const label = (value: string) => value.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
export const isToday = (value: string) => new Date(value).toDateString() === new Date().toDateString();

const STATUS_CLASS: Record<string, string> = {
  OFFERED: "st-offered", ASSIGNED: "st-assigned", EN_ROUTE: "st-enroute", ARRIVED: "st-enroute",
  INSPECTING: "st-progress", AWAITING_QUOTATION_APPROVAL: "st-offered", IN_PROGRESS: "st-progress",
  SERVICE_COMPLETED: "st-done", CANCELLED: "st-issue",
};
export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${STATUS_CLASS[status] ?? "st-assigned"}`}>{label(status)}</span>;
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const run = async (action: () => Promise<unknown>, done?: () => void, okText?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (okText) setMessage({ text: okText, error: false });
      done?.();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Something went wrong.", error: true });
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run, setMessage };
}

export function Notice({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null;
  return <p role={message.error ? "alert" : "status"} className={`message ${message.error ? "error" : ""}`}>{message.text}</p>;
}

export function Loading() {
  const { t } = useI18n();
  return <div className="empty" aria-busy="true">{t("loading")}</div>;
}

type IconName = "home" | "briefcase" | "wallet" | "user" | "phone" | "nav" | "camera" | "check" | "clock" | "bell";
const PATHS: Record<IconName, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  briefcase: "M4 7h16v12H4zM9 7V5h6v2M4 12h16",
  wallet: "M3 7h18v12H3zM16 13h3M3 7l12-3v3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  nav: "M3 11l18-8-8 18-2-8z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  check: "M5 12l5 5 9-10",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
};
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function mapsDirections(job: { address: { line_1: string; locality: string; city: string; postal_code: string; latitude?: number | null; longitude?: number | null } }) {
  const dest = job.address.latitude != null && job.address.longitude != null
    ? `${job.address.latitude},${job.address.longitude}`
    : `${job.address.line_1}, ${job.address.locality}, ${job.address.city} ${job.address.postal_code}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

export const OPS_PHONE = process.env.NEXT_PUBLIC_OPS_PHONE ?? "";
