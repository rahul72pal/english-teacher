import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  api,
  type Session,
  type TestItem,
  type TestQuestion,
} from "../index";
import { themes } from "../theme";
import EditQuestionModal from "./EditQuestionModal";
import EditTestSettingsModal from "./EditTestSettingsModal";
import PublishTestModal from "./PublishTestModal";
import QuestionCard from "./QuestionCard";

interface TestDetailScreenProps {
  session: Session;
  testId: string;
  classroomName?: string;
  onBack: () => void;
  onTestDeleted?: () => void;
}

export default function TestDetailScreen({
  session,
  testId,
  classroomName,
  onBack,
  onTestDeleted,
}: TestDetailScreenProps) {
  const theme = themes.teacher;

  const [test, setTest] = useState<TestItem | null>(null);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busyQuestionId, setBusyQuestionId] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<TestQuestion | null>(null);

  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [deletingTest, setDeletingTest] = useState(false);

  const loadTestDetails = useCallback(async () => {
    setError(null);
    try {
      const response = await api.getTeacherTest(session.token, testId);
      setTest(response.test);
      setQuestions(response.questions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.token, testId]);

  useEffect(() => {
    loadTestDetails();
  }, [loadTestDetails]);

  const handleApproveQuestion = async (questionId: string) => {
    setBusyQuestionId(questionId);
    try {
      const res = await api.approveTestQuestion(session.token, testId, questionId);
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? res.question : q))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Approve Failed", msg);
    } finally {
      setBusyQuestionId(null);
    }
  };

  const handleRegenerateQuestion = async (questionId: string) => {
    setBusyQuestionId(questionId);
    try {
      const res = await api.regenerateTestQuestion(session.token, testId, questionId);
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? res.question : q))
      );
      Alert.alert("Success", "Question regenerated successfully with new AI content.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Regenerate Failed", msg);
    } finally {
      setBusyQuestionId(null);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    setBusyQuestionId(questionId);
    try {
      await api.deleteTestQuestion(session.token, testId, questionId);
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
      const updated = await api.getTeacherTest(session.token, testId);
      setTest(updated.test);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Delete Failed", msg);
    } finally {
      setBusyQuestionId(null);
    }
  };

  const handleQuestionSaved = (updatedQuestion: TestQuestion) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q))
    );
    api.getTeacherTest(session.token, testId)
      .then((res) => setTest(res.test))
      .catch(() => {});
  };

  const handleDeleteTest = () => {
    Alert.alert(
      "Delete Test",
      "Are you sure you want to permanently delete this test and all its questions?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingTest(true);
            try {
              await api.deleteTeacherTest(session.token, testId);
              Alert.alert("Deleted", "Test removed successfully.");
              if (onTestDeleted) {
                onTestDeleted();
              } else {
                onBack();
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              Alert.alert("Delete Failed", msg);
              setDeletingTest(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (error || !test) {
    return (
      <View style={styles.center}>
        <Text style={[styles.errorText, { color: theme.danger }]}>
          {error ?? "Test not found."}
        </Text>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: theme.accent }]} onPress={onBack}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const approvedCount = questions.filter((q) => q.approved).length;
  const unapprovedCount = questions.length - approvedCount;
  const isDraft = test.status === "draft";

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Top Navigation Bar with Proper Safe-Area Padding */}
      <View style={[styles.navBar, { backgroundColor: theme.accentSoft, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={HIT_SLOP}
          style={styles.navBackBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color={theme.accent} />
          <Text style={[styles.navBackText, { color: theme.accent }]}>Back</Text>
        </TouchableOpacity>

        <Text style={[styles.navTitle, { color: theme.text }]} numberOfLines={1}>
          {test.title}
        </Text>

        <TouchableOpacity
          style={styles.navDeleteBtn}
          onPress={handleDeleteTest}
          disabled={deletingTest}
          hitSlop={HIT_SLOP}
          activeOpacity={0.7}
        >
          {deletingTest ? (
            <ActivityIndicator size="small" color="#dc2626" />
          ) : (
            <Ionicons name="trash-outline" size={17} color="#dc2626" />
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={questions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadTestDetails();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* Overview Card */}
            <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: theme.text }]}>{test.title}</Text>
                <View
                  style={[
                    styles.statusPill,
                    test.status === "published"
                      ? styles.statusPublished
                      : test.status === "draft"
                      ? styles.statusDraft
                      : styles.statusClosed,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      test.status === "published"
                        ? styles.statusTextPublished
                        : test.status === "draft"
                        ? styles.statusTextDraft
                        : styles.statusTextClosed,
                    ]}
                  >
                    {test.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              {classroomName ? (
                <View style={styles.classroomRow}>
                  <Ionicons name="school-outline" size={14} color={theme.subtext} />
                  <Text style={[styles.classroomLabel, { color: theme.subtext }]}>
                    {classroomName}
                  </Text>
                </View>
              ) : null}

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={[styles.statBox, { backgroundColor: theme.bg }]}>
                  <Ionicons name="help-circle-outline" size={16} color={theme.accent} />
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {test.total_questions}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Questions</Text>
                </View>

                <View style={[styles.statBox, { backgroundColor: theme.bg }]}>
                  <Ionicons name="trophy-outline" size={16} color={theme.accent} />
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {test.total_marks}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Total Marks</Text>
                </View>

                <View style={[styles.statBox, { backgroundColor: theme.bg }]}>
                  <Ionicons name="time-outline" size={16} color={theme.accent} />
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {test.duration_minutes}m
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Duration</Text>
                </View>

                <View style={[styles.statBox, { backgroundColor: theme.bg }]}>
                  <Ionicons name="ribbon-outline" size={16} color={theme.accent} />
                  <Text style={[styles.statValue, { color: theme.text }]}>
                    {test.passing_percentage}%
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.subtext }]}>Passing</Text>
                </View>
              </View>

              {/* Review status bar */}
              <View style={[styles.reviewBar, { borderColor: theme.border }]}>
                <View style={styles.reviewBarLeft}>
                  <Ionicons
                    name={approvedCount === questions.length ? "checkmark-circle" : "time-outline"}
                    size={16}
                    color={approvedCount === questions.length ? "#15803d" : "#b45309"}
                  />
                  <Text style={[styles.reviewText, { color: theme.text }]}>
                    Approval Status:{" "}
                    <Text style={styles.approvedCount}>
                      {approvedCount}/{questions.length} Approved
                    </Text>
                  </Text>
                </View>

                {unapprovedCount > 0 && isDraft && (
                  <Text style={[styles.unapprovedNotice, { color: theme.subtext }]}>
                    ({unapprovedCount} pending)
                  </Text>
                )}
              </View>

              {/* Action Buttons Row */}
              <View style={styles.actionRow}>
                {isDraft && (
                  <TouchableOpacity
                    style={[styles.settingsBtn, { borderColor: theme.border }]}
                    onPress={() => setSettingsModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="settings-outline" size={15} color={theme.text} style={styles.actionBtnIcon} />
                    <Text style={[styles.settingsBtnText, { color: theme.text }]}>Settings</Text>
                  </TouchableOpacity>
                )}

                {isDraft && (
                  <TouchableOpacity
                    style={[styles.publishActionBtn, { backgroundColor: "#15803d" }]}
                    onPress={() => setPublishModalVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="rocket-outline" size={15} color="#ffffff" style={styles.actionBtnIcon} />
                    <Text style={styles.publishActionText}>Publish Test</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Questions ({questions.length})
              </Text>
              {isDraft && (
                <Text style={[styles.sectionSubtitle, { color: theme.subtext }]}>
                  Review generated questions, refine text or retry with AI if needed
                </Text>
              )}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <QuestionCard
            question={item}
            index={index}
            testStatus={test.status}
            isBusy={busyQuestionId === item.id}
            onApprove={handleApproveQuestion}
            onRegenerate={handleRegenerateQuestion}
            onEdit={(q) => setEditingQuestion(q)}
            onDelete={handleDeleteQuestion}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={40} color={theme.subtext} />
            <Text style={[styles.emptyText, { color: theme.subtext }]}>
              No questions found for this test.
            </Text>
          </View>
        }
      />

      {/* Modals */}
      <EditQuestionModal
        visible={editingQuestion !== null}
        testId={test.id}
        token={session.token}
        question={editingQuestion}
        onClose={() => setEditingQuestion(null)}
        onSaved={handleQuestionSaved}
      />

      <EditTestSettingsModal
        visible={settingsModalVisible}
        token={session.token}
        test={test}
        onClose={() => setSettingsModalVisible(false)}
        onUpdated={(updated) => setTest(updated)}
      />

      <PublishTestModal
        visible={publishModalVisible}
        token={session.token}
        test={test}
        unapprovedCount={unapprovedCount}
        onClose={() => setPublishModalVisible(false)}
        onPublished={(updated) => setTest(updated)}
      />
    </View>
  );
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const TOP_NAV_PADDING =
  Platform.OS === "ios"
    ? 56
    : (StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 44);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 15,
    marginBottom: 16,
    textAlign: "center",
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: TOP_NAV_PADDING,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  navBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    minWidth: 70,
  },
  navBackText: {
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 2,
  },
  navTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginHorizontal: 8,
    letterSpacing: -0.2,
  },
  navDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerContainer: {
    marginBottom: 16,
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDraft: {
    backgroundColor: "#fef3c7",
  },
  statusPublished: {
    backgroundColor: "#dcfce7",
  },
  statusClosed: {
    backgroundColor: "#f4f4f5",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  statusTextDraft: {
    color: "#b45309",
  },
  statusTextPublished: {
    color: "#15803d",
  },
  statusTextClosed: {
    color: "#52525b",
  },
  classroomRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 12,
    gap: 5,
  },
  classroomLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 12,
  },
  statBox: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    gap: 3,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  reviewBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
  },
  reviewBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reviewText: {
    fontSize: 13,
    fontWeight: "600",
  },
  approvedCount: {
    color: "#15803d",
    fontWeight: "700",
  },
  unapprovedNotice: {
    fontSize: 12,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 14,
    gap: 10,
  },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 5,
  },
  actionBtnIcon: {
    marginRight: 2,
  },
  settingsBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  publishActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 5,
  },
  publishActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionHeader: {
    marginTop: 4,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
  },
});
