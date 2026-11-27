import { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { type AttemptResult, type Session } from "./index";
import { themes } from "./theme";
import { useStudentPerformance, useStudentResults } from "./hooks/queries";
import ProgressResultDetail from "./ProgressResultDetail";

const TYPE_LABELS: Record<string, string> = {
  mcq: "Multiple choice",
  true_false: "True / False",
  descriptive: "Descriptive",
};

export default function ProgressTab({ session }: { session: Session }) {
  const theme = themes.student;
  const [openResultId, setOpenResultId] = useState<string | null>(null);

  // server state via TanStack Query (caching + background refetch on refocus)
  const resultsQuery = useStudentResults(session.token);
  const performanceQuery = useStudentPerformance(session.token);

  const results = resultsQuery.data?.results ?? [];
  const performance = performanceQuery.data?.performance ?? null;
  const loading = resultsQuery.isLoading || performanceQuery.isLoading;
  const error = (resultsQuery.error ?? performanceQuery.error) as Error | null;
  const refetch = () => {
    resultsQuery.refetch();
    performanceQuery.refetch();
  };

  if (openResultId) {
    return (
      <ProgressResultDetail
        session={session}
        resultId={openResultId}
        onBack={() => {
          setOpenResultId(null);
          refetch();
        }}
      />
    );
  }

  const bar = (label: string, value: number, color: string, sub?: string) => (
    <View key={label} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ color: theme.subtext, fontSize: 12 }}>{sub ?? `${value}%`}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.border }}>
        <View
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
            width: `${Math.max(2, Math.min(100, value))}%`,
          }}
        />
      </View>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={resultsQuery.isRefetching} onRefresh={refetch} tintColor={theme.accent} />}
    >
      <Text style={{ color: theme.text, fontSize: 24, fontWeight: "800" }}>
        Hi, {session.user.name.split(" ")[0]} 👋
      </Text>
      <Text style={{ color: theme.subtext, marginTop: 4, marginBottom: 16 }}>Your learning progress</Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={{ color: theme.danger }}>{String(error)}</Text>
      ) : (
        <>
          {/* overall performance */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15, marginBottom: 10 }}>
              Overall performance
            </Text>
            {performance && performance.total_tests > 0 ? (
              <>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                  {[
                    ["Average", `${performance.average_percentage}%`],
                    ["Best", `${performance.highest_percentage}%`],
                    ["Passed", `${performance.passed_tests}/${performance.total_tests}`],
                  ].map(([label, value]) => (
                    <View key={label} style={[styles.stat, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                      <Text style={{ color: theme.accent, fontWeight: "800", fontSize: 16 }}>{value}</Text>
                      <Text style={{ color: theme.subtext, fontSize: 11 }}>{label}</Text>
                    </View>
                  ))}
                </View>
                {performance.chapter_performance.map((c) =>
                  bar(
                    c.chapter,
                    c.average_percentage,
                    c.average_percentage >= 60 ? "#2e7d32" : theme.danger,
                    `${c.average_percentage}% · ${c.attempts} test${c.attempts > 1 ? "s" : ""}`,
                  ),
                )}
                {performance.type_performance.length > 0 ? (
                  <>
                    <Text style={{ color: theme.subtext, fontWeight: "700", fontSize: 12, marginTop: 8, marginBottom: 6 }}>
                      BY QUESTION TYPE
                    </Text>
                    {performance.type_performance.map((t) =>
                      bar(TYPE_LABELS[t.type] ?? t.type, t.accuracy, t.accuracy >= 60 ? theme.accent : theme.danger),
                    )}
                  </>
                ) : null}
                {performance.weak_chapters.length > 0 ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ color: theme.danger, fontWeight: "700", fontSize: 12 }}>NEEDS WORK</Text>
                    {performance.weak_chapters.map((c) => (
                      <Text key={c.chapter_id} style={{ color: theme.subtext, fontSize: 13 }}>
                        • {c.chapter} — {c.average_percentage}%
                      </Text>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={{ color: theme.subtext }}>
                Take your first test to start tracking performance.
              </Text>
            )}
          </View>

          {/* improvement trend */}
          {performance && performance.trend.length > 1 ? (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15, marginBottom: 10 }}>
                Progress over time
              </Text>
              {performance.trend.map((t, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <Text style={{ color: theme.subtext, fontSize: 11, width: 78 }}>
                    {t.evaluated_at
                      ? new Date(t.evaluated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                      : "—"}
                  </Text>
                  <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.border }}>
                    <View
                      style={{
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: t.percentage >= 60 ? "#2e7d32" : theme.danger,
                        width: `${Math.max(2, t.percentage)}%`,
                      }}
                    />
                  </View>
                  <Text style={{ color: theme.text, fontSize: 12, width: 46, textAlign: "right", fontWeight: "700" }}>
                    {t.percentage}%
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* results history */}
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15, marginTop: 8, marginBottom: 10 }}>
            Completed tests
          </Text>
          {results.length === 0 ? (
            <Text style={{ color: theme.subtext }}>No completed tests yet.</Text>
          ) : (
            results.map((r) => (
              <TouchableOpacity
                key={r.result_id ?? r.attempt_id}
                style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => r.result_id && setOpenResultId(r.result_id)}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                    {r.test_title || "Test"}
                  </Text>
                  <Text style={{ color: r.passed ? "#2e7d32" : theme.danger, fontWeight: "800" }}>
                    {r.obtained_marks}/{r.total_marks} · {r.percentage}%
                  </Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                  <Text style={{ color: theme.subtext, fontSize: 12 }}>
                    {r.evaluated_at ? new Date(r.evaluated_at).toLocaleDateString() : ""}
                  </Text>
                  <Text style={{ color: r.passed ? "#2e7d32" : theme.danger, fontSize: 12, fontWeight: "700" }}>
                    {r.passed ? "✅ Passed" : "❌ Not passed"} · tap to review
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  stat: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: "center" },
});
