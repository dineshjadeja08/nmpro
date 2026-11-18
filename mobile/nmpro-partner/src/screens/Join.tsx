import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { api, type JoinOptions, type PickedFile } from "../api";
import { useI18n } from "../i18n";
import { Button, Card, Chip, color, Field, H1, H2, Label, LangToggle, Muted, Notice, s, Screen, Steps, TopBar } from "../ui";
import { normalise } from "./Auth";

type DocKey = "aadhaar_front" | "aadhaar_back" | "pan" | "photo";
const MAX_BYTES = 5 * 1024 * 1024;

/** "AC_SPECIALIST" → "AC", "WATER_TANK_CLEANING_SPECIALIST" → "Water tank cleaning". */
function serviceName(code: string) {
  const text = code.replace(/_SPECIALIST$/, "").toLowerCase().split("_").filter(Boolean).join(" ");
  return text.replace(/\b(ac|tv|cctv)\b/g, (w) => w.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
}

async function pickImage(fromCamera: boolean, name: string): Promise<PickedFile | null | "too-big"> {
  if (fromCamera && Platform.OS !== "web") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7, allowsEditing: false };
  const result = fromCamera && Platform.OS !== "web"
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  if (a.fileSize && a.fileSize > MAX_BYTES) return "too-big";
  const type = a.mimeType === "image/png" ? "image/png" : "image/jpeg";
  return { uri: a.uri, name: `${name}.${type === "image/png" ? "png" : "jpg"}`, type };
}

