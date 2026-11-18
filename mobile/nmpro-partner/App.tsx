import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setupNotifications } from "./src/alerts";
import { api, ApiError, loadSession, signOut, type JoiningFee, type Profile } from "./src/api";
import { I18nProvider } from "./src/i18n";
import { Login, Welcome } from "./src/screens/Auth";
import { Home } from "./src/screens/Home";
import { JobDetail } from "./src/screens/JobDetail";
import { Join } from "./src/screens/Join";
import { FeeScreen, ReviewScreen } from "./src/screens/Status";
import { Loading } from "./src/ui";

/**
 * NMPRO Partner — the NammaPros technician app. Backend: the NammaPros Django API (bearer tokens).
 * Screens follow the account state: signed out → welcome/login/join; fee unpaid → fee (step 3);
 * waiting for approval → review (step 4); approved → jobs.
 */
type Route =
  | { name: "loading" }
  | { name: "welcome" } | { name: "login" } | { name: "join" }
  | { name: "fee"; fee: JoiningFee; firstJoin: boolean }
  | { name: "locked"; inReview: boolean; note: string }
  | { name: "home"; profile: Profile }
  | { name: "job"; profile: Profile; id: string };

function Root() {
  const [route, setRoute] = useState<Route>({ name: "loading" });
  const [busy, setBusy] = useState(false);

  /** Work out where a signed-in partner belongs. */
  const resolve = useCallback(async () => {
    setBusy(true);
    try {
      await api.jobs();  // opens only for approved partners with app access
      setRoute({ name: "home", profile: await api.me() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setRoute({ name: "welcome" });
      } else if (e instanceof ApiError && e.status === 403) {
        const [fee, me] = await Promise.all([api.joiningFee().catch(() => null), api.me().catch(() => null)]);
        if (fee && !fee.settled) setRoute({ name: "fee", fee, firstJoin: !fee.paid_at });
        else setRoute({ name: "locked", inReview: Boolean(me && ["UNDER_REVIEW", "PENDING_DOCUMENTS"].includes(me.verification_status)), note: e.message });
      } else {
        setRoute({ name: "locked", inReview: false, note: e instanceof Error ? e.message : "Please try again." });
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setupNotifications().catch(() => undefined);
    let active = true;
    loadSession().then((signedIn) => {
      if (!active) return;
      if (signedIn) void resolve();
      else setRoute({ name: "welcome" });
    });
    return () => { active = false; };
  }, [resolve]);

  const doSignOut = async () => {
    await signOut();
    setRoute({ name: "welcome" });
  };

  switch (route.name) {
    case "loading": return <Loading />;
    case "welcome": return <Welcome onLogin={() => setRoute({ name: "login" })} onJoin={() => setRoute({ name: "join" })} />;
    case "login": return <Login onDone={() => void resolve()} onBack={() => setRoute({ name: "welcome" })} />;
    case "join": return <Join onSubmitted={() => void resolve()} onBack={() => setRoute({ name: "welcome" })} />;
    case "fee": return <FeeScreen fee={route.fee} firstJoin={route.firstJoin} busy={busy} onRefresh={() => void resolve()} onSignOut={() => void doSignOut()} />;
    case "locked": return <ReviewScreen inReview={route.inReview} note={route.note} busy={busy} onRefresh={() => void resolve()} onSignOut={() => void doSignOut()} />;
    case "home": return <Home profile={route.profile} onOpenJob={(id) => setRoute({ name: "job", profile: route.profile, id })} onSignOut={() => void doSignOut()} />;
    case "job": return <JobDetail id={route.id} onBack={() => setRoute({ name: "home", profile: route.profile })} />;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <StatusBar style="light" />
        <Root />
      </I18nProvider>
    </SafeAreaProvider>
  );
}
