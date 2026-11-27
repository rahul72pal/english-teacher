import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  api,
  parseServerDate,
  studentTestsApi,
  type AttemptResult,
  type ClassroomStudentView,
  type Session,
  type StudentTest,
} from "../index";
import { themes } from "../theme";
import TestAttemptScreen from "./TestAttemptScreen";
import TestInstructionsScreen from "./TestInstructionsScreen";
import TestResultScreen from "./TestResultScreen";

interface StudentTestsTabProps {
  session: Session;
  initialClassroomId?: string | null;
}

type ScreenView =
  | { type: "tab" }
  | { type: "instructions"; test: StudentTest & { classroom_name: string } }
  | { type: "attempt"; attemptId: string }
  | { type: "result"; attemptId: string; testTitle: string };

type EnrichedTest = StudentTest & { classroom_name: string; classroom_id: string };

const TOP_HEADER_PADDING =
  Platform.OS === "ios"
    ? 56
    : StatusBar.currentHeight
    ? StatusBar.currentHeight + 12
    : 44;

export default function StudentTestsTab({
  session,
  initialClassroomId,
}: StudentTestsTabProps) {
  const theme = themes.student;
  const [screenView, setScreenView] = useState<ScreenView>({ type: "tab" });
  const [classrooms, setClassrooms] = useState<ClassroomStudentView[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(
    initialClassroomId ?? null
  );
  const [tests, setTests] = useState<EnrichedTest[]>([]);
  const [results, setResults] = useState<AttemptResult[]>([]);
  const [activeTab, setActiveTab] = useState<"available" | "results">("available");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [classroomsRes, resultsRes] = await Promise.all([
        api.studentClassrooms(session.token),
        studentTestsApi.allResults(session.token),
      ]);

      const classList = classroomsRes.classrooms || [];
      setClassrooms(classList);
      setResults(resultsRes.results || []);

      // Fetch tests across enrolled classrooms
      const classroomTestsPromises = classList.map(async (c) => {
        try {
          const res = await studentTestsApi.listClassroomTests(session.token, c.id);
          return (res.tests || []).map((t) => ({
            ...t,
            classroom_name: c.name,
            classroom_id: c.id,
          }));
        } catch {
          return [] as EnrichedTest[];
        }
      });

      const allClassroomTests = await Promise.all(classroomTestsPromises);
      setTests(allClassroomTests.flat());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter tests by selected classroom
  const filteredTests = useMemo(() => {
    if (!selectedClassroomId) return tests;
    return tests.filter((t) => t.classroom_id === selectedClassroomId);
  }, [tests, selectedClassroomId]);

  // Filter results by selected classroom
  const filteredResults = useMemo(() => {
    if (!selectedClassroomId) return results;
    // Map test IDs belonging to selected classroom
    const classroomTestIds = new Set(
      tests.filter((t) => t.classroom_id === selectedClassroomId).map((t) => t.id)
    );
    return results.filter((r) => classroomTestIds.has(r.test_id));
  }, [results, tests, selectedClassroomId]);

  // Metrics computation
  const metrics = useMemo(() => {
    const total = filteredTests.length;
    const completed = filteredResults.length;
    const avgScore =
      filteredResults.length > 0
        ? Math.round(
            filteredResults.reduce((acc, r) => acc + (r.percentage || 0), 0) /
              filteredResults.length
          )
        : 0;
    return { total, completed, avgScore };
  }, [filteredTests, filteredResults]);

  // Test status check
  const now = Date.now();
  const getTestStatus = (
    test: StudentTest
  ): { status: "available" | "upcoming" | "closed"; label: string; color: string } => {
    const startTime = parseServerDate(test.start_at);
    if (startTime && startTime > now) {
      return { status: "upcoming", label: "UPCOMING", color: "#6b7280" };
    }
    const endTime = parseServerDate(test.end_at);
    if (endTime && endTime < now) {
      return { status: "closed", label: "CLOSED", color: theme.danger };
    }
    return { status: "available", label: "AVAILABLE", color: "#15803d" };
  };

  const getDifficultyColor = (diff: string): string => {
    switch (diff.toLowerCase()) {
      case "easy":
        return "#15803d";
      case "hard":
        return "#b91c1c";
      default:
        return "#b45309";
    }
  };

  // Subscreen navigation
  if (screenView.type === "result") {
    return (
      <TestResultScreen
        session={session}
        attemptId={screenView.attemptId}
        onBack={() => {
          setScreenView({ type: "tab" });
          loadData();
        }}
      />
    );
  }

  if (screenView.type === "attempt") {
    return (
      <TestAttemptScreen
        session={session}
        attemptId={screenView.attemptId}
        onSubmitted={(attemptId, testTitle) =>
          setScreenView({ type: "result", attemptId, testTitle })
        }
        onBack={() => {
          setScreenView({ type: "tab" });
          loadData();
        }}
      />
    );
  }

  if (screenView.type === "instructions") {
    return (
      <TestInstructionsScreen
        session={session}
        test={screenView.test}
        onBack={() => setScreenView({ type: "tab" })}
        onStarted={(attemptId) => setScreenView({ type: "attempt", attemptId })}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <View style={styles.headerTitleRow}>
          <Ionicons
            name="document-text-outline"
            size={22}
            color={theme.text}
            style={styles.headerIcon}
          />
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            My Tests & Quizzes
          </Text>
        </View>
        <View style={[styles.badgePill, { backgroundColor: theme.surface }]}>
          <Text style={[styles.badgePillText, { color: theme.accent }]}>
            STUDENT
          </Text>
        </View>
      </View>

      {/* Classroom Filter Chips */}
      {classrooms.length > 0 && (
        <View style={styles.classroomChipsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.classroomChipsScroll}
          >
            <TouchableOpacity
              style={[
                styles.chip,
                {
                  backgroundColor:
                    selectedClassroomId === null ? theme.accent : theme.surface,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => setSelectedClassroomId(null)}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selectedClassroomId === null ? "#ffffff" : theme.text },
                ]}
              >
                All Classes
              </Text>
            </TouchableOpacity>
            {classrooms.map((c) => {
              const isSelected = selectedClassroomId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? theme.accent : theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={() => setSelectedClassroomId(c.id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? "#ffffff" : theme.text },
                    ]}
                  >
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.subtext }]}>
            Loading tests & assessments...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
            />
          }
        >
          {error && (
            <View style={[styles.errorCard, { borderColor: theme.danger }]}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
            </View>
          )}

          {/* Metrics Overview */}
          <View style={styles.metricsRow}>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Ionicons name="reader-outline" size={18} color={theme.accent} />
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {metrics.total}
              </Text>
              <Text style={[styles.metricLabel, { color: theme.subtext }]}>
                Published
              </Text>
            </View>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Ionicons
                name="checkmark-done-circle-outline"
                size={18}
                color="#15803d"
              />
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {metrics.completed}
              </Text>
              <Text style={[styles.metricLabel, { color: theme.subtext }]}>
                Graded
              </Text>
            </View>
            <View
              style={[
                styles.metricCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Ionicons name="trophy-outline" size={18} color="#b45309" />
              <Text style={[styles.metricValue, { color: theme.text }]}>
                {metrics.avgScore}%
              </Text>
              <Text style={[styles.metricLabel, { color: theme.subtext }]}>
                Avg Score
              </Text>
            </View>
          </View>

          {/* Segmented Tab Filter */}
          <View
            style={[
              styles.segmentedContainer,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.segmentButton,
                activeTab === "available" && {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                },
              ]}
              onPress={() => setActiveTab("available")}
            >
              <Ionicons
                name="play-circle-outline"
                size={15}
                color={activeTab === "available" ? theme.accent : theme.subtext}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.segmentButtonText,
                  {
                    color: activeTab === "available" ? theme.accent : theme.subtext,
                  },
                ]}
              >
                Available Tests ({filteredTests.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentButton,
                activeTab === "results" && {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                },
              ]}
              onPress={() => setActiveTab("results")}
            >
              <Ionicons
                name="ribbon-outline"
                size={15}
                color={activeTab === "results" ? theme.accent : theme.subtext}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.segmentButtonText,
                  {
                    color: activeTab === "results" ? theme.accent : theme.subtext,
                  },
                ]}
              >
                Past Results ({filteredResults.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content: Available Tests */}
          {activeTab === "available" && (
            <View style={styles.listSection}>
              {filteredTests.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={36}
                    color={theme.subtext}
                  />
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>
                    No tests published yet
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>
                    When your teacher publishes a test, it will appear here for you to
                    take.
                  </Text>
                </View>
              ) : (
                filteredTests.map((test) => {
                  const statusInfo = getTestStatus(test);
                  const result = filteredResults.find((r) => r.test_id === test.id);
                  const isAvailable = statusInfo.status === "available";

                  return (
                    <View
                      key={test.id}
                      style={[
                        styles.testCard,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <View style={styles.testHeaderRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={[styles.testTitle, { color: theme.text }]}>
                            {test.title}
                          </Text>
                          <Text
                            style={[styles.testClassroomName, { color: theme.subtext }]}
                          >
                            Class: {test.classroom_name}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusPill,
                            { backgroundColor: `${statusInfo.color}15` },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              { color: statusInfo.color },
                            ]}
                          >
                            {statusInfo.label}
                          </Text>
                        </View>
                      </View>

                      {/* Meta badges */}
                      <View style={styles.metaRow}>
                        <View style={styles.metaBadge}>
                          <Ionicons
                            name="help-circle-outline"
                            size={13}
                            color={theme.subtext}
                          />
                          <Text style={[styles.metaText, { color: theme.subtext }]}>
                            {test.total_questions} Questions
                          </Text>
                        </View>
                        <View style={styles.metaBadge}>
                          <Ionicons
                            name="medal-outline"
                            size={13}
                            color={theme.subtext}
                          />
                          <Text style={[styles.metaText, { color: theme.subtext }]}>
                            {test.total_marks} Marks
                          </Text>
                        </View>
                        <View style={styles.metaBadge}>
                          <Ionicons
                            name="time-outline"
                            size={13}
                            color={theme.subtext}
                          />
                          <Text style={[styles.metaText, { color: theme.subtext }]}>
                            {test.duration_minutes} Mins
                          </Text>
                        </View>
                        <View style={styles.metaBadge}>
                          <Ionicons
                            name="speedometer-outline"
                            size={13}
                            color={getDifficultyColor(test.difficulty)}
                          />
                          <Text
                            style={[
                              styles.metaText,
                              { color: getDifficultyColor(test.difficulty) },
                            ]}
                          >
                            {test.difficulty.toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      {/* Last score notice */}
                      {result && (
                        <View
                          style={[
                            styles.previousScoreNotice,
                            { backgroundColor: theme.accentSoft },
                          ]}
                        >
                          <Ionicons
                            name={result.passed ? "checkmark-circle" : "close-circle"}
                            size={14}
                            color={result.passed ? "#15803d" : theme.danger}
                          />
                          <Text
                            style={[styles.previousScoreText, { color: theme.text }]}
                          >
                            Last Score: {result.obtained_marks}/{result.total_marks} (
                            {result.percentage}%) ·{" "}
                            {result.passed ? "PASSED" : "FAILED"}
                          </Text>
                        </View>
                      )}

                      {/* Actions */}
                      <View style={styles.cardActionsRow}>
                        {result && (
                          <TouchableOpacity
                            style={[
                              styles.secondaryActionBtn,
                              { borderColor: theme.border },
                            ]}
                            onPress={() =>
                              setScreenView({
                                type: "result",
                                attemptId: result.attempt_id,
                                testTitle: test.title,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.secondaryActionBtnText,
                                { color: theme.text },
                              ]}
                            >
                              View Result
                            </Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[
                            styles.primaryActionBtn,
                            {
                              backgroundColor: theme.accent,
                              opacity: isAvailable ? 1 : 0.5,
                            },
                          ]}
                          disabled={!isAvailable}
                          onPress={() =>
                            setScreenView({ type: "instructions", test })
                          }
                        >
                          <Text style={styles.primaryActionBtnText}>
                            {result ? "Retake Test" : "Start Test"}
                          </Text>
                          <Ionicons
                            name="arrow-forward"
                            size={13}
                            color="#ffffff"
                            style={{ marginLeft: 4 }}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* Tab Content: Past Results */}
          {activeTab === "results" && (
            <View style={styles.listSection}>
              {filteredResults.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <Ionicons name="ribbon-outline" size={36} color={theme.subtext} />
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>
                    No graded attempts yet
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>
                    When you take and submit tests, your scores and AI evaluation will
                    be recorded here.
                  </Text>
                </View>
              ) : (
                filteredResults.map((result) => {
                  const isPassed = result.passed;
                  return (
                    <TouchableOpacity
                      key={result.attempt_id}
                      style={[
                        styles.resultCard,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                      onPress={() =>
                        setScreenView({
                          type: "result",
                          attemptId: result.attempt_id,
                          testTitle: result.test_title,
                        })
                      }
                      activeOpacity={0.7}
                    >
                      <View style={styles.resultHeaderRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={[styles.testTitle, { color: theme.text }]}>
                            {result.test_title || "English Assessment"}
                          </Text>
                          <Text
                            style={[styles.resultDateText, { color: theme.subtext }]}
                          >
                            Status: {result.evaluation_status.toUpperCase()}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusPill,
                            {
                              backgroundColor: isPassed ? "#dcfce7" : "#fee2e2",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusPillText,
                              { color: isPassed ? "#15803d" : "#b91c1c" },
                            ]}
                          >
                            {isPassed ? "PASSED" : "FAILED"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.resultScoreContainer}>
                        <View style={styles.scoreRow}>
                          <Text
                            style={[styles.scoreNumber, { color: theme.text }]}
                          >
                            {result.obtained_marks}{" "}
                            <Text
                              style={[styles.scoreTotal, { color: theme.subtext }]}
                            >
                              / {result.total_marks} marks
                            </Text>
                          </Text>
                          <Text
                            style={[
                              styles.percentagePill,
                              {
                                color: isPassed ? "#15803d" : "#b91c1c",
                              },
                            ]}
                          >
                            {result.percentage}%
                          </Text>
                        </View>
                      </View>

                      <View style={styles.resultFooterRow}>
                        <Text
                          style={[
                            styles.viewDetailsPrompt,
                            { color: theme.accent },
                          ]}
                        >
                          Review Questions & Feedback
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={14}
                          color={theme.accent}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: TOP_HEADER_PADDING,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  badgePill: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  classroomChipsContainer: {
    paddingVertical: 8,
  },
  classroomChipsScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 13,
    marginTop: 8,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  segmentedContainer: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  segmentButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  listSection: {
    gap: 12,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  testCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  testHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  testTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  testClassroomName: {
    fontSize: 12,
    marginTop: 2,
  },
  statusPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "600",
  },
  previousScoreNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  previousScoreText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingVertical: 10,
  },
  primaryActionBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryActionBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  resultHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  resultDateText: {
    fontSize: 12,
    marginTop: 2,
  },
  resultScoreContainer: {
    marginTop: 10,
    paddingVertical: 6,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  scoreNumber: {
    fontSize: 20,
    fontWeight: "800",
  },
  scoreTotal: {
    fontSize: 13,
    fontWeight: "500",
  },
  percentagePill: {
    fontSize: 16,
    fontWeight: "800",
  },
  resultFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  viewDetailsPrompt: {
    fontSize: 12,
    fontWeight: "700",
  },
});
