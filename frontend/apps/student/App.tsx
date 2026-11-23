import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import AuthScreen from "@english-teacher/shared/src/AuthScreen";
import TabsShell from "@english-teacher/shared/src/TabsShell";
import type { Role, Session } from "@english-teacher/shared/src/index";

const ROLE: Role = "student";
const STORAGE_KEY = "@english_teacher/session/student";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const s = JSON.parse(raw) as Session;
          // ignore sessions saved by the other app / with a different role
          if (s.user?.role === ROLE) setSession(s);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAuthed = (s: Session) => {
    setSession(s);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };

  const handleLogout = () => {
    setSession(null);
    AsyncStorage.removeItem(STORAGE_KEY);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2a6db5" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      {session ? (
        <TabsShell role={ROLE} session={session} onLogout={handleLogout} />
      ) : (
        <AuthScreen role={ROLE} onAuthed={handleAuthed} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
