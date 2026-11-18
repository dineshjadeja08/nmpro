import React, { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../api";
import { useI18n } from "../i18n";
import { Button, Card, color, Field, H1, LangToggle, Muted, Notice, Screen, TopBar } from "../ui";

export function Welcome({ onLogin, onJoin }: { onLogin: () => void; onJoin: () => void }) {
  const { t } = useI18n();
  return (
    <Screen header={<TopBar title={t("appName")} right={<LangToggle />} />}>
      <View style={{ alignItems: "center", marginVertical: 24 }}>
        <View style={{ width: 84, height: 84, borderRadius: 22, backgroundColor: color.wine, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: color.white, fontSize: 48, fontWeight: "900", marginTop: -6 }}>n</Text>
        </View>
      </View>
      <Card>
        <H1>{t("welcomeTitle")}</H1>
        <Muted>{t("welcomeHint")}</Muted>
        <Button title={t("login")} onPress={onLogin} />
        <Button title={t("join")} kind="secondary" onPress={onJoin} />
      </Card>
    </Screen>
  );
}

const normalise = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, "");
  return /^\d{10}$/.test(digits) ? `+91${digits}` : digits;
};

export function Login({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t("retry")); } finally { setBusy(false); }
  };

  return (
    <Screen header={<TopBar title={t("appName")} right={<LangToggle />} />}>
      <Card>
        <H1>{t("welcomeBack")}</H1>
        <Muted>{t("signInHint")}</Muted>
        <Field label={t("phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel"
          textContentType="telephoneNumber" editable={!challenge} placeholder="98400 12345" />
        {challenge ? (
          <>
            <Field label={t("code")} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ""))} keyboardType="number-pad"
              autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} autoFocus />
            {devCode ? <Notice tone="warn" text={`${t("devCode")}: ${devCode}`} /> : null}
          </>
        ) : null}
        <Notice tone="error" text={error} />
        {!challenge ? (
          <Button title={t("sendCode")} busy={busy} disabled={phone.replace(/\D/g, "").length < 10}
            onPress={() => run(async () => {
              const r = await api.otpRequest(normalise(phone));
              setChallenge(r.challenge_id);
              setDevCode(r.development_code ?? "");
            })} />
        ) : (
          <>
            <Button title={t("verifyCode")} busy={busy} disabled={code.length < 4}
              onPress={() => run(async () => { await api.otpVerify(normalise(phone), challenge, code); onDone(); })} />
            <Button title={t("changeNumber")} kind="ghost" onPress={() => { setChallenge(""); setCode(""); setDevCode(""); }} />
          </>
        )}
        <Button title={t("back")} kind="ghost" onPress={onBack} />
      </Card>
    </Screen>
  );
}

export { normalise };