function DocTile({ label, file, onPick }: { label: string; file: PickedFile | null; onPick: (camera: boolean) => void }) {
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, minHeight: 120, borderRadius: 14, borderWidth: 2, borderStyle: file ? "solid" : "dashed",
      borderColor: file ? color.ok : color.line, backgroundColor: file ? color.okBg : color.bg, padding: 10, gap: 8, alignItems: "center" }}>
      {file ? <Image source={{ uri: file.uri }} style={{ width: "100%", height: 64, borderRadius: 8 }} resizeMode="cover" />
        : <Text style={{ fontSize: 26 }}>🪪</Text>}
      <Text style={{ fontWeight: "700", color: color.ink }}>{file ? `✓ ${label}` : label}</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {Platform.OS !== "web" && (
          <Pressable accessibilityRole="button" accessibilityLabel={`${t("takePhoto")}: ${label}`} onPress={() => onPick(true)} style={tileBtn}>
            <Text style={tileBtnText}>📷</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("chooseFile")}: ${label}`} onPress={() => onPick(false)} style={tileBtn}>
          <Text style={tileBtnText}>🖼️</Text>
        </Pressable>
      </View>
    </View>
  );
}
const tileBtn = { minWidth: 48, minHeight: 40, borderRadius: 10, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, alignItems: "center" as const, justifyContent: "center" as const };
const tileBtnText = { fontSize: 18 };

export function Join({ onSubmitted, onBack }: { onSubmitted: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2>(1);
  const [options, setOptions] = useState<JoinOptions | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [years, setYears] = useState("");
  const [docs, setDocs] = useState<Record<DocKey, PickedFile | null>>({ aadhaar_front: null, aadhaar_back: null, pan: null, photo: null });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api.joinOptions().then(setOptions).catch(() => setOptions({ skills: [], zones: [] })); }, []);
  const cities = useMemo(() => Array.from(new Set((options?.zones ?? []).map((z) => z.city))).sort(), [options]);
  const cityZones = (options?.zones ?? []).filter((z) => z.city === city);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const aboutDone = Boolean(name.trim() && phone.replace(/\D/g, "").length >= 10 && challenge && code.length >= 4
    && skills.length && city && (cityZones.length === 0 || zones.length));
  const docsDone = Boolean(docs.aadhaar_front && docs.aadhaar_back && docs.pan && docs.photo && consent);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t("retry")); } finally { setBusy(false); }
  };

  const pick = (key: DocKey) => async (camera: boolean) => {
    const f = await pickImage(camera, key);
    if (f === "too-big") { setError("Each photo must be smaller than 5 MB."); return; }
    if (f) { setError(""); setDocs((d) => ({ ...d, [key]: f })); }
  };

  const submit = () => run(async () => {
    await api.joinRequest({
      name: name.trim(), phone: normalise(phone), city, experience_years: years || "0", skills: skills.join(","),
      zone_ids: zones.join(","), consent: "true", challenge_id: challenge, code,
    }, docs);
    onSubmitted();
  });

  return (
    <Screen header={<TopBar title={t("appName")} right={<LangToggle />} />}>
      <Card>
        <H1>{step === 1 ? t("joinHeadline") : t("docsHeadline")}</H1>
        <Muted>{step === 1 ? t("joinSub") : t("docsSub")}</Muted>
        <Steps step={step} />
      </Card>

      {step === 1 ? (
        <Card>
          <Field label={t("name")} value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
          <Field label={t("phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!challenge} placeholder="98400 12345" />
          {!challenge ? (
            <Button title={t("sendCode")} kind="secondary" busy={busy} disabled={phone.replace(/\D/g, "").length < 10}
              onPress={() => run(async () => {
                const r = await api.joinOtp(normalise(phone));
                setChallenge(r.challenge_id);
                setDevCode(r.development_code ?? "");
              })} />
          ) : (
            <>
              <Muted>{t("codeSentTo")} {phone}</Muted>
              <Field label={t("code")} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={6} />
              {devCode ? <Notice tone="warn" text={`${t("devCode")}: ${devCode}`} /> : null}
              <Button title={t("changeNumber")} kind="ghost" onPress={() => { setChallenge(""); setCode(""); setDevCode(""); }} />
            </>
          )}

          <Label>{t("pickSkills")}</Label>
          <View style={s.chips}>
            {(options?.skills ?? []).map((c) => <Chip key={c} label={serviceName(c)} on={skills.includes(c)} onPress={() => setSkills(toggle(skills, c))} />)}
          </View>

          <Label>{t("city")}</Label>
          <View style={s.chips}>
            {cities.map((c) => <Chip key={c} label={c} on={city === c} onPress={() => { setCity(c); setZones([]); }} />)}
          </View>

          {cityZones.length > 0 && (
            <>
              <Label>{t("pickAreas")}</Label>
              <Muted>{t("areasHint")}</Muted>
              <View style={s.chips}>
                {cityZones.map((z) => <Chip key={z.id} label={`${z.name} · ${z.postal_code}`} on={zones.includes(z.id)} onPress={() => setZones(toggle(zones, z.id))} />)}
              </View>
            </>
          )}
          <Field label={t("experience")} value={years} onChangeText={(v) => setYears(v.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" />
          <Notice tone="error" text={error} />
          <Button title={t("continueBtn")} disabled={!aboutDone} onPress={() => { setError(""); setStep(2); }} />
          <Button title={t("back")} kind="ghost" onPress={onBack} />
        </Card>
      ) : (
        <Card>
          <H2>{t("aadhaarCard")}</H2>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <DocTile label={t("uploadFront")} file={docs.aadhaar_front} onPick={pick("aadhaar_front")} />
            <DocTile label={t("uploadBack")} file={docs.aadhaar_back} onPick={pick("aadhaar_back")} />
          </View>
          <H2>{t("panCard")}</H2>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <DocTile label={t("uploadPan")} file={docs.pan} onPick={pick("pan")} />
            <View style={{ flex: 1 }} />
          </View>
          <H2>{t("profilePhoto")}</H2>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <DocTile label={t("uploadPhoto")} file={docs.photo} onPick={pick("photo")} />
            <View style={{ flex: 1 }} />
          </View>
          <Notice text={`🛡️ ${t("docsSecure")}`} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(!consent)}
            style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: consent ? color.wine : color.line,
              backgroundColor: consent ? color.wine : color.white, alignItems: "center", justifyContent: "center" }}>
              {consent && <Text style={{ color: color.white, fontWeight: "900" }}>✓</Text>}
            </View>
            <Text style={{ flex: 1, color: color.ink, fontSize: 15 }}>{t("consent")}</Text>
          </Pressable>
          <Notice tone="error" text={error} />
          <Button title={t("submitVerification")} busy={busy} disabled={!docsDone} onPress={submit} />
          <Button title={t("back")} kind="ghost" onPress={() => setStep(1)} />
        </Card>
      )}
    </Screen>
  );
}
