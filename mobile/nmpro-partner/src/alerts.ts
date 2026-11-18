import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Vibration } from "react-native";
import { api, type Offer } from "./api";

/**
 * Job alerts while the app is open: checks for new offers every 10 seconds, rings the NammaPros ringtone on
 * loop (up to a minute) and vibrates. Offers go to every eligible partner at once; the first to accept wins.
 *
 * The "job-alerts" Android channel plays the same ringtone for push notifications once the server sends them.
 */
export const JOB_CHANNEL = "job-alerts";
const POLL_MS = 10000;
const RING_LIMIT_MS = 60000;

export async function setupNotifications() {
  if (Platform.OS === "web") return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(JOB_CHANNEL, {
      name: "Job alerts",
      importance: Notifications.AndroidImportance.MAX,
      sound: "job_alert.wav",
      vibrationPattern: [0, 600, 250, 600, 250, 600],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function askNotificationPermission() {
  if (Platform.OS === "web") return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

const isOpen = (o: Offer) => o.status === "OFFERED" && new Date(o.expires_at).getTime() > Date.now();

export function useJobAlerts(online: boolean) {
  const player = useAudioPlayer(require("../assets/sounds/job_alert.wav"));
  const [offers, setOffers] = useState<Offer[]>([]);
  const [ringing, setRinging] = useState<Offer | null>(null);
  const [note, setNote] = useState("");
  const seen = useRef(new Set<string>());
  const ringingRef = useRef<Offer | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  const stopRing = useCallback(() => {
    try { player.pause(); player.seekTo(0); } catch { /* not loaded yet */ }
    Vibration.cancel();
    if (stopTimer.current) clearTimeout(stopTimer.current);
  }, [player]);

  const startRing = useCallback(() => {
    try { player.loop = true; player.seekTo(0); player.play(); } catch { /* sound unavailable: the pop-up still shows */ }
    Vibration.vibrate([0, 600, 250, 600, 250, 600], true);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(stopRing, RING_LIMIT_MS);
  }, [player, stopRing]);

  const close = useCallback(() => {
    stopRing();
    ringingRef.current = null;
    setRinging(null);
  }, [stopRing]);

  const load = useCallback(async () => {
    const result = await api.offers().catch(() => null);
    if (!result) return;
    const open = result.offers.filter(isOpen);
    setOffers(open);
    const current = ringingRef.current;
    if (current && !open.some((o) => o.id === current.id)) {
      close();
      setNote("taken");
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
  }, [close, startRing]);

  useEffect(() => {
    if (!online) return;
    let active = AppState.currentState === "active";
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (active) void load(); }, POLL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      active = state === "active";
      if (active) void load();
    });
    return () => { clearTimeout(first); clearInterval(timer); sub.remove(); };
  }, [online, load]);

  useEffect(() => () => stopRing(), [stopRing]);

  return { offers, ringing, note, setNote, close, reload: load };
}
