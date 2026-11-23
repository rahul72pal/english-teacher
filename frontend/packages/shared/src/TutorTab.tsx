import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  api,
  type ChapterView,
  type ClassroomStudentView,
  type ClassroomTeacherView,
  type Role,
  type Session,
  type TutorAnswer,
} from "./index";
import { themes } from "./theme";

type Props = { role: Role; session: Session };

export default function TutorTab({ role, session }: Props) {
  const theme = themes[role];
  const [classrooms, setClassrooms] = useState<
    (ClassroomTeacherView | ClassroomStudentView)[]
  >([]);
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterView[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<TutorAnswer | null>(null);
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
    try {
      const data = await api.askTutor(
        session.token,
        classroomId,
        question.trim(),
        chapterId ?? undefined,
      );
      setResult(data);
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <Text style={[styles.hello, { color: theme.text }]}>🤖 AI English Tutor</Text>
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
                      <Text style={{ color: chapterId === c.id ? "#fff" : theme.text, fontSize: 13 }}>
                        📖 {c.title}
                      </Text>
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

            {result ? (
              <View style={[styles.answerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={{ color: theme.text, fontSize: 15, lineHeight: 22 }}>{result.answer}</Text>
                {result.citations.length > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ color: theme.subtext, fontWeight: "600", marginBottom: 6 }}>
                      📚 From your chapters
                    </Text>
                    {result.citations.map((c, i) => (
                      <Text key={i} style={{ color: theme.subtext, fontSize: 12, marginBottom: 6 }}>
                        • {c.chapter_title} (score {c.score}) — {c.text.slice(0, 120)}…
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14 },
  hello: { fontSize: 20, fontWeight: "800" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
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
