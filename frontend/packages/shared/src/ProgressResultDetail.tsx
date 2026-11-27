import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { studentTestsApi, type Session } from "./index";
import { themes } from "./theme";

const TYPE_LABELS: Record<string, string> = {
  mcq: "MCQ",
  true_false: "True / False",
  descriptive: "Descriptive",
};

type Props = { session: Session; resultId: string; onBack: () => void };

export default function ProgressResultDetail({ session, resultId, onBack }: Props) {
  const theme = themes.student;
  const [result, setResult] = useState<Awaited<ReturnType<typeof studentTestsApi.resultDetail>>["result"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studentTestsApi
      .resultDetail(session.token, resultId)
      .then(({ result }) => setResult(result))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [session.token, resultId]);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <TouchableOpacity onPress={onBack}>
          <Text style={{ color: theme.accent, fontWeight: "700", marginBottom: 10 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: theme.danger }}>{error}</Text>
      </View>
    );
  }
  if (!result) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const pending = result.evaluation_status === "pending" || result.evaluation_status === "evaluating";

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}>
        <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 16, marginBottom: 12 }}>← Back</Text>
      </TouchableOpacity>

      <Text style={{ color: theme.text, fontSize: 22, fontWeight: "800", marginBottom: 4 }}>{result.test_title}</Text>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, alignItems: "center" }]}>
        <Text style={{ color: theme.text, fontSize: 40, fontWeight: "800" }}>
          {result.obtained_marks}
          <Text style={{ color: theme.subtext, fontSize: 20 }}> / {result.total_marks}</Text>
        </Text>
        <Text style={{ color: result.passed ? "#2e7d32" : theme.danger, fontSize: 18, fontWeight: "700", marginTop: 4 }}>
          {result.percentage}% · {result.passed ? "✅ Passed" : "❌ Not passed"}
        </Text>
        {pending ? (
          <Text style={{ color: theme.subtext, marginTop: 10, textAlign: "center" }}>
            ⏳ Evaluation pending — descriptive answers are still being graded.
          </Text>
        ) : null}
      </View>

      <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 8 }}>Answer review</Text>
      {result.answers.map((a, i) => (
        <View key={`${a.question_id}-${i}`} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, padding: 14 }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: theme.subtext, fontWeight: "700", fontSize: 12 }}>
              Q{i + 1} · {TYPE_LABELS[String(a.type)] ?? a.type}
            </Text>
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              {a.marks_awarded != null ? `${a.marks_awarded > 0 ? "+" : ""}${a.marks_awarded} · ` : ""}
              {a.is_correct ? "✓" : "✗"}
            </Text>
          </View>
          <Text style={{ color: theme.text, fontSize: 14, marginBottom: 6 }}>{a.question}</Text>
          {a.student_answer != null && a.student_answer !== "" ? (
            <Text style={{ color: theme.subtext, fontSize: 13 }}>Your answer: {String(a.student_answer)}</Text>
          ) : (
            <Text style={{ color: theme.subtext, fontSize: 13, fontStyle: "italic" }}>No answer given</Text>
          )}
          {a.feedback ? <Text style={{ color: theme.accent, fontSize: 13, marginTop: 4 }}>💬 {a.feedback}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
});
