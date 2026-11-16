"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";

const SEND_EVERY_MS = 10000;

/** While `active`, watch the phone's GPS and send the position for this job every ~10 seconds. */
export function useLocationSharing(jobId: string, active: boolean) {
  const [state, setState] = useState<"idle" | "sharing" | "denied" | "unsupported">("idle");
  const lastSent = useRef(0);

  useEffect(() => {
    if (!active) {
      setState("idle");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unsupported");
      return;
    }
    let wakeLock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (wakeLock = l)).catch(() => undefined);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState("sharing");
        const now = Date.now();
        if (now - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = now;
        api.shareLocation(jobId, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null).catch(() => undefined);
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : "sharing"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      void wakeLock?.release().catch(() => undefined);
    };
  }, [jobId, active]);

  return state;
}
