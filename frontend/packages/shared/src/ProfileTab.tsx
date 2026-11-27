import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api, type Role, type Session, type TeacherProfile } from "./index";
import { themes } from "./theme";

type Props = {
  role: Role;
  session: Session;
  onLogout: () => void;
};

const TOP_HEADER_PADDING =
  Platform.OS === "ios"
    ? 56
    : StatusBar.currentHeight
    ? StatusBar.currentHeight + 12
    : 44;

export default function ProfileTab({ role, session, onLogout }: Props) {
  const theme = themes[role];
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [loading, setLoading] = useState(role === "teacher");
  const [bio, setBio] = useState("");
  const [institution, setInstitution] = useState("");
  const [subjects, setSubjects] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role !== "teacher") return;
    api
      .teacherProfile(session.token)
      .then((p) => {
        setProfile(p);
        setBio(p.bio);
        setInstitution(p.institution);
        setSubjects(p.subjects.join(", "));
      })
      .catch(() => {
        // No profile yet — start empty; first save creates it.
      })
      .finally(() => setLoading(false));
  }, [role, session.token]);

  const save = async () => {
    setSaving(true);
    try {
      const p = await api.updateTeacherProfile(session.token, {
        bio: bio.trim(),
        institution: institution.trim(),
        subjects: subjects
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20),
      });
      setProfile(p);
      Alert.alert("Saved", "Your teacher profile has been updated.");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: TOP_HEADER_PADDING + 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.avatarCircle, { backgroundColor: theme.accentSoft }]}>
            <Ionicons
              name={role === "teacher" ? "school" : "person"}
              size={36}
              color={theme.accent}
            />
          </View>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 8 }}>
            {session.user.name}
          </Text>
          <Text style={{ color: theme.subtext, textAlign: "center", fontSize: 13, marginTop: 2 }}>{session.user.email}</Text>
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 11 }}>
              {role === "teacher" ? "TEACHER ACCOUNT" : "STUDENT ACCOUNT"}
            </Text>
          </View>
        </View>

        {role === "teacher" ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="create-outline" size={18} color={theme.accent} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}>
                Your teacher profile
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <>
                <Text style={[styles.inputLabel, { color: theme.subtext }]}>Bio</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                  placeholder="English language teacher"
                  placeholderTextColor={theme.subtext}
                  multiline
                  value={bio}
                  onChangeText={setBio}
                />
                <Text style={[styles.inputLabel, { color: theme.subtext }]}>Institution</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                  placeholder="ABC School"
                  placeholderTextColor={theme.subtext}
                  value={institution}
                  onChangeText={setInstitution}
                />
                <Text style={[styles.inputLabel, { color: theme.subtext }]}>Subjects (comma separated)</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                  placeholder="English, Grammar"
                  placeholderTextColor={theme.subtext}
                  value={subjects}
                  onChangeText={setSubjects}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: theme.accent, opacity: saving ? 0.6 : 1 }]}
                  onPress={save}
                  disabled={saving}
                >
                  <Text style={styles.buttonText}>{saving ? "Saving..." : "Save profile"}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="sparkles" size={18} color={theme.accent} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}>
                Student Learning Hub
              </Text>
            </View>
            <View style={styles.studentFeatureList}>
              <View style={styles.studentFeatureItem}>
                <Ionicons name="key-outline" size={16} color={theme.accent} style={styles.featureIcon} />
                <Text style={[styles.featureText, { color: theme.text }]}>
                  Join classes using 8-character codes provided by your teacher
                </Text>
              </View>
              <View style={styles.studentFeatureItem}>
                <Ionicons name="book-outline" size={16} color={theme.accent} style={styles.featureIcon} />
                <Text style={[styles.featureText, { color: theme.text }]}>
                  Read lesson chapters in PDF with instant keyword search
                </Text>
              </View>
              <View style={styles.studentFeatureItem}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.accent} style={styles.featureIcon} />
                <Text style={[styles.featureText, { color: theme.text }]}>
                  Ask the AI English tutor questions answered directly from your syllabus
                </Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: theme.surface, borderColor: theme.danger }]}
          onPress={onLogout}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.danger} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.danger, fontWeight: "700", fontSize: 15 }}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 18, marginBottom: 14 },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  badge: {
    alignSelf: "center",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  inputLabel: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 4,
    marginBottom: 10,
  },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  studentFeatureList: { gap: 12, marginTop: 4 },
  studentFeatureItem: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  featureIcon: { marginTop: 2 },
  featureText: { flex: 1, fontSize: 13, lineHeight: 18 },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    marginTop: 10,
  },
});
