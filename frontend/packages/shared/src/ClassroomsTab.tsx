import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";

import {
  api,
  type ChapterView,
  type ClassroomStudentView,
  type ClassroomTeacherView,
  type EnrolledStudent,
  type FilePick,
  type Role,
  type Session,
  type TutorCitation,
} from "./index";
import { themes } from "./theme";
import ChapterDetailScreen from "./ChapterDetailScreen";
import TestFlow from "./tests/TestFlow";

type Props = {
  role: Role;
  session: Session;
  onNavigateToTests?: (classroomId?: string) => void;
};

const TOP_HEADER_PADDING =
  Platform.OS === "ios"
    ? 56
    : StatusBar.currentHeight
    ? StatusBar.currentHeight + 12
    : 44;

export default function ClassroomsTab({ role, session, onNavigateToTests }: Props) {
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

  const teacherDetail =
    role === "teacher"
      ? (classrooms.find((c) => c.id === detailId) as ClassroomTeacherView | undefined)
      : undefined;

  const studentDetail =
    role === "student"
      ? (classrooms.find((c) => c.id === detailId) as ClassroomStudentView | undefined)
      : undefined;

  if (role === "teacher" && teacherDetail) {
    return (
      <ClassroomDetail
        session={session}
        classroom={teacherDetail}
        onNavigateToTests={onNavigateToTests}
        onBack={() => {
          setDetailId(null);
          load();
        }}
      />
    );
  }

  if (role === "student" && studentDetail) {
    return (
      <StudentClassroomDetail
        session={session}
        classroom={studentDetail}
        onNavigateToTests={onNavigateToTests}
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
        <View style={styles.headerLeftGroup}>
          <Ionicons name="school-outline" size={22} color={theme.text} style={styles.headerIcon} />
          <Text style={[styles.hello, { color: theme.text }]}>
            {isTeacher ? "Your Classrooms" : "My Classes"}
          </Text>
        </View>
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
                <View style={styles.actionCardHeader}>
                  <Ionicons
                    name={isTeacher ? "add-circle-outline" : "link-outline"}
                    size={18}
                    color={theme.accent}
                    style={styles.cardIcon}
                  />
                  <Text style={[styles.actionCardTitle, { color: theme.text }]}>
                    {isTeacher ? "Create a new classroom" : "Join a classroom with a code"}
                  </Text>
                </View>
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
                setDetailId(item.id);
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{item.name}</Text>
              {"description" in item && item.description ? (
                <Text style={{ color: theme.subtext, marginTop: 2 }}>{item.description}</Text>
              ) : null}
              <View style={styles.cardMetaRow}>
                {"join_code" in item ? (
                  <View style={styles.cardMetaItem}>
                    <Ionicons name="key-outline" size={13} color={theme.subtext} />
                    <Text style={[styles.cardMetaText, { color: theme.subtext }]}>
                      Code: <Text style={[styles.codeHighlight, { color: theme.accent }]}>{item.join_code}</Text>
                    </Text>
                  </View>
                ) : null}
                {"student_count" in item ? (
                  <View style={styles.cardMetaItem}>
                    <Ionicons name="people-outline" size={13} color={theme.subtext} />
                    <Text style={[styles.cardMetaText, { color: theme.subtext }]}>{item.student_count} student(s)</Text>
                  </View>
                ) : null}
                {"teacher_name" in item ? (
                  <View style={styles.cardMetaItem}>
                    <Ionicons name="person-outline" size={13} color={theme.subtext} />
                    <Text style={[styles.cardMetaText, { color: theme.subtext }]}>Teacher: {item.teacher_name}</Text>
                  </View>
                ) : null}
                {"is_active" in item ? (
                  <View style={styles.cardMetaItem}>
                    <View
                      style={[
                        styles.activeDot,
                        { backgroundColor: item.is_active ? "#15803d" : "#b91c1c" },
                      ]}
                    />
                    <Text
                      style={[
                        styles.cardMetaText,
                        { color: item.is_active ? "#15803d" : "#b91c1c" },
                      ]}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.manageRow}>
                  <Text style={[styles.manageText, { color: theme.accent }]}>
                    {isTeacher ? "Manage" : "View Lessons"}
                  </Text>
                  <Ionicons name="arrow-forward" size={12} color={theme.accent} />
                </View>
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
  onNavigateToTests,
  onBack,
}: {
  session: Session;
  classroom: ClassroomTeacherView;
  onNavigateToTests?: (classroomId?: string) => void;
  onBack: () => void;
}) {
  const theme = themes.teacher;
  const [selectedChapter, setSelectedChapter] = useState<ChapterView | null>(null);
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

  if (selectedChapter) {
    return (
      <ChapterDetailScreen
        session={session}
        classroom={classroom}
        chapter={selectedChapter}
        onBack={() => {
          setSelectedChapter(null);
          load();
        }}
      />
    );
  }

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
        file: (asset as { file?: File }).file,
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

  const deleteChapter = (chapterId: string, chapterTitle: string) => {
    Alert.alert(
      "Delete chapter",
      `Delete "${chapterTitle}"? Its PDF and all AI embeddings will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(chapterId);
            try {
              await api.deleteChapter(session.token, classroom.id, chapterId);
              Alert.alert("Deleted", "The chapter and its embeddings were removed.");
              await load();
            } catch (e) {
              Alert.alert("Delete failed", e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtnRow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleStatus} disabled={busy === "status"}>
          <Text style={{ color: classroom.is_active ? theme.danger : "#15803d", fontWeight: "600" }}>
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
              <Text style={[styles.classroomTitle, { color: theme.text }]}>
                {classroom.name}
              </Text>
              <View style={styles.classroomSubtitleRow}>
                <Ionicons name="key-outline" size={13} color={theme.subtext} />
                <Text style={{ color: theme.subtext, fontSize: 13, marginRight: 8 }}>
                  Join code: <Text style={{ fontWeight: "700", color: theme.accent }}>{classroom.join_code}</Text>
                </Text>
                <Ionicons name="people-outline" size={13} color={theme.subtext} />
                <Text style={{ color: theme.subtext, fontSize: 13 }}>
                  {classroom.student_count} student(s)
                </Text>
              </View>

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

              {/* tests shortcut */}
              {onNavigateToTests && (
                <View style={[styles.testCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.testHeaderRow}>
                    <View style={styles.testHeaderLeft}>
                      <Ionicons name="document-text-outline" size={18} color={theme.accent} style={{ marginRight: 6 }} />
                      <Text style={[styles.testCardTitle, { color: theme.text }]}>
                        Tests & Quizzes
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.testButton, { backgroundColor: theme.accent }]}
                      onPress={() => onNavigateToTests(classroom.id)}
                    >
                      <Text style={styles.testButtonText}>Manage Tests</Text>
                      <Ionicons name="arrow-forward" size={12} color="#ffffff" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.testCardSubtitle, { color: theme.subtext }]}>
                    Generate AI assessments grounded in this classroom's chapters.
                  </Text>
                </View>
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
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => setSelectedChapter(item)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16, flex: 1 }}>{item.title}</Text>
                <View style={styles.chapterBadgeRow}>
                  {item.status === "ready" ? (
                    <View style={styles.statusBadgeGreen}>
                      <Ionicons name="checkmark-circle" size={13} color="#15803d" />
                      <Text style={styles.statusBadgeGreenText}>ready ({item.chunk_count})</Text>
                    </View>
                  ) : item.status === "failed" ? (
                    <View style={styles.statusBadgeRed}>
                      <Ionicons name="alert-circle" size={13} color="#b91c1c" />
                      <Text style={styles.statusBadgeRedText}>failed</Text>
                    </View>
                  ) : (
                    <View style={styles.statusBadgeGray}>
                      <Ionicons name="time-outline" size={13} color={theme.subtext} />
                      <Text style={styles.statusBadgeGrayText}>processing</Text>
                    </View>
                  )}
                </View>
              </View>
              {item.error ? (
                <Text style={{ color: theme.danger, fontSize: 12, marginTop: 4 }}>{item.error}</Text>
              ) : null}
              {item.warning ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fffbeb", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, marginTop: 6, borderWidth: 1, borderColor: "#fde68a" }}>
                  <Ionicons name="warning-outline" size={13} color="#b45309" />
                  <Text style={{ color: "#b45309", fontSize: 11, fontWeight: "500", flex: 1 }}>{item.warning}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Text style={{ color: theme.accent, fontSize: 13, fontWeight: "600" }}>
                    View PDF & Ask AI
                  </Text>
                  <Ionicons name="arrow-forward" size={12} color={theme.accent} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {item.status !== "processing" ? (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        reprocess(item.id);
                      }}
                      disabled={busy === item.id}
                      style={styles.reprocessBtnRow}
                    >
                      <Ionicons name="sync-outline" size={12} color={theme.subtext} />
                      <Text style={{ color: theme.subtext, fontWeight: "600", fontSize: 12 }}>
                        {busy === item.id ? "Reprocessing..." : "Reprocess"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      deleteChapter(item.id, item.title);
                    }}
                    disabled={busy === item.id}
                    style={styles.reprocessBtnRow}
                  >
                    <Ionicons name="trash-outline" size={12} color="#b91c1c" />
                    <Text style={{ color: "#b91c1c", fontWeight: "600", fontSize: 12 }}>
                      {busy === item.id ? "Deleting..." : "Delete"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
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

// -------------------------------
// Student classroom viewer
// -------------------------------

function StudentClassroomDetail({
  session,
  classroom,
  onNavigateToTests,
  onBack,
}: {
  session: Session;
  classroom: ClassroomStudentView;
  onNavigateToTests?: (classroomId?: string) => void;
  onBack: () => void;
}) {
  const theme = themes.student;
  const [selectedChapter, setSelectedChapter] = useState<ChapterView | null>(null);
  const [showTests, setShowTests] = useState(false);
  const [chapters, setChapters] = useState<ChapterView[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TutorCitation[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api.studentChapters(session.token, classroom.id);
      setChapters(data.chapters);
    } catch (e) {
      Alert.alert("Load failed", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session.token, classroom.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (showTests) {
    return (
      <TestFlow
        session={session}
        classroomId={classroom.id}
        classroomName={classroom.name}
        onBack={() => setShowTests(false)}
      />
    );
  }

  if (selectedChapter) {
    return (
      <ChapterDetailScreen
        session={session}
        classroom={classroom}
        chapter={selectedChapter}
        onBack={() => {
          setSelectedChapter(null);
          load();
        }}
      />
    );
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    Keyboard.dismiss();
    setSearching(true);
    try {
      const res = await api.searchChapters(session.token, classroom.id, searchQuery.trim());
      setSearchResults(res.results || []);
    } catch (e) {
      Alert.alert("Search failed", e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  };

  const openChapterById = (chapterId: string) => {
    const ch = chapters.find((c) => c.id === chapterId);
    if (ch) {
      setSelectedChapter(ch);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtnRow}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
        <View style={[styles.roleTag, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="school-outline" size={13} color={theme.accent} />
          <Text style={[styles.roleTagText, { color: theme.accent }]}>Student</Text>
        </View>
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
              <Text style={[styles.classroomTitle, { color: theme.text }]}>
                {classroom.name}
              </Text>
              <View style={styles.classroomSubtitleRow}>
                <Ionicons name="person-outline" size={13} color={theme.subtext} />
                <Text style={{ color: theme.subtext, fontSize: 13, marginRight: 8 }}>
                  Teacher: {classroom.teacher_name}
                </Text>
              </View>

              {classroom.description ? (
                <Text style={{ color: theme.subtext, fontSize: 14, marginBottom: 14 }}>
                  {classroom.description}
                </Text>
              ) : null}

              {/* Tests & Quizzes shortcut */}
              <View style={[styles.testCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.testHeaderRow}>
                  <View style={styles.testHeaderLeft}>
                    <Ionicons name="document-text-outline" size={18} color={theme.accent} style={{ marginRight: 6 }} />
                    <Text style={[styles.testCardTitle, { color: theme.text }]}>
                      Class Tests & Assessments
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.testButton, { backgroundColor: theme.accent }]}
                    onPress={() => {
                      if (onNavigateToTests) {
                        onNavigateToTests(classroom.id);
                      } else {
                        setShowTests(true);
                      }
                    }}
                  >
                    <Text style={styles.testButtonText}>View Tests</Text>
                    <Ionicons name="arrow-forward" size={12} color="#ffffff" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.testCardSubtitle, { color: theme.subtext }]}>
                  Take published tests, view your grades, and review question feedback.
                </Text>
              </View>

              {/* Semantic search */}
              <View style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.actionCardHeader}>
                  <Ionicons name="search-outline" size={16} color={theme.accent} style={styles.cardIcon} />
                  <Text style={[styles.actionCardTitle, { color: theme.text }]}>
                    Search across class lessons
                  </Text>
                </View>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                  placeholder="e.g. past continuous, active voice, vocabulary..."
                  placeholderTextColor={theme.subtext}
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    if (!text.trim()) setSearchResults([]);
                  }}
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: theme.accent, opacity: searching ? 0.6 : 1 }]}
                  onPress={handleSearch}
                  disabled={searching}
                >
                  <Text style={styles.buttonText}>{searching ? "Searching..." : "Search Lessons"}</Text>
                </TouchableOpacity>

                {searchResults.length > 0 && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={{ color: theme.subtext, fontWeight: "700", fontSize: 12, marginBottom: 8 }}>
                      MATCHING LESSON SECTIONS ({searchResults.length})
                    </Text>
                    {searchResults.map((result, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.searchResultCard, { backgroundColor: theme.bg, borderColor: theme.border }]}
                        onPress={() => openChapterById(result.chapter_id)}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13, flex: 1 }}>
                            {result.chapter_title}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                            <Text style={{ color: theme.accent, fontSize: 11, fontWeight: "600" }}>
                              Open
                            </Text>
                            <Ionicons name="arrow-forward" size={11} color={theme.accent} />
                          </View>
                        </View>
                        <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                          {result.text}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <Text style={[styles.sectionTitle, { color: theme.text }]}>Lessons & Chapters</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => setSelectedChapter(item)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16, flex: 1 }}>
                  {item.title}
                </Text>
                <View style={styles.chapterBadgeRow}>
                  {item.status === "ready" ? (
                    <View style={styles.statusBadgeGreen}>
                      <Ionicons name="checkmark-circle" size={13} color="#15803d" />
                      <Text style={styles.statusBadgeGreenText}>Ready</Text>
                    </View>
                  ) : item.status === "failed" ? (
                    <View style={styles.statusBadgeRed}>
                      <Ionicons name="alert-circle" size={13} color="#b91c1c" />
                      <Text style={styles.statusBadgeRedText}>Failed</Text>
                    </View>
                  ) : (
                    <View style={styles.statusBadgeGray}>
                      <Ionicons name="time-outline" size={13} color={theme.subtext} />
                      <Text style={styles.statusBadgeGrayText}>Processing</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="book-outline" size={14} color={theme.subtext} />
                  <Text style={{ color: theme.subtext, fontSize: 12 }}>
                    {item.chunk_count ? `${item.chunk_count} sections` : "Lesson PDF"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Text style={{ color: theme.accent, fontSize: 13, fontWeight: "700" }}>
                    Read & Ask AI
                  </Text>
                  <Ionicons name="arrow-forward" size={13} color={theme.accent} />
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.subtext, textAlign: "center", marginTop: 8 }}>
              No chapters uploaded yet by your teacher.
            </Text>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: TOP_HEADER_PADDING,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hello: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2 },
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
  testCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
  testHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  testCardTitle: { fontSize: 15, fontWeight: "700" },
  testHeaderLeft: { flexDirection: "row", alignItems: "center" },
  testButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  testButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  testCardSubtitle: { fontSize: 12, marginTop: 4 },
  headerLeftGroup: { flexDirection: "row", alignItems: "center" },
  headerIcon: { marginRight: 8 },
  actionCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  cardIcon: { marginRight: 6 },
  actionCardTitle: { fontSize: 14, fontWeight: "700" },
  cardMetaRow: { flexDirection: "row", gap: 12, marginTop: 8, flexWrap: "wrap", alignItems: "center" },
  cardMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText: { fontSize: 12, fontWeight: "500" },
  codeHighlight: { fontWeight: "700" },
  activeDot: { width: 7, height: 7, borderRadius: 4 },
  manageRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  manageText: { fontSize: 13, fontWeight: "700" },
  backBtnRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  classroomTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2 },
  classroomSubtitleRow: { flexDirection: "row", alignItems: "center", marginTop: 4, marginBottom: 14, gap: 4 },
  roleTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roleTagText: { fontSize: 12, fontWeight: "700" },
  searchResultCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  chapterBadgeRow: { flexDirection: "row", alignItems: "center" },
  statusBadgeGreen: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  statusBadgeGreenText: { color: "#15803d", fontSize: 11, fontWeight: "700" },
  statusBadgeRed: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  statusBadgeRedText: { color: "#b91c1c", fontSize: 11, fontWeight: "700" },
  statusBadgeGray: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  statusBadgeGrayText: { color: "#6b7280", fontSize: 11, fontWeight: "600" },
  reprocessBtnRow: { flexDirection: "row", alignItems: "center", gap: 4 },
});
