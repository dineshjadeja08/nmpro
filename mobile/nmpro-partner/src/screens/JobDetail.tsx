import React, { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { api, type Job } from "../api";
import { useI18n } from "../i18n";
import { Button, Card, color, H1, Label, LangToggle, Muted, Notice, Screen, TopBar } from "../ui";
import { when } from "./Home";

/** Job details: who, where, when, with call and navigation. The step-by-step job flow comes next. */
export function JobDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, lang } = useI18n();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.job(id).then((j) => active && setJob(j)).catch((e) => active && setError(e instanceof Error ? e.message : t("retry")));
    return () => { active = false; };
  }, [id, t]);

  const mapsUrl = (j: Job) => {
    const { latitude, longitude } = j.address;
    const q = latitude && longitude ? `${latitude},${longitude}`
      : encodeURIComponent([j.address.line_1, j.address.locality, j.address.city, j.address.postal_code].filter(Boolean).join(", "));
    return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  };

  return (
    <Screen header={<TopBar title={t("appName")} right={<LangToggle />} />}>
      <Button title={`← ${t("back")}`} kind="ghost" onPress={onBack} />
      {error ? <Notice tone="error" text={error} /> : !job ? <Muted>{t("loading")}</Muted> : (
        <>
          <Card>
            <Text style={{ fontWeight: "800", color: color.wine }}>{when(job.start_at, lang, t("today"))}</Text>
            <H1>{job.service}</H1>
            <Muted>{job.package} · {job.booking_reference}</Muted>
          </Card>
          <Card>
            <Label>{t("customer")}</Label>
            <Text style={{ fontSize: 17, color: color.ink }}>{job.customer.name}</Text>
            <Label>{t("address")}</Label>
            <Text style={{ fontSize: 17, color: color.ink }}>
              {[job.address.line_1, job.address.locality, job.address.city, job.address.postal_code].filter(Boolean).join(", ")}
            </Text>
            {job.address.landmark ? <Muted>{job.address.landmark}</Muted> : null}
            {job.problem_description ? (<><Label>{t("problem")}</Label><Muted>{job.problem_description}</Muted></>) : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button style={{ flex: 1 }} title={`📞 ${t("call")}`} kind="secondary" onPress={() => void Linking.openURL(`tel:${job.customer.phone}`)} />
              <Button style={{ flex: 1 }} title={`🧭 ${t("navigate")}`} kind="secondary" onPress={() => void Linking.openURL(mapsUrl(job))} />
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}
