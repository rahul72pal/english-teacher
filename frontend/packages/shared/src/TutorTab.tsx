import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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

import Markdown from "react-native-markdown-display";
import { Ionicons } from "@expo/vector-icons";

import {
  api,
  askTutorStream,
  type ChapterView,
  type ClassroomStudentView,
  type ClassroomTeacherView,
  type Role,
  type Session,
  type TutorCitation,
  type TutorStreamEvent,
} from "./index";
import { themes, type Theme } from "./theme";

type Props = { role: Role; session: Session };

function getMarkdownStyles(theme: Theme) {
  return {
    body: {
      color: theme.text,
      fontSize: 15,
      lineHeight: 22,
    },
    heading1: {
      color: theme.text,
      fontSize: 19,
      fontWeight: "700" as const,
      marginTop: 10,
      marginBottom: 6,
    },
    heading2: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700" as const,
      marginTop: 8,
      marginBottom: 4,
    },
    heading3: {
      color: theme.accent,
      fontSize: 15,
      fontWeight: "700" as const,
      marginTop: 8,
      marginBottom: 4,
    },
    paragraph: {
      marginTop: 2,
      marginBottom: 6,
      lineHeight: 22,
      color: theme.text,
    },
    strong: {
      fontWeight: "700" as const,
      color: theme.text,
    },
    em: {
      fontStyle: "italic" as const,
    },
    bullet_list: {
      marginTop: 2,
      marginBottom: 6,
    },
    ordered_list: {
      marginTop: 2,
      marginBottom: 6,
    },
    list_item: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      marginBottom: 4,
    },
    bullet_list_icon: {
      marginLeft: 0,
      marginRight: 6,
      fontSize: 15,
      color: theme.accent,
    },
    bullet_list_content: {
      flex: 1,
    },
    code_inline: {
      backgroundColor: theme.accentSoft,
      color: theme.accent,
      borderRadius: 4,
      paddingHorizontal: 4,
      fontSize: 13,
    },
    blockquote: {
      backgroundColor: theme.accentSoft,
      borderLeftColor: theme.accent,
      borderLeftWidth: 3,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginVertical: 4,
    },
  };
}

const TOP_HEADER_PADDING =
  Platform.OS === "ios"
    ? 56
    : StatusBar.currentHeight
    ? StatusBar.currentHeight + 12
    : 44;

export default function TutorTab({ role, session }: Props) {
  const theme = themes[role];
  const mdStyles = useMemo(() => getMarkdownStyles(theme), [theme]);
  const [classrooms, setClassrooms] = useState<
    (ClassroomTeacherView | ClassroomStudentView)[]
  >([]);
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterView[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [streamed, setStreamed] = useState<string>("");
  const [citations, setCitations] = useState<TutorCitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (role === "teacher"
      ? api.teacherClassrooms(session.token)
      : api.studentClassrooms(session.token)
    )
      .then((data) => setClassrooms(data.classrooms))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [role, session.token]);

  const pickClassroom = useCallback(
    async (id: string) => {
      setClassroomId(id);
      setChapterId(null);
      setChapters([]);
      try {
        const data =
          role === "teacher"
            ? await api.teacherChapters(session.token, id)
            : await api.studentChapters(session.token, id);
        setChapters(data.chapters.filter((c) => c.status === "ready"));
      } catch {
        setChapters([]); // no ready chapters yet
      }
    },
    [role, session.token],
  );

  const ask = async () => {
    Keyboard.dismiss();
    if (!classroomId) {
      Alert.alert("Pick a classroom", "Choose a classroom first.");
      return;
    }
    if (!question.trim()) return;
    setAsking(true);
    setError(null);
    setStreamed("");
    setCitations([]);
    const q = question.trim();
    setQuestion("");
    askTutorStream(
      session.token,
      classroomId,
      q,
      chapterId ?? undefined,
      (event) => {
        if (event.type === "citations") setCitations(event.citations);
        else if (event.type === "token") setStreamed((prev) => prev + event.text);
        else if (event.type === "error") setError(event.text);
        else if (event.type === "done") setAsking(false);
      },
      (message) => {
        setError(message);
        setAsking(false);
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.text} style={styles.headerIcon} />
          <Text style={[styles.hello, { color: theme.text }]}>AI English Tutor</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {loading ? (
          <ActivityIndicator color={theme.accent} />
        ) : classrooms.length === 0 ? (
          <Text style={{ color: theme.subtext, textAlign: "center", marginTop: 30 }}>
            {role === "teacher"
              ? "Create a classroom and upload chapters first — then ask questions about them."
              : "Join a classroom with a code first — then ask your AI tutor about the lessons."}
          </Text>
        ) : (
          <>
            <Text style={[styles.label, { color: theme.subtext }]}>Classroom</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {classrooms.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => pickClassroom(c.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: classroomId === c.id ? theme.accent : theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text style={{ color: classroomId === c.id ? "#fff" : theme.text, fontSize: 13 }}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {classroomId && chapters.length > 0 ? (
              <>
                <Text style={[styles.label, { color: theme.subtext }]}>
                  Chapter (optional — ask about one chapter)
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => setChapterId(null)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: chapterId === null ? theme.accent : theme.surface,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Text style={{ color: chapterId === null ? "#fff" : theme.text, fontSize: 13 }}>
                      All chapters
                    </Text>
                  </TouchableOpacity>
                  {chapters.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setChapterId(c.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: chapterId === c.id ? theme.accent : theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <View style={styles.chipContent}>
                        <Ionicons
                          name="book-outline"
                          size={12}
                          color={chapterId === c.id ? "#fff" : theme.text}
                          style={styles.chipIcon}
                        />
                        <Text style={{ color: chapterId === c.id ? "#fff" : theme.text, fontSize: 13 }}>
                          {c.title}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              placeholder="Ask about your lesson… e.g. What is the present simple tense?"
              placeholderTextColor={theme.subtext}
              multiline
              value={question}
              onChangeText={setQuestion}
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.accent, opacity: asking ? 0.6 : 1 }]}
              onPress={ask}
              disabled={asking}
            >
              <Text style={styles.buttonText}>{asking ? "Thinking…" : "Ask the tutor"}</Text>
            </TouchableOpacity>

            {error ? <Text style={{ color: theme.danger, marginTop: 12 }}>{error}</Text> : null}

            {streamed || asking ? (
              <View style={[styles.answerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {streamed ? (
                  <Markdown style={mdStyles}>
                    {streamed}
                  </Markdown>
                ) : (
                  <Text style={{ color: theme.subtext }}>Searching your chapters…</Text>
                )}
                {asking ? <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} /> : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: TOP_HEADER_PADDING,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center" },
  headerIcon: { marginRight: 8 },
  hello: { fontSize: 20, fontWeight: "800", letterSpacing: -0.2 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipContent: { flexDirection: "row", alignItems: "center" },
  chipIcon: { marginRight: 5 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  answerCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 16 },
});
