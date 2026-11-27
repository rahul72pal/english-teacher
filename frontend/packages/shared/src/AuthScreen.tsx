import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api, type Role, type Session } from "./index";
import { themes } from "./theme";

type Props = {
  role: Role;
  onAuthed: (session: Session) => void;
};

const TOP_HEADER_PADDING =
  Platform.OS === "ios"
    ? 56
    : StatusBar.currentHeight
    ? StatusBar.currentHeight + 12
    : 44;

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
      onAuthed({
        token: result.access_token,
        refreshToken: result.refresh_token,
        user: result.user,
      });
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
      contentContainerStyle={[styles.content, { paddingTop: TOP_HEADER_PADDING + 20 }]}
      keyboardShouldPersistTaps="handled"
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.brandRow}>
          <View style={[styles.brandIconContainer, { backgroundColor: theme.accentSoft }]}>
            <Ionicons
              name={role === "teacher" ? "school" : "book"}
              size={32}
              color={theme.accent}
            />
          </View>
          <Text style={[styles.logo, { color: theme.text }]}>
            English Teacher
          </Text>
        </View>

        <View style={styles.roleBadgeContainer}>
          <View style={[styles.roleBadge, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.roleBadgeText, { color: theme.accent }]}>
              {role === "teacher" ? "TEACHER PORTAL" : "STUDENT PORTAL"}
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            {mode === "login" ? "Sign in to continue" : "Create your account"}
          </Text>
        </View>

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
            <Text style={{ color: theme.accent, textAlign: "center", marginTop: 16, fontWeight: "600" }}>
              {mode === "login"
                ? `New here? Sign up as ${roleLabel.toLowerCase()}`
                : "Already have an account? Log in"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.demo}>
          <Text style={{ color: theme.subtext, textAlign: "center", marginBottom: 8, fontSize: 13, fontWeight: "600" }}>
            Demo accounts (seeded)
          </Text>
          <Pressable
            onPress={() => {
              setEmail("teacher@demo.com");
              setPassword("Teacher@12345");
              setMode("login");
            }}
            style={styles.demoButton}
          >
            <Ionicons name="school-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.accent }}>
              teacher@demo.com / Teacher@12345
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setEmail("student@demo.com");
              setPassword("Student@12345");
              setMode("login");
            }}
            style={[styles.demoButton, { marginTop: 6 }]}
          >
            <Ionicons name="person-outline" size={14} color={theme.accent} style={{ marginRight: 6 }} />
            <Text style={{ color: theme.accent }}>
              student@demo.com / Student@12345
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  brandRow: { alignItems: "center", marginBottom: 8 },
  brandIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  logo: { fontSize: 26, fontWeight: "800", letterSpacing: -0.3, textAlign: "center" },
  roleBadgeContainer: { alignItems: "center", marginBottom: 24, marginTop: 4 },
  roleBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  roleBadgeText: { fontSize: 11, fontWeight: "700" },
  subtitle: { fontSize: 14, textAlign: "center" },
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
  demo: { marginTop: 24, alignItems: "center" },
  demoButton: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
});
