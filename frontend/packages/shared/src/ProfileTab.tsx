import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { api, type Role, type Session, type TeacherProfile } from "./index";
import { themes } from "./theme";

type Props = {
  role: Role;
  session: Session;
  onLogout: () => void;
};

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
        contentContainerStyle={{ padding: 20, paddingTop: 80, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ fontSize: 40, textAlign: "center" }}>{theme.emoji}</Text>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 6 }}>
            {session.user.name}
          </Text>
          <Text style={{ color: theme.subtext, textAlign: "center" }}>{session.user.email}</Text>
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}>
              {role === "teacher" ? "TEACHER" : "STUDENT"}
            </Text>
          </View>
        </View>

        {role === "teacher" ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 10 }}>
              Your teacher profile
            </Text>
            {loading ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <>
                <Text style={{ color: theme.subtext, fontSize: 12 }}>Bio</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                  placeholder="English language teacher"
                  placeholderTextColor={theme.subtext}
                  multiline
                  value={bio}
                  onChangeText={setBio}
                />
                <Text style={{ color: theme.subtext, fontSize: 12 }}>Institution</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                  placeholder="ABC School"
                  placeholderTextColor={theme.subtext}
                  value={institution}
                  onChangeText={setInstitution}
                />
                <Text style={{ color: theme.subtext, fontSize: 12 }}>Subjects (comma separated)</Text>
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
            <Text style={{ color: theme.subtext, textAlign: "center" }}>
              🎓 Your learning journey starts here. Join classrooms with the code your
              teacher gives you, then ask the AI tutor about your lessons.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.surface, borderColor: theme.danger, borderWidth: 1, marginTop: 16 }]}
          onPress={onLogout}
        >
          <Text style={{ color: theme.danger, fontWeight: "700" }}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
  badge: { alignSelf: "center", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 4,
    marginBottom: 10,
  },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
