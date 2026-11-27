import { useCallback, useEffect, useRef, useState } from "react";
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

import { studentTestsApi, type Session, type StudentSafeQuestion } from "../index";
import { themes } from "../theme";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import {
  clearAttempt,
  saveAnswer,
  setCurrentQuestion,
  startAttempt,
  submitAttempt as submitAttemptAction,
  toggleReview,
} from "../app/store";
import { useAttempt, useSubmitAttempt } from "../hooks/queries";

type Props = {
  session: Session;
  attemptId: string;
  onSubmitted: (attemptId: string, testTitle: string) => void;
  onBack?: () => void;
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TestAttemptScreen({ session, attemptId, onSubmitted }: Props) {
  const theme = themes.student;
  const dispatch = useAppDispatch();
  const attemptState = useAppSelector((s) => s.testAttempt);

  // server state: the active attempt (answers restore + snapshot questions)
  const { data, error: loadError, isLoading } = useAttempt(session.token, attemptId);

  // local component state: countdown + modals only (Redux holds the rest)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const submittingMutation = useSubmitAttempt(session.token);
  const submittedRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hydrate the slice once the attempt is fetched (resume: answers restored, timer from expires_at)
  useEffect(() => {
    if (!data) return;
    const restored: Record<string, { answer: string | boolean | null; saved: "saved" | "saving" | "dirty" | "none" }> = {};
    for (const a of data.answers) {
      restored[a.question_id] = { answer: a.student_answer, saved: "saved" };
    }
    dispatch(
      startAttempt({
        attemptId: data.attempt.id,
        expiresAt: data.attempt.expires_at,
        testTitle: "",
        answers: restored,
      }),
    );
    const expires = data.attempt.expires_at ? new Date(data.attempt.expires_at).getTime() : null;
    setSecondsLeft(expires ? Math.max(0, Math.floor((expires - Date.now()) / 1000)) : null);
  }, [data?.attempt.id, dispatch]);

  const questions: StudentSafeQuestion[] = data?.questions ?? [];
  const current = questions[attemptState.currentQuestionIndex];
  const currentAnswer = current ? attemptState.answers[current.question_id] : undefined;

  const doSubmit = useCallback(
    async (auto = false) => {
      if (submittedRef.current || attemptState.isSubmitted) return;
      submittedRef.current = true;
      dispatch(submitAttemptAction());
      try {
        const result = await submittingMutation.mutateAsync(attemptId);
        if (auto) Alert.alert("Time is up", "Your test was submitted automatically.");
        dispatch(clearAttempt());
        onSubmitted(result.attempt_id, result.test_title);
      } catch (e) {
        submittedRef.current = false;
        Alert.alert("Submit failed", e instanceof Error ? e.message : String(e));
      }
    },
    [attemptId, attemptState.isSubmitted, dispatch, onSubmitted, submittingMutation],
  );

  // countdown — local component state per the state-management table
  useEffect(() => {
    if (secondsLeft === null || submittedRef.current) return;
    if (secondsLeft <= 0) {
      doSubmit(true);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, doSubmit]);

  // ---- autosave: optimistic Redux update, then PUT to the backend (source of truth) ----
  const persist = (qid: string, value: string | boolean | null) => {
    studentTestsApi
      .saveAnswer(session.token, attemptId, qid, value)
      .then(() => dispatch(saveAnswer({ questionId: qid, answer: value, saved: "saved" })))
      .catch(() => dispatch(saveAnswer({ questionId: qid, answer: value, saved: "dirty" })));
  };

  const setAnswer = (qid: string, value: string | boolean | null, debounce = false) => {
    dispatch(saveAnswer({ questionId: qid, answer: value, saved: "saving" }));
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (debounce) {
      autosaveTimer.current = setTimeout(() => persist(qid, value), 800);
    } else {
      persist(qid, value);
    }
  };

  // ---- loading / error states ----
  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.danger }}>{String(loadError)}</Text>
      </View>
    );
  }
  if (isLoading || !data || !current) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const answeredCount = questions.filter(
    (q) => attemptState.answers[q.question_id]?.answer !== undefined && attemptState.answers[q.question_id]?.answer !== null && attemptState.answers[q.question_id]?.answer !== "",
  ).length;
  const unansweredCount = questions.length - answeredCount;
  const lowTime = secondsLeft !== null && secondsLeft < 120;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* top bar: timer + progress + palette */}
      <View style={[styles.topBar, { backgroundColor: theme.accentSoft }]}>
        <Text style={{ color: theme.text, fontWeight: "700", fontSize: 14 }} numberOfLines={1}>
          Exam in progress
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: lowTime ? theme.danger : theme.accent, fontWeight: "800", fontSize: 16 }}>
            ⏱ {secondsLeft === null ? "--:--" : formatClock(secondsLeft)}
          </Text>
          <TouchableOpacity style={[styles.paletteBtn, { borderColor: theme.accent }]} onPress={() => setShowPalette(true)}>
            <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 12 }}>
              ☰ {attemptState.currentQuestionIndex + 1}/{questions.length}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ height: 4, backgroundColor: theme.border }}>
        <View
          style={{
            height: 4,
            backgroundColor: theme.accent,
            width: `${((attemptState.currentQuestionIndex + 1) / questions.length) * 100}%`,
          }}
        />
      </View>

      {/* question */}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }}>
            Question {attemptState.currentQuestionIndex + 1} of {questions.length}
          </Text>
          <Text style={{ color: theme.subtext, fontSize: 13 }}>{current.marks} mark(s)</Text>
        </View>

        <Text style={{ color: theme.text, fontSize: 16, lineHeight: 24, marginBottom: 18 }}>{current.question}</Text>

        {/* MCQ */}
        {current.type === "mcq" && current.options ? (
          current.options.map((option, i) => {
            const selected = currentAnswer?.answer === option;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setAnswer(current.question_id, option)}
                style={[
                  styles.option,
                  {
                    borderColor: selected ? theme.accent : theme.border,
                    backgroundColor: selected ? theme.accentSoft : theme.surface,
                  },
                ]}
              >
                <View style={[styles.radio, { borderColor: selected ? theme.accent : theme.border }]}>
                  {selected ? <View style={[styles.radioFill, { backgroundColor: theme.accent }]} /> : null}
                </View>
                <Text style={{ color: theme.text, flex: 1 }}>
                  {LETTERS[i]}. {option}
                </Text>
              </TouchableOpacity>
            );
          })
        ) : null}

        {/* True/False */}
        {current.type === "true_false" ? (
          <View style={{ flexDirection: "row", gap: 12 }}>
            {[true, false].map((value) => {
              const selected = currentAnswer?.answer === value;
              return (
                <TouchableOpacity
                  key={String(value)}
                  onPress={() => setAnswer(current.question_id, value)}
                  style={[
                    styles.tfCard,
                    {
                      borderColor: selected ? theme.accent : theme.border,
                      backgroundColor: selected ? theme.accentSoft : theme.surface,
                    },
                  ]}
                >
                  <Text style={{ color: selected ? theme.accent : theme.text, fontWeight: "800", fontSize: 18 }}>
                    {value ? "TRUE" : "FALSE"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {/* Descriptive */}
        {current.type === "descriptive" ? (
          <View>
            <TextInput
              style={[styles.descriptive, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              placeholder="Write your answer here…"
              placeholderTextColor={theme.subtext}
              multiline
              value={typeof currentAnswer?.answer === "string" ? currentAnswer.answer : ""}
              onChangeText={(text) => setAnswer(current.question_id, text, true)}
            />
            <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 4 }}>
              {typeof currentAnswer?.answer === "string" ? currentAnswer.answer.trim().split(/\s+/).filter(Boolean).length : 0} words ·{" "}
              {currentAnswer?.saved === "saving"
                ? "Saving…"
                : currentAnswer?.saved === "saved"
                ? "✓ Saved"
                : currentAnswer?.saved === "dirty"
                ? "⚠ Not synced — will retry"
                : "Autosaves as you type"}
            </Text>
          </View>
        ) : null}

        {current.type !== "descriptive" ? (
          <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 10 }}>
            {currentAnswer?.saved === "saving"
              ? "Saving…"
              : currentAnswer?.answer !== undefined && currentAnswer?.answer !== null
              ? "✓ Answer saved"
              : "Not answered yet — you can skip and return"}
          </Text>
        ) : null}
      </ScrollView>

      {/* bottom navigation */}
      <View style={[styles.navBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.navBtn, { opacity: attemptState.currentQuestionIndex === 0 ? 0.4 : 1 }]}
          disabled={attemptState.currentQuestionIndex === 0}
          onPress={() => dispatch(setCurrentQuestion(Math.max(0, attemptState.currentQuestionIndex - 1)))}
        >
          <Text style={{ color: theme.accent, fontWeight: "700" }}>← Previous</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => dispatch(toggleReview(current.question_id))}>
          <Text style={{ color: attemptState.markedForReview.includes(current.question_id) ? theme.danger : theme.subtext, fontSize: 12 }}>
            {attemptState.markedForReview.includes(current.question_id) ? "★ Marked" : "☆ Mark for review"}
          </Text>
        </TouchableOpacity>
        {attemptState.currentQuestionIndex < questions.length - 1 ? (
          <TouchableOpacity onPress={() => dispatch(setCurrentQuestion(Math.min(questions.length - 1, attemptState.currentQuestionIndex + 1)))}>
            <Text style={{ color: theme.accent, fontWeight: "700" }}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setShowReview(true)}>
            <Text style={{ color: "#2e7d32", fontWeight: "700" }}>Review ✓</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* question palette */}
      <Modal visible={showPalette} transparent animationType="fade" onRequestClose={() => setShowPalette(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.paletteCard, { backgroundColor: theme.surface }]}>
            <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16, marginBottom: 12 }}>
              Question Palette · {questions.length} questions
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {questions.map((q, i) => {
                const answered =
                  attemptState.answers[q.question_id]?.answer !== undefined &&
                  attemptState.answers[q.question_id]?.answer !== null &&
                  attemptState.answers[q.question_id]?.answer !== "";
                const isMarked = attemptState.markedForReview.includes(q.question_id);
                return (
                  <TouchableOpacity
                    key={q.question_id}
                    onPress={() => {
                      dispatch(setCurrentQuestion(i));
                      setShowPalette(false);
                    }}
                    style={[
                      styles.paletteCell,
                      {
                        backgroundColor: i === attemptState.currentQuestionIndex ? theme.accent : isMarked ? theme.danger : answered ? "#2e7d32" : theme.bg,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{i + 1}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
              <Text style={{ color: theme.subtext, fontSize: 12 }}>🟩 Answered</Text>
              <Text style={{ color: theme.subtext, fontSize: 12 }}>🟥 Marked for review</Text>
              <Text style={{ color: theme.subtext, fontSize: 12 }}>⬜ Not answered</Text>
            </View>
            <TouchableOpacity style={[styles.button, { backgroundColor: theme.accent, marginTop: 16 }]} onPress={() => setShowPalette(false)}>
              <Text style={styles.buttonText}>Back to question</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* review & submit */}
      <Modal visible={showReview} transparent animationType="fade" onRequestClose={() => setShowReview(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.paletteCard, { backgroundColor: theme.surface }]}>
            <Text style={{ color: theme.text, fontWeight: "800", fontSize: 18 }}>Test summary</Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
              <Text style={{ color: "#2e7d32", fontWeight: "700" }}>✓ {answeredCount} answered</Text>
              <Text style={{ color: theme.subtext, fontWeight: "700" }}>○ {unansweredCount} unanswered</Text>
              <Text style={{ color: theme.danger, fontWeight: "700" }}>★ {attemptState.markedForReview.length} marked</Text>
            </View>
            <Text style={{ color: theme.subtext, marginTop: 10 }}>You cannot modify your answers after submitting.</Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.accent, marginTop: 16, opacity: submittingMutation.isPending ? 0.6 : 1 }]}
              disabled={submittingMutation.isPending}
              onPress={() => {
                setShowReview(false);
                doSubmit(false);
              }}
            >
              <Text style={styles.buttonText}>{submittingMutation.isPending ? "Submitting…" : "Submit test"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowReview(false)} style={{ marginTop: 10 }}>
              <Text style={{ color: theme.subtext, textAlign: "center" }}>Keep working</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// (modal visibility + countdown use plain useState above)

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paletteBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  option: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioFill: { width: 10, height: 10, borderRadius: 5 },
  tfCard: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 22, alignItems: "center" },
  descriptive: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 140,
    padding: 14,
    fontSize: 15,
    textAlignVertical: "top",
  },
  navBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  navBtn: { padding: 6 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  paletteCard: { borderRadius: 16, padding: 20, width: "100%" },
  paletteCell: { width: 42, height: 42, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
