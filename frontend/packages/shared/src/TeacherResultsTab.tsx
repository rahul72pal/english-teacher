import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  teacherResultsApi,
  type PendingEvaluationItem,
  type Session,
  type TeacherResultDetail,
  type TeacherResultRow,
  type TestResultsStats,
} from "./index";
import { themes, type Theme } from "./theme";

const TYPE_LABELS: Record<string, string> = {
  mcq: "MCQ",
  true_false: "True / False",
  descriptive: "Descriptive",
};

type Props = { session: Session };

export default function TeacherResultsTab({ session }: Props) {
  const theme = themes.teacher;
  const [view, setView] = useState<
    { name: "pending" } | { name: "test"; testId: string; title: string } | { name: "result"; resultId: string }
  >({ name: "pending" });

  // pending evaluation queue
  const [pending, setPending] = useState<PendingEvaluationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const { pending } = await teacherResultsApi.pendingEvaluation(session.token);
      setPending(pending);
    } catch (e) {
      Alert.alert("Load failed", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    if (view.name === "pending") loadPending();
  }, [view.name, loadPending]);

  if (view.name === "result") {
    return <ResultDetailScreen session={session} resultId={view.resultId} onBack={() => setView({ name: "pending" })} />;
  }

  if (view.name === "test") {
    return <TestResultsScreen session={session} testId={view.testId} title={view.title} onBack={() => setView({ name: "pending" })} onOpenResult={(id) => setView({ name: "result", resultId: id })} />;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <Text style={{ color: theme.text, fontSize: 24, fontWeight: "800" }}>Results & Evaluation</Text>
      <Text style={{ color: theme.subtext, marginTop: 4, marginBottom: 16 }}>
        Review AI-graded descriptive answers, adjust marks, finalize results.
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 30 }} />
      ) : pending.length === 0 ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={{ color: theme.subtext }}>🎉 Nothing awaiting review. All descriptive answers evaluated.</Text>
        </View>
      ) : (
        pending.map((p, i) => (
          <TouchableOpacity
            key={`${p.result_id}-${p.question_id}-${i}`}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => setView({ name: "result", resultId: p.result_id })}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <Text style={{ color: theme.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                {p.student_name} · {p.test_title}
              </Text>
              <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}>
                AI {p.ai_marks}/{p.max_marks}
              </Text>
            </View>
            <Text style={{ color: theme.subtext, fontSize: 13 }} numberOfLines={2}>
              {p.question}
            </Text>
            {p.ai_feedback ? (
              <Text style={{ color: theme.accent, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                💬 {p.ai_feedback}
              </Text>
            ) : null}
            <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 6 }}>Tap to review & adjust →</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

// ---------- per-test results overview ----------

function TestResultsScreen({
  session, testId, title, onBack, onOpenResult,
}: { session: Session; testId: string; title: string; onBack: () => void; onOpenResult: (resultId: string) => void }) {
  const theme = themes.teacher;
  const [stats, setStats] = useState<TestResultsStats | null>(null);
  const [rows, setRows] = useState<TeacherResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    teacherResultsApi
      .testResults(session.token, testId)
      .then(({ stats, results }) => {
        setStats(stats);
        setRows(results);
      })
      .catch((e) => Alert.alert("Load failed", e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [session.token, testId]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}>
        <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 16, marginBottom: 12 }}>← Back</Text>
      </TouchableOpacity>
      <Text style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}>{title}</Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 30 }} />
      ) : stats ? (
        <>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.statRow}>
              {[
                ["Students", String(stats.total_students)],
                ["Attempted", String(stats.attempted)],
                ["Pending", String(stats.pending_evaluation)],
              ].map(([l, v]) => (
                <View key={l} style={[styles.stat, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }}>{v}</Text>
                  <Text style={{ color: theme.subtext, fontSize: 11 }}>{l}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.statRow, { marginTop: 10 }]}>
              {[
                ["Average", `${stats.average_percentage}%`],
                ["Best", `${stats.highest_percentage}%`],
                ["Pass rate", `${stats.pass_rate}%`],
              ].map(([l, v]) => (
                <View key={l} style={[styles.stat, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                  <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 16 }}>{v}</Text>
                  <Text style={{ color: theme.subtext, fontSize: 11 }}>{l}</Text>
                </View>
              ))}
            </View>
          </View>

          {rows.length === 0 ? (
            <Text style={{ color: theme.subtext }}>No submitted attempts yet.</Text>
          ) : (
            rows.map((r) => (
              <TouchableOpacity
                key={r.result_id}
                style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => onOpenResult(r.result_id)}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                    {r.student_name}
                  </Text>
                  <Text style={{ color: r.passed ? "#2e7d32" : theme.danger, fontWeight: "800" }}>
                    {r.obtained_marks}/{r.total_marks} · {r.percentage}%
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                  <Text style={{ color: theme.subtext, fontSize: 12 }}>
                    {r.time_taken_seconds != null ? `⏱ ${Math.round(r.time_taken_seconds / 60)} min` : ""}
                  </Text>
                  <Text
                    style={{
                      color: r.review_status === "published" ? "#2e7d32" : r.review_status === "reviewed" ? theme.accent : theme.subtext,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {r.review_status === "published" ? "✅ Published" : r.review_status === "reviewed" ? "✎ Reviewed" : "⏳ Pending review"} · tap
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

// ---------- individual result with manual evaluation ----------

function ResultDetailScreen({ session, resultId, onBack }: { session: Session; resultId: string; onBack: () => void }) {
  const theme = themes.teacher;
  const [result, setResult] = useState<TeacherResultDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState<{ questionId: string; aiMarks: number | null; aiFeedback: string | null; maxMarks: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    teacherResultsApi
      .resultDetail(session.token, resultId)
      .then(({ result }) => setResult(result))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [session.token, resultId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={onBack}><Text style={{ color: theme.accent, fontWeight: "700" }}>← Back</Text></TouchableOpacity>
        <Text style={{ color: theme.danger, marginTop: 8 }}>{error}</Text>
      </View>
    );
  }
  if (!result) {
    return <View style={[styles.center, { backgroundColor: theme.bg }]}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  const saveEvaluation = async (marks: number, feedback: string) => {
    if (!evaluating) return;
    setBusy(true);
    try {
      await teacherResultsApi.evaluateAnswer(session.token, resultId, evaluating.questionId, marks, feedback || null);
      setEvaluating(null);
      load();
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const finalize = () => {
    Alert.alert("Finalize result", "Recompute totals from approved marks and publish to the student?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Finalize & publish",
        onPress: async () => {
          try {
            await teacherResultsApi.finalizeResult(session.token, resultId);
            Alert.alert("Published", "The student can now see their finalized result.");
            load();
          } catch (e) {
            Alert.alert("Finalize failed", e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  const unanswered = result.answers.filter((a) => a.needs_review).length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}>
        <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 16, marginBottom: 12 }}>← Back</Text>
      </TouchableOpacity>
      <Text style={{ color: theme.text, fontSize: 22, fontWeight: "800" }}>{result.student_name}</Text>
      <Text style={{ color: theme.subtext, marginBottom: 10 }}>{result.test_title}</Text>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, alignItems: "center" }]}>
        <Text style={{ color: theme.text, fontSize: 36, fontWeight: "800" }}>
          {result.obtained_marks}<Text style={{ color: theme.subtext, fontSize: 18 }}> / {result.total_marks}</Text>
        </Text>
        <Text style={{ color: result.passed ? "#2e7d32" : theme.danger, fontWeight: "700" }}>
          {result.percentage}% · {result.passed ? "Passed" : "Not passed"}
        </Text>
        {result.time_taken_seconds != null ? (
          <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 4 }}>⏱ {Math.round(result.time_taken_seconds / 60)} min</Text>
        ) : null}
        <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 4 }}>
          {result.review_status === "published" ? "✅ Published" : result.review_status === "reviewed" ? "✎ Reviewed" : "⏳ Awaiting review"}
          {unanswered > 0 ? ` · ${unanswered} descriptive answer(s) need review` : ""}
        </Text>
      </View>

      {result.review_status !== "published" ? (
        <TouchableOpacity style={[styles.button, { backgroundColor: theme.accent, marginBottom: 14 }]} onPress={finalize}>
          <Text style={styles.buttonText}>Finalize & publish result</Text>
        </TouchableOpacity>
      ) : null}

      {result.answers.map((a, i) => (
        <View key={a.question_id} style={[styles.card, { backgroundColor: theme.surface, borderColor: a.needs_review ? theme.danger : theme.border, padding: 14 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: theme.subtext, fontWeight: "700", fontSize: 12 }}>
              Q{i + 1} · {TYPE_LABELS[a.type] ?? a.type} · {a.marks} mark(s)
            </Text>
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              {a.effective_marks ?? "—"} / {a.marks}
            </Text>
          </View>
          <Text style={{ color: theme.text, fontSize: 14, marginBottom: 6 }}>{a.question}</Text>
          <Text style={{ color: theme.subtext, fontSize: 13 }}>Student: {String(a.student_answer ?? "—")}</Text>
          {a.type !== "descriptive" ? (
            <Text style={{ color: theme.subtext, fontSize: 13 }}>Correct: {String(a.correct_answer ?? "—")} {a.is_correct ? "✓" : "✗"}</Text>
          ) : (
            <>
              <Text style={{ color: theme.subtext, fontSize: 13 }}>🤖 AI marks: {a.ai_marks ?? "—"} {a.ai_feedback ? `· 💬 ${a.ai_feedback}` : ""}</Text>
              {a.teacher_marks != null ? (
                <Text style={{ color: theme.accent, fontSize: 13, marginTop: 2 }}>
                  ✎ You: {a.teacher_marks}{a.teacher_feedback ? ` · ${a.teacher_feedback}` : ""}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.accentSoft, marginTop: 10 }]}
                onPress={() => setEvaluating({ questionId: a.question_id, aiMarks: a.ai_marks, aiFeedback: a.ai_feedback, maxMarks: a.marks })}
              >
                <Text style={{ color: theme.accent, fontWeight: "700", textAlign: "center" }}>
                  {a.teacher_marks != null ? "Adjust marks" : "Evaluate this answer"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ))}

      {/* manual evaluation modal */}
      <Modal visible={!!evaluating} transparent animationType="fade" onRequestClose={() => setEvaluating(null)}>
        <View style={styles.modalBg}>
          <EvaluationModal
            theme={theme}
            evaluating={evaluating}
            busy={busy}
            onCancel={() => setEvaluating(null)}
            onSave={saveEvaluation}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

function EvaluationModal({
  theme, evaluating, busy, onCancel, onSave,
}: {
  theme: Theme;
  evaluating: { questionId: string; aiMarks: number | null; aiFeedback: string | null; maxMarks: number } | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (marks: number, feedback: string) => void;
}) {
  const [marks, setMarks] = useState(String(evaluating?.aiMarks ?? 0));
  const [feedback, setFeedback] = useState(evaluating?.aiFeedback ?? "");

  return (
    <View style={[styles.paletteCard, { backgroundColor: theme.surface }]}>
      <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16, marginBottom: 10 }}>Manual evaluation</Text>
      {evaluating ? (
        <Text style={{ color: theme.subtext, fontSize: 13, marginBottom: 10 }}>
          AI suggested {evaluating.aiMarks}/{evaluating.maxMarks}. Max {evaluating.maxMarks} marks. Your marks never overwrite the AI evaluation.
        </Text>
      ) : null}
      <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 4 }}>Marks</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
        keyboardType="number-pad"
        value={marks}
        onChangeText={(t) => setMarks(t.replace(/[^0-9]/g, ""))}
      />
      <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Teacher comment</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg, minHeight: 70, textAlignVertical: "top" }]}
        placeholder="Feedback for the student…"
        placeholderTextColor={theme.subtext}
        multiline
        value={feedback}
        onChangeText={setFeedback}
      />
      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.accent, marginTop: 14, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={() => onSave(parseInt(marks || "0", 10), feedback)}
      >
        <Text style={styles.buttonText}>{busy ? "Saving…" : "Save evaluation"}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} style={{ marginTop: 10 }}>
        <Text style={{ color: theme.subtext, textAlign: "center" }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  statRow: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: "center" },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  paletteCard: { borderRadius: 16, padding: 20, width: "100%" },
});
