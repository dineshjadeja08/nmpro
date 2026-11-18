import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { askNotificationPermission, useJobAlerts } from "../alerts";
import { api, ApiError, type Job, type Offer, type Profile } from "../api";
import { useI18n } from "../i18n";
import { Button, Card, color, H1, H2, LangToggle, Muted, Notice, s, TopBar } from "../ui";

const DONE = ["SERVICE_COMPLETED", "CANCELLED"];

export function when(iso: string, lang: string, today: string) {
  const d = new Date(iso);
  const isToday = new Date().toDateString() === d.toDateString();
  const locale = lang === "ta" ? "ta-IN" : "en-IN";
  const day = isToday ? today : d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}`;
}

export function Home({ profile, onOpenJob, onSignOut }: { profile: Profile; onOpenJob: (id: string) => void; onSignOut: () => void }) {
  const { t, lang } = useI18n();
  const [online, setOnline] = useState(profile.is_online);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const alerts = useJobAlerts(online);

  const loadJobs = useCallback(async () => {
    const r = await api.jobs().catch(() => null);
    setJobs(r ? r.jobs : []);
  }, []);
  useEffect(() => { const timer = setTimeout(() => void loadJobs(), 0); return () => clearTimeout(timer); }, [loadJobs]);

  useEffect(() => {
    if (alerts.note !== "taken") return;
    const timer = setTimeout(() => { setMessage({ text: t("jobTaken"), tone: "error" }); alerts.setNote(""); }, 0);
    return () => clearTimeout(timer);
  }, [alerts, t]);

  const switchOnline = async (next: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      if (next) await askNotificationPermission().catch(() => false);
      const p = await api.setOnline(next);
      setOnline(p.is_online);
      if (!next) alerts.close();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : t("retry"), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const accept = async (offer: Offer) => {
    setBusy(true);
    alerts.close();
    try {
      const r = await api.offerAction(offer.id, "accept");
      setListOpen(false);
      setMessage({ text: t("jobAccepted"), tone: "ok" });
      await loadJobs();
      void alerts.reload();
      if (r.assignment_id) onOpenJob(r.assignment_id);
    } catch (e) {
      setMessage({ text: e instanceof ApiError && e.status === 409 ? t("jobTaken") : e instanceof Error ? e.message : t("retry"), tone: "error" });
      void alerts.reload();
    } finally {
      setBusy(false);
    }
  };

  const decline = async (offer: Offer) => {
    await api.offerAction(offer.id, "decline").catch(() => undefined);
    void alerts.reload();
  };

  const upcoming = (jobs ?? []).filter((j) => !DONE.includes(j.status)).sort((a, b) => +new Date(a.start_at) - +new Date(b.start_at));

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <TopBar title={t("appName")} right={<><LangToggle /><Pressable accessibilityRole="button" onPress={onSignOut} style={{ paddingHorizontal: 8, justifyContent: "center" }}><Text style={{ color: color.white, fontWeight: "700" }}>{t("signOut")}</Text></Pressable></>} />
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { void loadJobs(); void alerts.reload(); }} />}>
        <H1>{t("hello")}, {profile.display_name.split(" ")[0]}</H1>

        <Card style={{ borderColor: online ? color.ok : color.line }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: online ? "#16a34a" : "#a8a29e" }} />
            <Text style={{ flex: 1, fontWeight: "700", color: online ? color.ok : color.muted }}>{online ? t("online") : t("offline")}</Text>
          </View>
          <Button title={online ? t("goOffline") : t("goOnline")} kind={online ? "ghost" : "primary"} busy={busy} onPress={() => void switchOnline(!online)} />
          {online && alerts.offers.length > 0 && (
            <Button title={`${t("jobRequests")} · ${alerts.offers.length}`} kind="secondary" onPress={() => setListOpen(true)} />
          )}
        </Card>

        {message && <Notice tone={message.tone} text={message.text} />}

        <H2>{t("upcoming")}</H2>
        {jobs === null ? <Muted>{t("loading")}</Muted> : upcoming.length === 0 ? <Muted>{t("noJobs")}</Muted> : upcoming.map((j) => (
          <Pressable key={j.id} accessibilityRole="button" onPress={() => onOpenJob(j.id)}>
            <Card>
              <Text style={{ fontWeight: "800", color: color.wine }}>{when(j.start_at, lang, t("today"))}</Text>
              <Text style={{ fontSize: 18, fontWeight: "800", color: color.ink }}>{j.service}</Text>
              <Muted>{j.package} · {j.address.locality}, {j.address.city}</Muted>
            </Card>
          </Pressable>
        ))}
      </ScrollView>

      {/* Ringing job pop-up */}
      <Modal visible={!!alerts.ringing} transparent animationType="slide" onRequestClose={alerts.close}>
        <View style={{ flex: 1, backgroundColor: "#1c1917b3", justifyContent: "flex-end", padding: 12 }}>
          {alerts.ringing && (
            <Card style={{ borderRadius: 22, padding: 20 }}>
              <Text style={{ fontSize: 42, textAlign: "center" }}>🔔</Text>
              <Text style={{ fontSize: 22, fontWeight: "900", textAlign: "center", color: color.ink }}>{t("newJob")}</Text>
              <Text style={{ fontSize: 20, fontWeight: "800", color: color.ink }}>{alerts.ringing.service}</Text>
              <Muted>{alerts.ringing.package}</Muted>
              <Text style={{ color: color.ink }}><Text style={{ fontWeight: "700" }}>{t("when")}: </Text>{when(alerts.ringing.start_at, lang, t("today"))}</Text>
              <Text style={{ color: color.ink }}><Text style={{ fontWeight: "700" }}>{t("area")}: </Text>{alerts.ringing.zone} · {alerts.ringing.postal_code}</Text>
              <Muted>{t("firstToAccept")}</Muted>
              <Button title={t("acceptJob")} kind="ok" busy={busy} onPress={() => alerts.ringing && void accept(alerts.ringing)} />
              <Button title={t("notNow")} kind="ghost" onPress={alerts.close} />
            </Card>
          )}
        </View>
      </Modal>

      {/* Open requests */}
      <Modal visible={listOpen && !alerts.ringing} transparent animationType="slide" onRequestClose={() => setListOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#1c1917b3", justifyContent: "flex-end", padding: 12 }}>
          <Card style={{ borderRadius: 22, maxHeight: "85%" }}>
            <H2>{t("jobRequests")}</H2>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              {alerts.offers.length === 0 ? <Muted>{t("noRequests")}</Muted> : alerts.offers.map((o) => (
                <Card key={o.id}>
                  <Text style={{ fontWeight: "800", color: color.ink }}>{o.service}</Text>
                  <Muted>{o.package} · {when(o.start_at, lang, t("today"))} · {o.zone}</Muted>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button style={{ flex: 1 }} title={t("accept")} kind="ok" busy={busy} onPress={() => void accept(o)} />
                    <Button style={{ flex: 1 }} title={t("decline")} kind="ghost" onPress={() => void decline(o)} />
                  </View>
                </Card>
              ))}
            </ScrollView>
            <Button title={t("close")} kind="ghost" onPress={() => setListOpen(false)} />
          </Card>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
