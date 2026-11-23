import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { api, type Role, type Session } from "./index";
import { themes } from "./theme";

type Props = {
  role: Role;
  onAuthed: (session: Session) => void;
};

export default function AuthScreen({ role, onAuthed }: Props) {
  const theme = themes[role];
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signup" && name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    setLoading(true);
    try {
      const result =
        mode === "signup"
          ? await api.signup(role, { name: name.trim(), email: email.trim(), password })
          : await api.login({ email: email.trim(), password });
      onAuthed({ token: result.access_token, user: result.user });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = role === "teacher" ? "Teacher" : "Student";

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={[styles.logo, { color: theme.text }]}>
          {theme.emoji} English Teacher
        </Text>
        <Text style={[styles.subtitle, { color: theme.subtext }]}>
          {roleLabel} {mode === "login" ? "login" : "signup"}
        </Text>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {mode === "signup" && (
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              placeholder="Full name"
              placeholderTextColor={theme.subtext}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
          )}
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="Email"
            placeholderTextColor={theme.subtext}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="Password"
            placeholderTextColor={theme.subtext}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.accent }]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === "login" ? "Log in" : "Create account"}
              </Text>
            )}
          </TouchableOpacity>

          <Pressable
            onPress={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
            }}
            style={styles.switch}
          >
            <Text style={{ color: theme.accent, textAlign: "center", marginTop: 16 }}>
              {mode === "login"
                ? `New here? Sign up as ${roleLabel.toLowerCase()}`
                : "Already have an account? Log in"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.demo}>
          <Text style={{ color: theme.subtext, textAlign: "center", marginBottom: 8 }}>
            Demo accounts (seeded)
          </Text>
          <Pressable
            onPress={() => {
              setEmail("teacher@demo.com");
              setPassword("Teacher@12345");
              setMode("login");
            }}
          >
            <Text style={{ color: theme.accent, textAlign: "center" }}>
              Use teacher@demo.com / Teacher@12345
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setEmail("student@demo.com");
              setPassword("Student@12345");
              setMode("login");
            }}
          >
            <Text style={{ color: theme.accent, textAlign: "center", marginTop: 4 }}>
              Use student@demo.com / Student@12345
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: 80 },
  logo: { fontSize: 30, fontWeight: "800", textAlign: "center" },
  subtitle: { fontSize: 16, textAlign: "center", marginTop: 6, marginBottom: 28 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  switch: { marginTop: 4 },
  error: { marginBottom: 10, fontSize: 13 },
  demo: { marginTop: 28 },
});
