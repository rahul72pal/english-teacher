import { useEffect, useState } from "react";
import { storageGet, storageRemove, storageSet } from "@english-teacher/shared/src/storage";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import AuthScreen from "@english-teacher/shared/src/AuthScreen";
import TabsShell from "@english-teacher/shared/src/TabsShell";
import { authSessionManager, type Role, type Session } from "@english-teacher/shared/src/index";
import AppProviders from "@english-teacher/shared/src/app/AppProviders";

const ROLE: Role = "teacher";
const STORAGE_KEY = "@english_teacher/session/teacher";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authSessionManager.init(null);
    const raw = storageGet(STORAGE_KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw) as Session;
        // ignore sessions saved by the other app / with a different role
        if (s.user?.role === ROLE) {
          setSession(s);
          authSessionManager.setSession(s);
        }
      } catch {}
    }
    setLoading(false);

    const unsubscribe = authSessionManager.subscribe((newSession) => {
      setSession(newSession);
    });
    return unsubscribe;
  }, []);

  const handleAuthed = (s: Session) => {
    setSession(s);
    authSessionManager.setSession(s);
  };

  const handleLogout = () => {
    setSession(null);
    authSessionManager.setSession(null);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#b57b2a" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      {session ? (
        <AppProviders session={session} role={ROLE}>
          <TabsShell role={ROLE} session={session} onLogout={handleLogout} />
        </AppProviders>
      ) : (
        <AuthScreen role={ROLE} onAuthed={handleAuthed} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
