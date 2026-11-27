import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { studentTestsApi, type GradedAnswer, type Session } from "../index";
import { themes } from "../theme";

type Props = {
  session: Session;
  attemptId: string;
  onBack: () => void;
};

const TOP_HEADER_PADDING =
  Platform.OS === "ios"
    ? 56
    : StatusBar.currentHeight
    ? StatusBar.currentHeight + 12
    : 44;

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function TestResultScreen({ session, attemptId, onBack }: Props) {
  const theme = themes.student;
  const [state, setState] = useState<Awaited<ReturnType<typeof studentTestsApi.getResult>>["result"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const load = () =>
      studentTestsApi
        .getResult(session.token, attemptId)
        .then(({ result }) => {
          if (!cancelled) {
            setState(result);
            if (result.evaluation_status !== "pending" && pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
          }
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));

    load();

    // while descriptive grading is pending, poll periodically until completed
    pollTimer = setInterval(() => {
      if (!cancelled) load();
    }, 4000);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [session.token, attemptId]);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtnRow}>
          <Ionicons name="chevron-back" size={18} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: "700" }}>Back to tests</Text>
        </TouchableOpacity>
        <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
      </View>
    );
  }
  if (!state) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={{ color: theme.subtext, marginTop: 10 }}>Loading result…</Text>
      </View>
    );
  }

  const pending = state.evaluation_status === "pending" || state.evaluation_status === "evaluating";

  const renderAnswerCard = (a: GradedAnswer, i: number) => {
    const hasStudentAnswer =
      a.student_answer !== null && a.student_answer !== undefined && a.student_answer !== "";
    const studentAnsStr = String(a.student_answer ?? "").trim();
    const correctAnsStr = String(a.correct_answer ?? "").trim();
    const isDescriptive = a.type === "descriptive";
    const hasOptions = Array.isArray(a.options) && a.options.length > 0;

    return (
      <View
        key={a.question_id || i}
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        {/* Card Header: Question Number, Type Badge, and Score Pill */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.questionNumRow}>
            <Text style={[styles.questionNumText, { color: theme.text }]}>Question {i + 1}</Text>
            {a.type && (
              <View style={[styles.typeBadge, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.typeBadgeText, { color: theme.accent }]}>
                  {a.type === "mcq"
                    ? "MCQ"
                    : a.type === "true_false"
                    ? "T / F"
                    : "DESCRIPTIVE"}
                </Text>
              </View>
            )}
          </View>
          <View
            style={[
              styles.gradePill,
              { backgroundColor: a.is_correct ? "#dcfce7" : "#fee2e2" },
            ]}
          >
            <Ionicons
              name={a.is_correct ? "checkmark-circle" : "close-circle"}
              size={14}
              color={a.is_correct ? "#15803d" : "#b91c1c"}
              style={{ marginRight: 4 }}
            />
            <Text
              style={{
                color: a.is_correct ? "#15803d" : "#b91c1c",
                fontWeight: "700",
                fontSize: 12,
              }}
            >
              {a.marks_awarded}/{a.max_marks ?? 1} mark{a.marks_awarded === 1 ? "" : "s"} ·{" "}
              {a.is_correct ? "Correct" : "Incorrect"}
            </Text>
          </View>
        </View>

        {/* Question Text */}
        {Boolean(a.question) && (
          <Text style={[styles.questionTitle, { color: theme.text }]}>{a.question}</Text>
        )}

        {/* MCQ Options with Visual Choice Breakdown */}
        {hasOptions ? (
          <View style={styles.optionsContainer}>
            {a.options!.map((opt, optIndex) => {
              const optTrimmed = String(opt).trim();
              const isSelected = hasStudentAnswer && studentAnsStr === optTrimmed;
              const isCorrectOpt = Boolean(correctAnsStr) && correctAnsStr === optTrimmed;

              let optionBg = theme.bg;
              let optionBorder = theme.border;
              let tagText: string | null = null;
              let tagColor = theme.subtext;
              let tagBg = "transparent";

              if (isCorrectOpt && isSelected) {
                optionBg = "#ecfdf5";
                optionBorder = "#10b981";
                tagText = "✓ Your choice (Correct)";
                tagColor = "#047857";
                tagBg = "#d1fae5";
              } else if (isCorrectOpt) {
                optionBg = "#ecfdf5";
                optionBorder = "#10b981";
                tagText = "✓ Correct option";
                tagColor = "#047857";
                tagBg = "#d1fae5";
              } else if (isSelected) {
                optionBg = "#fef2f2";
                optionBorder = "#ef4444";
                tagText = "✕ Your choice";
                tagColor = "#b91c1c";
                tagBg = "#fee2e2";
              }

              return (
                <View
                  key={optIndex}
                  style={[
                    styles.optionItem,
                    {
                      backgroundColor: optionBg,
                      borderColor: optionBorder,
                    },
                  ]}
                >
                  <View style={styles.optionContentRow}>
                    <Text
                      style={[
                        styles.optionLetter,
                        {
                          color: isCorrectOpt
                            ? "#047857"
                            : isSelected
                            ? "#b91c1c"
                            : theme.subtext,
                        },
                      ]}
                    >
                      {LETTERS[optIndex] || String(optIndex + 1)}.
                    </Text>
                    <Text
                      style={[
                        styles.optionLabel,
                        {
                          color: isCorrectOpt
                            ? "#065f46"
                            : isSelected
                            ? "#991b1b"
                            : theme.text,
                          fontWeight: isCorrectOpt || isSelected ? "600" : "400",
                        },
                      ]}
                    >
                      {opt}
                    </Text>
                  </View>
                  {tagText && (
                    <View style={[styles.choiceTag, { backgroundColor: tagBg }]}>
                      <Text style={[styles.choiceTagText, { color: tagColor }]}>
                        {tagText}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Answers summary (for non-MCQ or quick review) */}
        {!hasOptions && (
          <View style={styles.answersBlock}>
            {/* Student's Given Answer */}
            <View
              style={[
                styles.answerRowBox,
                {
                  backgroundColor: !hasStudentAnswer
                    ? theme.bg
                    : a.is_correct
                    ? "#ecfdf5"
                    : "#fef2f2",
                  borderColor: !hasStudentAnswer
                    ? theme.border
                    : a.is_correct
                    ? "#a7f3d0"
                    : "#fecaca",
                },
              ]}
            >
              <View style={styles.answerLabelRow}>
                <Ionicons
                  name={
                    !hasStudentAnswer
                      ? "help-circle-outline"
                      : a.is_correct
                      ? "checkmark-circle"
                      : "close-circle"
                  }
                  size={15}
                  color={
                    !hasStudentAnswer
                      ? theme.subtext
                      : a.is_correct
                      ? "#15803d"
                      : "#b91c1c"
                  }
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.answerBoxLabel, { color: theme.subtext }]}>
                  Your Answer:
                </Text>
              </View>
              <Text
                style={[
                  styles.answerBoxValue,
                  {
                    color: !hasStudentAnswer
                      ? theme.subtext
                      : a.is_correct
                      ? "#065f46"
                      : "#991b1b",
                    fontStyle: hasStudentAnswer ? "normal" : "italic",
                  },
                ]}
              >
                {hasStudentAnswer ? String(a.student_answer) : "No answer given"}
              </Text>
            </View>

            {/* Correct / Expected Answer */}
            {Boolean(a.correct_answer) && (
              <View
                style={[
                  styles.answerRowBox,
                  {
                    backgroundColor: "#ecfdf5",
                    borderColor: "#a7f3d0",
                    marginTop: 8,
                  },
                ]}
              >
                <View style={styles.answerLabelRow}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={15}
                    color="#15803d"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.answerBoxLabel, { color: "#065f46" }]}>
                    {isDescriptive ? "Expected / Model Answer:" : "Correct Answer:"}
                  </Text>
                </View>
                <Text style={[styles.answerBoxValue, { color: "#065f46", fontWeight: "600" }]}>
                  {String(a.correct_answer)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Correct answer callout if MCQ had no match in options */}
        {hasOptions && !a.is_correct && Boolean(a.correct_answer) && (
          <View style={styles.correctCallout}>
            <Ionicons name="information-circle" size={15} color="#15803d" style={{ marginRight: 6 }} />
            <Text style={styles.correctCalloutText}>
              Correct Option:{" "}
              <Text style={{ fontWeight: "700" }}>{String(a.correct_answer)}</Text>
            </Text>
          </View>
        )}

        {/* Feedback / Explanation Box */}
        {Boolean(a.feedback || a.explanation) && (
          <View style={[styles.feedbackBox, { backgroundColor: theme.accentSoft }]}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={15}
              color={theme.accent}
              style={{ marginRight: 8, marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.feedbackTitle, { color: theme.accent }]}>
                {isDescriptive ? "AI Evaluation Feedback" : "Explanation"}
              </Text>
              <Text style={[styles.feedbackText, { color: theme.text }]}>
                {a.feedback || a.explanation}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: TOP_HEADER_PADDING, paddingBottom: 40 }}
    >
      <TouchableOpacity onPress={onBack} style={styles.backBtnRow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={20} color={theme.accent} />
        <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 16 }}>Back to tests</Text>
      </TouchableOpacity>

      <Text style={[styles.testTitle, { color: theme.text }]}>{state.test_title}</Text>

      {/* Main Score Banner */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, alignItems: "center" }]}>
        <Text style={{ color: theme.text, fontSize: 40, fontWeight: "800" }}>
          {state.obtained_marks}
          <Text style={{ color: theme.subtext, fontSize: 20 }}> / {state.total_marks}</Text>
        </Text>
        <View style={styles.scoreRow}>
          <Ionicons
            name={state.passed ? "checkmark-circle" : "close-circle"}
            size={18}
            color={state.passed ? "#15803d" : theme.danger}
          />
          <Text style={{ color: state.passed ? "#15803d" : theme.danger, fontSize: 18, fontWeight: "700" }}>
            {state.percentage}% · {state.passed ? "PASSED" : "NOT PASSED"}
          </Text>
        </View>
        {pending ? (
          <View style={[styles.pendingNotice, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="time-outline" size={14} color={theme.accent} />
            <Text style={{ color: theme.text, fontSize: 12, flex: 1 }}>
              Evaluation pending — descriptive answers are being graded by AI. Score will update shortly.
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>Question Breakdown</Text>
      {state.answers.length === 0 ? (
        <Text style={{ color: theme.subtext }}>Detailed breakdown is not available.</Text>
      ) : (
        state.answers.map(renderAnswerCard)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  backBtnRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 14 },
  testTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.2, marginBottom: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  questionNumRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  questionNumText: { fontWeight: "700", fontSize: 15 },
  typeBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  pendingNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10, marginTop: 6 },
  gradePill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  questionTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 12,
    marginTop: 2,
  },
  optionsContainer: {
    gap: 8,
    marginBottom: 10,
  },
  optionItem: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionContentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    marginRight: 8,
  },
  optionLetter: {
    fontWeight: "700",
    fontSize: 13,
    marginRight: 6,
    width: 20,
  },
  optionLabel: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  choiceTag: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  choiceTagText: {
    fontSize: 11,
    fontWeight: "700",
  },
  answersBlock: {
    marginTop: 4,
    marginBottom: 6,
  },
  answerRowBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  answerLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  answerBoxLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  answerBoxValue: {
    fontSize: 14,
    lineHeight: 20,
    paddingLeft: 21,
  },
  correctCallout: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  correctCalloutText: {
    color: "#065f46",
    fontSize: 12,
  },
  feedbackBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  feedbackTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  feedbackText: {
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: { marginTop: 10, fontSize: 14 },
});
