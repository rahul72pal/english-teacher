import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  api,
  type ClassroomStudentView,
  type ClassroomTeacherView,
  type Role,
  type Session,
} from "./index";
import { themes } from "./theme";

type Props = {
  role: Role;
  session: Session;
  onLogout: () => void;
};

export default function DashboardScreen({ role, session, onLogout }: Props) {
  const theme = themes[role];
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<
    (ClassroomTeacherView | ClassroomStudentView)[]
  >([]);
  // teacher: create classroom form
  const [newClassName, setNewClassName] = useState("");
  const [creating, setCreating] = useState(false);
  // student: join classroom form
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data =
        role === "teacher"
          ? await api.teacherClassrooms(session.token)
          : await api.studentClassrooms(session.token);
      setClassrooms(data.classrooms);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role, session.token]);

  useEffect(() => {
    load();
  }, [load]);

  const createClassroom = async () => {
    if (newClassName.trim().length < 2) return;
    setCreating(true);
    try {
      await api.createClassroom(session.token, {
        name: newClassName.trim(),
        description: "",
      });
      setNewClassName("");
      await load();
    } catch (e) {
      Alert.alert("Could not create classroom", e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const joinClassroom = async () => {
    if (joinCode.trim().length !== 8) {
      Alert.alert("Invalid code", "A join code has 8 characters.");
      return;
    }
    setJoining(true);
    try {
      const res = await api.joinClassroom(session.token, joinCode.trim().toUpperCase());
      setJoinCode("");
      await load();
      Alert.alert("Success", res.message);
    } catch (e) {
      Alert.alert("Could not join", e instanceof Error ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert("Log out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: onLogout },
    ]);
  };

  const roleLabel = role === "teacher" ? "Teacher" : "Student";

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* header */}
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <View>
          <Text style={[styles.hello, { color: theme.text }]}>
            {theme.emoji} Hi, {session.user.name.split(" ")[0]}!
          </Text>
          <Text style={{ color: theme.subtext, fontSize: 13 }}>
            {roleLabel} · {session.user.email}
          </Text>
        </View>
        <TouchableOpacity onPress={confirmLogout} style={[styles.logout, { borderColor: theme.border }]}>
          <Text style={{ color: theme.danger, fontWeight: "600" }}>Log out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={classrooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListHeaderComponent={
            <View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {role === "teacher" ? "Your classrooms" : "My classrooms"}
              </Text>
              {error ? <Text style={{ color: theme.danger, marginBottom: 8 }}>{error}</Text> : null}

              {role === "teacher" ? (
                <View style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontWeight: "600", marginBottom: 8 }}>
                    Create a new classroom
                  </Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                    placeholder="e.g. Class 8 - English"
                    placeholderTextColor={theme.subtext}
                    value={newClassName}
                    onChangeText={setNewClassName}
                  />
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: theme.accent, opacity: creating ? 0.6 : 1 }]}
                    onPress={createClassroom}
                    disabled={creating}
                  >
                    <Text style={styles.buttonText}>{creating ? "Creating..." : "Create classroom"}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontWeight: "600", marginBottom: 8 }}>
                    Join a classroom with a code
                  </Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                    placeholder="Join code (8 characters)"
                    placeholderTextColor={theme.subtext}
                    autoCapitalize="characters"
                    maxLength={8}
                    value={joinCode}
                    onChangeText={setJoinCode}
                  />
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: theme.accent, opacity: joining ? 0.6 : 1 }]}
                    onPress={joinClassroom}
                    disabled={joining}
                  >
                    <Text style={styles.buttonText}>{joining ? "Joining..." : "Join classroom"}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{item.name}</Text>
              {"description" in item && item.description ? (
                <Text style={{ color: theme.subtext, marginTop: 2 }}>{item.description}</Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                {"join_code" in item ? (
                  <Text style={{ color: theme.subtext, fontSize: 13 }}>
                    🔑 Join code: <Text style={{ fontWeight: "700", color: theme.accent }}>{item.join_code}</Text>
                  </Text>
                ) : null}
                {"student_count" in item ? (
                  <Text style={{ color: theme.subtext, fontSize: 13 }}>
                    👥 {item.student_count} student(s)
                  </Text>
                ) : null}
                {"teacher_name" in item ? (
                  <Text style={{ color: theme.subtext, fontSize: 13 }}>👩‍🏫 {item.teacher_name}</Text>
                ) : null}
                {"is_active" in item ? (
                  <Text style={{ color: item.is_active ? "#2e7d32" : "#b3261e", fontSize: 13 }}>
                    {item.is_active ? "● Active" : "○ Inactive"}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.subtext, textAlign: "center", marginTop: 20 }}>
              {role === "teacher"
                ? "No classrooms yet — create one above."
                : "No classrooms yet — ask your teacher for a join code."}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hello: { fontSize: 22, fontWeight: "800" },
  logout: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  actionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
});
