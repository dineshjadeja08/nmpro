import React from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useI18n, type TextKey } from "./i18n";

export const color = {
  wine: "#800020", wineDark: "#3c1023", rose: "#f8edf1", ink: "#1c1917", muted: "#57534e",
  line: "#e7ded8", bg: "#f6f3f0", white: "#ffffff", ok: "#1f6b44", okBg: "#e7f3ec",
  warn: "#9a3412", warnBg: "#fff4e5", err: "#b42318", errBg: "#fdecea",
};

export function Screen({ children, scroll = true, header }: { children: React.ReactNode; scroll?: boolean; header?: React.ReactNode }) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : <View style={[s.content, { flex: 1 }]}>{children}</View>}
    </SafeAreaView>
  );
}

export function TopBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={s.topbar}>
      <Text style={s.brand}>{title}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>{right}</View>
    </View>
  );
}

export function LangToggle() {
  const { t, toggle } = useI18n();
  return <Pressable accessibilityRole="button" onPress={toggle} style={s.langBtn}><Text style={s.langText}>{t("language")}</Text></Pressable>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) { return <Text style={s.h1} accessibilityRole="header">{children}</Text>; }
export function H2({ children }: { children: React.ReactNode }) { return <Text style={s.h2} accessibilityRole="header">{children}</Text>; }
export function Muted({ children }: { children: React.ReactNode }) { return <Text style={s.muted}>{children}</Text>; }
export function Label({ children }: { children: React.ReactNode }) { return <Text style={s.label}>{children}</Text>; }

type BtnKind = "primary" | "secondary" | "ghost" | "ok";
export function Button({ title, kind = "primary", busy, style, ...rest }: PressableProps & { title: string; kind?: BtnKind; busy?: boolean; style?: StyleProp<ViewStyle> }) {
  const disabled = rest.disabled || busy;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled, busy: !!busy }} {...rest} disabled={disabled}
      style={({ pressed }) => [s.btn, s[`btn_${kind}`], disabled && s.btnDisabled, pressed && !disabled && { opacity: 0.85 }, style]}>
      {busy ? <ActivityIndicator color={kind === "primary" || kind === "ok" ? color.white : color.wine} />
        : <Text style={[s.btnText, s[`btnText_${kind}`]]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...rest }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput placeholderTextColor="#a8a29e" {...rest} style={[s.input, rest.editable === false && { backgroundColor: color.bg }]} />
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && { color: color.wine }]}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ text, tone = "ok" }: { text: string; tone?: "ok" | "warn" | "error" }) {
  if (!text) return null;
  const bg = tone === "error" ? color.errBg : tone === "warn" ? color.warnBg : color.okBg;
  const fg = tone === "error" ? color.err : tone === "warn" ? color.warn : color.ok;
  return <Text accessibilityLiveRegion="polite" style={[s.notice, { backgroundColor: bg, color: fg }]}>{text}</Text>;
}

const STEPS: TextKey[] = ["stepAbout", "stepDocs", "stepFee", "stepReview"];
export function Steps({ step }: { step: 1 | 2 | 3 | 4 }) {
  const { t } = useI18n();
  return (
    <View style={s.steps} accessibilityLabel={`${step} / 4`}>
      {STEPS.map((k, i) => {
        const n = i + 1;
        const done = n < step;
        const now = n === step;
        return (
          <View key={k} style={s.step}>
            {i > 0 && <View style={[s.stepLine, (done || now) && { backgroundColor: color.wine }]} />}
            <View style={[s.dot, done && s.dotDone, now && s.dotNow]}>
              <Text style={[s.dotText, now && { color: color.white }, done && { color: color.wine }]}>{done ? "✓" : n}</Text>
            </View>
            <Text style={[s.stepName, now && { color: color.ink, fontWeight: "700" }]} numberOfLines={1}>{t(k)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function Loading() {
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: color.bg }}><ActivityIndicator size="large" color={color.wine} /></View>;
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  topbar: { backgroundColor: color.wineDark, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: color.white, fontSize: 20, fontWeight: "800" },
  langBtn: { borderWidth: 1, borderColor: "#ffffff66", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  langText: { color: color.white, fontWeight: "700" },
  card: { backgroundColor: color.white, borderRadius: 18, borderWidth: 1, borderColor: color.line, padding: 16, gap: 10 },
  h1: { fontSize: 28, fontWeight: "800", color: color.ink, letterSpacing: -0.4 },
  h2: { fontSize: 19, fontWeight: "800", color: color.ink },
  muted: { fontSize: 15, color: color.muted, lineHeight: 21 },
  label: { fontSize: 15, fontWeight: "700", color: color.ink },
  btn: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  btn_primary: { backgroundColor: color.wine },
  btn_ok: { backgroundColor: color.ok },
  btn_secondary: { backgroundColor: color.rose },
  btn_ghost: { backgroundColor: color.white, borderWidth: 2, borderColor: color.line },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 17, fontWeight: "800" },
  btnText_primary: { color: color.white },
  btnText_ok: { color: color.white },
  btnText_secondary: { color: color.wine },
  btnText_ghost: { color: color.ink },
  input: { minHeight: 52, borderWidth: 2, borderColor: color.line, borderRadius: 12, paddingHorizontal: 14, fontSize: 17, color: color.ink, backgroundColor: color.white },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 2, borderColor: color.line, backgroundColor: color.white, justifyContent: "center" },
  chipOn: { borderColor: color.wine, backgroundColor: color.rose },
  chipText: { fontSize: 15, fontWeight: "600", color: color.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notice: { borderRadius: 12, padding: 12, fontWeight: "600", fontSize: 15, overflow: "hidden" },
  steps: { flexDirection: "row", marginVertical: 6 },
  step: { flex: 1, alignItems: "center", gap: 4 },
  stepLine: { position: "absolute", top: 15, right: "50%", width: "100%", height: 2, backgroundColor: color.line },
  dot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: color.line, backgroundColor: color.white, alignItems: "center", justifyContent: "center" },
  dotNow: { backgroundColor: color.wine, borderColor: color.wine },
  dotDone: { backgroundColor: color.rose, borderColor: color.wine },
  dotText: { fontWeight: "800", color: color.muted },
  stepName: { fontSize: 11, color: color.muted },
});
