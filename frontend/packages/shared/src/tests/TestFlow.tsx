import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { type AttemptResult, type Session, type StudentTest } from "../index";
import { useStudentResults, useStudentTests } from "../hooks/queries";
import { themes } from "../theme";
import TestAttemptScreen from "./TestAttemptScreen";
import TestResultScreen from "./TestResultScreen";
import TestInstructionsScreen from "./TestInstructionsScreen";

type Props = {
  session: Session;
  classroomId: string;
  classroomName: string;
  onBack: () => void;
};

type FlowView =
  | { name: "list" }
  | { name: "instructions"; test: StudentTest }
  | { name: "attempt"; attemptId: string }
  | { name: "result"; attemptId: string; testTitle: string };

const TOP_HEADER_PADDING =
  Platform.OS === "ios"
    ? 56
    : StatusBar.currentHeight
    ? StatusBar.currentHeight + 12
    : 44;

export default function TestFlow({ session, classroomId, classroomName, onBack }: Props) {
  const theme = themes.student;
  const [view, setView] = useState<FlowView>({ name: "list" });
  // server state via TanStack Query
  const testsQuery = useStudentTests(classroomId, session.token);
  const resultsQuery = useStudentResults(session.token);

  const tests: StudentTest[] = testsQuery.data?.tests ?? [];
  const results: AttemptResult[] = resultsQuery.data?.results ?? [];
  const loading = testsQuery.isLoading;
  const error = (testsQuery.error ?? resultsQuery.error) as Error | null;
  const load = () => {
    testsQuery.refetch();
    resultsQuery.refetch();
  };

  const resultFor = (testId: string) => results.find((r) => r.test_id === testId);

  // ---- result screen ----
  if (view.name === "result") {
    return <TestResultScreen session={session} attemptId={view.attemptId} onBack={() => { setView({ name: "list" }); load(); }} />;
  }

  // ---- attempt screen ----
  if (view.name === "attempt") {
    return (
      <TestAttemptScreen
        session={session}
        attemptId={view.attemptId}
        onSubmitted={(attemptId, testTitle) => setView({ name: "result", attemptId, testTitle })}
      />
    );
  }

  // ---- instructions screen ----
  if (view.name === "instructions") {
    return (
      <TestInstructionsScreen
        session={session}
        test={view.test}
        onBack={() => setView({ name: "list" })}
        onStarted={(attemptId) => setView({ name: "attempt", attemptId })}
      />
    );
  }

  // ---- test list ----
  const now = Date.now();
  const statusOf = (test: StudentTest): "available" | "upcoming" | "closed" => {
    if (test.start_at && new Date(test.start_at).getTime() > now) return "upcoming";
    if (test.end_at && new Date(test.end_at).getTime() < now) return "closed";
    return "available";
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtnRow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={20} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 16 }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }} numberOfLines={1}>
          {classroomName} · Tests
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {error ? <Text style={{ color: theme.danger, marginBottom: 8 }}>{String(error)}</Text> : null}
          {tests.length === 0 ? (
            <Text style={{ color: theme.subtext, textAlign: "center", marginTop: 30 }}>
              No tests published in this classroom yet.
            </Text>
          ) : (
            tests.map((test) => {
              const status = statusOf(test);
              const result = resultFor(test.id);
              return (
                <View key={test.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", flex: 1 }}>{test.title}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor:
                            status === "available" ? "#dcfce7" : status === "upcoming" ? "#f3f4f6" : "#fee2e2",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: status === "available" ? "#15803d" : status === "upcoming" ? theme.subtext : theme.danger,
                        }}
                      >
                        {status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                    <View style={styles.metaItem}>
                      <Ionicons name="help-circle-outline" size={13} color={theme.subtext} />
                      <Text style={{ color: theme.subtext, fontSize: 13 }}>{test.total_questions} Qs</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="medal-outline" size={13} color={theme.subtext} />
                      <Text style={{ color: theme.subtext, fontSize: 13 }}>{test.total_marks} marks</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={13} color={theme.subtext} />
                      <Text style={{ color: theme.subtext, fontSize: 13 }}>{test.duration_minutes} min</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="shield-checkmark-outline" size={13} color={theme.subtext} />
                      <Text style={{ color: theme.subtext, fontSize: 13 }}>{test.passing_percentage}% to pass</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="refresh-outline" size={13} color={theme.subtext} />
                      <Text style={{ color: theme.subtext, fontSize: 13 }}>{test.attempts_allowed} attempt(s)</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: theme.accent, marginTop: 14, opacity: status === "available" ? 1 : 0.5 }]}
                    disabled={status !== "available"}
                    onPress={() => setView({ name: "instructions", test })}
                  >
                    <Text style={styles.buttonText}>
                      {result ? "Retake Test" : status === "available" ? "Start Test" : status === "upcoming" ? "Not Started Yet" : "Closed"}
                    </Text>
                  </TouchableOpacity>
                  {result ? (
                    <TouchableOpacity
                      onPress={() => setView({ name: "result", attemptId: result.attempt_id, testTitle: test.title })}
                      style={styles.lastScoreRow}
                    >
                      <Ionicons
                        name={result.passed ? "checkmark-circle" : "close-circle"}
                        size={14}
                        color={result.passed ? "#15803d" : theme.danger}
                      />
                      <Text style={{ color: theme.subtext, fontSize: 12 }}>
                        Last score: {result.obtained_marks}/{result.total_marks} ({result.percentage}%) · {result.passed ? "Passed" : "Failed"} (View Result →)
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
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
    gap: 10,
  },
  backBtnRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  lastScoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 10 },
});
