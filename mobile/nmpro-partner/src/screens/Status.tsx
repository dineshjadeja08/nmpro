import React from "react";
import { Text } from "react-native";
import type { JoiningFee } from "../api";
import { useI18n } from "../i18n";
import { Button, Card, color, H1, LangToggle, Muted, Notice, Screen, Steps, TopBar } from "../ui";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

/** Step 3. Online payment in the app comes later; for now the team collects the fee and marks it paid. */
export function FeeScreen({ fee, firstJoin, onRefresh, onSignOut, busy }: {
  fee: JoiningFee; firstJoin: boolean; onRefresh: () => void; onSignOut: () => void; busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <Screen header={<TopBar title={t("appName")} right={<LangToggle />} />}>
      {firstJoin && <Card><Steps step={3} /></Card>}
      <Card>
        <H1>{t("feeTitle")}</H1>
        <Muted>{t("feeHint")}</Muted>
        <Text style={{ fontSize: 40, fontWeight: "900", color: color.wine }}>{rupees(fee.amount_paise)}</Text>
        <Notice tone="warn" text={t("feeOffline")} />
        <Button title={t("checkAgain")} kind="secondary" busy={busy} onPress={onRefresh} />
        <Button title={t("signOut")} kind="ghost" onPress={onSignOut} />
      </Card>
    </Screen>
  );
}

/** Step 4, and any other "jobs are locked" state (with the server's own reason). */
export function ReviewScreen({ inReview, note, onRefresh, onSignOut, busy }: {
  inReview: boolean; note: string; onRefresh: () => void; onSignOut: () => void; busy: boolean;
}) {
  const { t } = useI18n();
  return (
    <Screen header={<TopBar title={t("appName")} right={<LangToggle />} />}>
      {inReview && <Card><Steps step={4} /></Card>}
      <Card>
        <Text style={{ fontSize: 44, textAlign: "center" }}>{inReview ? "⏳" : "🔒"}</Text>
        <H1>{inReview ? t("reviewTitle") : t("appName")}</H1>
        <Muted>{inReview ? t("reviewHint") : note}</Muted>
        {inReview && note ? <Muted>{note}</Muted> : null}
        <Button title={t("checkAgain")} kind="secondary" busy={busy} onPress={onRefresh} />
        <Button title={t("signOut")} kind="ghost" onPress={onSignOut} />
      </Card>
    </Screen>
  );
}
