import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";

import {
  api,
  type ChapterView,
  type ClassroomStudentView,
  type ClassroomTeacherView,
  type EnrolledStudent,
  type FilePick,
  type Role,
  type Session,
} from "./index";
import { themes } from "./theme";

type Props = { role: Role; session: Session };

export default function ClassroomsTab({ role, session }: Props) {
  const theme = themes[role];
  const [classrooms, setClassrooms] = useState<
    (ClassroomTeacherView | ClassroomStudentView)[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [newClassName, setNewClassName] = useState("");
  const [creating, setCreating] = useState(false);
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

  const detail = classrooms.find((c) => c.id === detailId) as ClassroomTeacherView | undefined;

  if (role === "teacher" && detail) {
    return (
      <ClassroomDetail
        session={session}
        classroom={detail}
        onBack={() => {
          setDetailId(null);
          load();
        }}
      />
    );
  }

  const createClassroom = async () => {
    Keyboard.dismiss();
    if (newClassName.trim().length < 2) return;
    setCreating(true);
    try {
      await api.createClassroom(session.token, { name: newClassName.trim(), description: "" });
      setNewClassName("");
      await load();
    } catch (e) {
      Alert.alert("Could not create classroom", e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const joinClassroom = async () => {
    Keyboard.dismiss();
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

  const isTeacher = role === "teacher";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.hello, { color: theme.text }]}>
          {theme.emoji} {isTeacher ? "Your classrooms" : "My classes"}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          keyboardDismissMode="on-drag"
          data={classrooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListHeaderComponent={
            <View>
              {error ? <Text style={{ color: theme.danger, marginBottom: 8 }}>{error}</Text> : null}
              <View style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.text, fontWeight: "600", marginBottom: 8 }}>
                  {isTeacher ? "➕ Create a new classroom" : "🔗 Join a classroom with a code"}
                </Text>
                {isTeacher ? (
                  <>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                      placeholder="e.g. Class 8 - English"
                      placeholderTextColor={theme.subtext}
                      value={newClassName}
                      onChangeText={setNewClassName}
                      returnKeyType="done"
                      onSubmitEditing={createClassroom}
                    />
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: theme.accent, opacity: creating ? 0.6 : 1 }]}
                      onPress={createClassroom}
                      disabled={creating}
                    >
                      <Text style={styles.buttonText}>{creating ? "Creating..." : "Create classroom"}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TextInput
                      style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                      placeholder="Join code (8 characters)"
                      placeholderTextColor={theme.subtext}
                      autoCapitalize="characters"
                      maxLength={8}
                      value={joinCode}
                      onChangeText={setJoinCode}
                      returnKeyType="join"
                      onSubmitEditing={joinClassroom}
                    />
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: theme.accent, opacity: joining ? 0.6 : 1 }]}
                      onPress={joinClassroom}
                      disabled={joining}
                    >
                      <Text style={styles.buttonText}>{joining ? "Joining..." : "Join classroom"}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => {
                Keyboard.dismiss();
                if (isTeacher) setDetailId(item.id);
              }}
            >
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{item.name}</Text>
              {"description" in item && item.description ? (
                <Text style={{ color: theme.subtext, marginTop: 2 }}>{item.description}</Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                {"join_code" in item ? (
                  <Text style={{ color: theme.subtext, fontSize: 13 }}>
                    🔑 <Text style={{ fontWeight: "700", color: theme.accent }}>{item.join_code}</Text>
                  </Text>
                ) : null}
                {"student_count" in item ? (
                  <Text style={{ color: theme.subtext, fontSize: 13 }}>👥 {item.student_count}</Text>
                ) : null}
                {"teacher_name" in item ? (
                  <Text style={{ color: theme.subtext, fontSize: 13 }}>👩‍🏫 {item.teacher_name}</Text>
                ) : null}
                {"is_active" in item ? (
                  <Text style={{ color: item.is_active ? "#2e7d32" : "#b3261e", fontSize: 13 }}>
                    {item.is_active ? "● Active" : "○ Inactive"}
                  </Text>
                ) : null}
                {isTeacher ? (
                  <Text style={{ color: theme.accent, fontSize: 13, fontWeight: "600" }}>Manage →</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.subtext, textAlign: "center", marginTop: 20 }}>
              {isTeacher
                ? "No classrooms yet — create one above."
                : "No classrooms yet — ask your teacher for a join code."}
            </Text>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

// -------------------------------
// Teacher-only classroom manager
// -------------------------------

function ClassroomDetail({
  session,
  classroom,
  onBack,
}: {
  session: Session;
  classroom: ClassroomTeacherView;
  onBack: () => void;
}) {
  const theme = themes.teacher;
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [chapters, setChapters] = useState<ChapterView[]>([]);
  const [loading, setLoading] = useState(true);
  const [chapterTitle, setChapterTitle] = useState("");
  const [file, setFile] = useState<FilePick | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api.classStudents(session.token, classroom.id),
        api.teacherChapters(session.token, classroom.id),
      ]);
      setStudents(s.students);
      setChapters(c.chapters);
    } catch (e) {
      Alert.alert("Load failed", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session.token, classroom.id]);

  useEffect(() => {
    load();
  }, [load]);

  const pickAndUpload = async () => {
    Keyboard.dismiss();
    if (chapterTitle.trim().length < 1) {
      Alert.alert("Title required", "Give the chapter a title first.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setFile({ uri: asset.uri, name: asset.name ?? "chapter.pdf" });
      setUploading(true);
      await api.uploadChapter(session.token, classroom.id, chapterTitle.trim(), {
        uri: asset.uri,
        name: asset.name ?? "chapter.pdf",
      });
      setChapterTitle("");
      await load();
      Alert.alert("Uploaded", "Chapter uploaded and queued for processing.");
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      setFile(null);
    }
  };

  const toggleStatus = async () => {
    setBusy("status");
    try {
      await api.setClassroomStatus(session.token, classroom.id, !classroom.is_active);
      onBack();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const reprocess = async (chapterId: string) => {
    setBusy(chapterId);
    try {
      await api.reprocessChapter(session.token, chapterId);
      await load();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleStatus} disabled={busy === "status"}>
          <Text style={{ color: classroom.is_active ? theme.danger : "#2e7d32", fontWeight: "600" }}>
            {busy === "status" ? "..." : classroom.is_active ? "Deactivate" : "Activate"}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          keyboardDismissMode="on-drag"
          data={chapters}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          ListHeaderComponent={
            <View>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>
                {classroom.name}
              </Text>
              <Text style={{ color: theme.subtext, marginTop: 2, marginBottom: 14 }}>
                🔑 Join code: {classroom.join_code} · 👥 {classroom.student_count} student(s)
              </Text>

              {/* students */}
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Enrolled students</Text>
              {students.length === 0 ? (
                <Text style={{ color: theme.subtext, marginBottom: 12 }}>
                  No students enrolled yet. Share the join code.
                </Text>
              ) : (
                students.map((s) => (
                  <View
                    key={s.id}
                    style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  >
                    <Text style={{ color: theme.text, fontWeight: "600" }}>{s.name}</Text>
                    <Text style={{ color: theme.subtext, fontSize: 12 }}>{s.email}</Text>
                  </View>
                ))
              )}

              {/* upload chapter */}
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Upload chapter (PDF)</Text>
              <View style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                  placeholder="Chapter title"
                  placeholderTextColor={theme.subtext}
                  value={chapterTitle}
                  onChangeText={setChapterTitle}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: theme.accent, opacity: uploading ? 0.6 : 1 }]}
                  onPress={pickAndUpload}
                  disabled={uploading}
                >
                  <Text style={styles.buttonText}>
                    {uploading ? "Uploading..." : "Choose PDF & upload"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { color: theme.text }]}>Chapters</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.text, fontWeight: "600", flex: 1 }}>{item.title}</Text>
                <Text
                  style={{
                    color:
                      item.status === "ready" ? "#2e7d32" : item.status === "failed" ? theme.danger : theme.subtext,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {item.status === "ready" ? `✅ ready (${item.chunk_count})` : item.status === "failed" ? "❌ failed" : "⏳ processing"}
                </Text>
              </View>
              {item.error ? (
                <Text style={{ color: theme.danger, fontSize: 12, marginTop: 4 }}>{item.error}</Text>
              ) : null}
              {item.status !== "processing" ? (
                <TouchableOpacity onPress={() => reprocess(item.id)} disabled={busy === item.id} style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.accent, fontWeight: "600", fontSize: 13 }}>
                    {busy === item.id ? "Reprocessing..." : "↻ Reprocess"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.subtext, textAlign: "center", marginTop: 8 }}>
              No chapters yet — upload a PDF above.
            </Text>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hello: { fontSize: 20, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 10, marginBottom: 8 },
  actionCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
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
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 10 },
});
