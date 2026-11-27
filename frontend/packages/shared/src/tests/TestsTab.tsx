import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  api,
  type ClassroomTeacherView,
  type Session,
  type TestItem,
  type TestStatus,
} from "../index";
import { themes } from "../theme";
import CreateTestScreen from "./CreateTestScreen";
import TestDetailScreen from "./TestDetailScreen";

interface TestsTabProps {
  session: Session;
  initialClassroomId?: string | null;
}

type FilterStatus = "all" | TestStatus;

export default function TestsTab({ session, initialClassroomId }: TestsTabProps) {
  const theme = themes.teacher;

  const [tests, setTests] = useState<TestItem[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomTeacherView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [selectedClassroomId, setSelectedClassroomId] = useState<string | null>(
    initialClassroomId ?? null
  );
  const [searchQuery, setSearchQuery] = useState("");

  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [isCreatingTest, setIsCreatingTest] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [testsRes, classRes] = await Promise.all([
        api.teacherTests(session.token),
        api.teacherClassrooms(session.token),
      ]);
      setTests(testsRes.tests);
      setClassrooms(classRes.classrooms);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session.token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const classroomMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classrooms) {
      map.set(c.id, c.name);
    }
    return map;
  }, [classrooms]);

  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) {
        return false;
      }
      if (selectedClassroomId && t.classroom_id !== selectedClassroomId) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.trim().toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(query);
        const className = classroomMap.get(t.classroom_id)?.toLowerCase() ?? "";
        if (!matchesTitle && !className.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [tests, statusFilter, selectedClassroomId, searchQuery, classroomMap]);

  const handleDeleteTest = (testId: string, testTitle: string) => {
    Alert.alert(
      "Delete Test",
      `Are you sure you want to delete "${testTitle}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteTeacherTest(session.token, testId);
              setTests((prev) => prev.filter((t) => t.id !== testId));
              Alert.alert("Deleted", "Test removed.");
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              Alert.alert("Delete Failed", msg);
            }
          },
        },
      ]
    );
  };

  if (isCreatingTest) {
    return (
      <CreateTestScreen
        session={session}
        initialClassroomId={selectedClassroomId}
        onBack={() => setIsCreatingTest(false)}
        onTestCreated={(newTestId) => {
          setIsCreatingTest(false);
          setActiveTestId(newTestId);
          loadData();
        }}
      />
    );
  }

  if (activeTestId) {
    const currentTest = tests.find((t) => t.id === activeTestId);
    const className = currentTest ? classroomMap.get(currentTest.classroom_id) : undefined;
    return (
      <TestDetailScreen
        session={session}
        testId={activeTestId}
        classroomName={className}
        onBack={() => {
          setActiveTestId(null);
          loadData();
        }}
        onTestDeleted={() => {
          setActiveTestId(null);
          loadData();
        }}
      />
    );
  }

  const draftCount = tests.filter((t) => t.status === "draft").length;
  const publishedCount = tests.filter((t) => t.status === "published").length;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.accentSoft }]}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerLeftGroup}>
            <Ionicons name="document-text-outline" size={24} color={theme.text} style={styles.headerIcon} />
            <Text style={[styles.headerTitle, { color: theme.text }]}>Tests & Quizzes</Text>
          </View>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: theme.accent }]}
            onPress={() => setIsCreatingTest(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={17} color="#ffffff" style={styles.createBtnIcon} />
            <Text style={styles.createBtnText}>New Test</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredTests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData();
              }}
            />
          }
          ListHeaderComponent={
            <View style={styles.topContainer}>
              {error ? (
                <Text style={[styles.errorBanner, { color: theme.danger }]}>{error}</Text>
              ) : null}

              {/* Metric Summary Cards */}
              <View style={styles.metricRow}>
                <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="layers-outline" size={16} color={theme.accent} />
                  <Text style={[styles.metricNumber, { color: theme.text }]}>{tests.length}</Text>
                  <Text style={[styles.metricLabel, { color: theme.subtext }]}>Total Tests</Text>
                </View>

                <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="create-outline" size={16} color="#b45309" />
                  <Text style={[styles.metricNumber, { color: "#b45309" }]}>{draftCount}</Text>
                  <Text style={[styles.metricLabel, { color: theme.subtext }]}>Drafts Review</Text>
                </View>

                <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Ionicons name="checkmark-done-circle-outline" size={16} color="#15803d" />
                  <Text style={[styles.metricNumber, { color: "#15803d" }]}>{publishedCount}</Text>
                  <Text style={[styles.metricLabel, { color: theme.subtext }]}>Published</Text>
                </View>
              </View>

              {/* Search Bar with Vector Icon */}
              <View style={[styles.searchContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Ionicons name="search-outline" size={17} color={theme.subtext} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Search tests by title or classroom..."
                  placeholderTextColor={theme.subtext}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={HIT_SLOP}>
                    <Ionicons name="close-circle" size={16} color={theme.subtext} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Status Filter Chips */}
              <View style={styles.filterChipRow}>
                {(["all", "draft", "published", "closed"] as FilterStatus[]).map((status) => {
                  const isSelected = statusFilter === status;
                  return (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.filterChip,
                        { borderColor: theme.border },
                        isSelected && {
                          backgroundColor: theme.accent,
                          borderColor: theme.accent,
                        },
                      ]}
                      onPress={() => setStatusFilter(status)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: isSelected ? "#ffffff" : theme.text },
                        ]}
                      >
                        {status.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Classroom Filter (if more than 1 classroom exists) */}
              {classrooms.length > 1 && (
                <View style={styles.classroomFilterContainer}>
                  <Text style={[styles.classroomFilterTitle, { color: theme.subtext }]}>
                    Filter by Classroom:
                  </Text>
                  <View style={styles.classroomChipRow}>
                    <TouchableOpacity
                      style={[
                        styles.classFilterChip,
                        { borderColor: theme.border },
                        selectedClassroomId === null && {
                          backgroundColor: theme.accentSoft,
                          borderColor: theme.accent,
                        },
                      ]}
                      onPress={() => setSelectedClassroomId(null)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.classFilterChipText,
                          { color: selectedClassroomId === null ? theme.accent : theme.subtext },
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
                            styles.classFilterChip,
                            { borderColor: theme.border },
                            isSelected && {
                              backgroundColor: theme.accent,
                              borderColor: theme.accent,
                            },
                          ]}
                          onPress={() => setSelectedClassroomId(isSelected ? null : c.id)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.classFilterChipText,
                              { color: isSelected ? "#ffffff" : theme.text },
                            ]}
                          >
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const className = classroomMap.get(item.classroom_id) ?? "Classroom";
            const isDraft = item.status === "draft";
            const isPublished = item.status === "published";

            return (
              <TouchableOpacity
                style={[styles.testCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => setActiveTestId(item.id)}
                activeOpacity={0.75}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={[styles.testTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <View style={styles.classInfoRow}>
                      <Ionicons name="school-outline" size={13} color={theme.subtext} />
                      <Text style={[styles.classroomName, { color: theme.subtext }]}>
                        {className}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusBadge,
                      isPublished
                        ? styles.statusBadgePublished
                        : isDraft
                        ? styles.statusBadgeDraft
                        : styles.statusBadgeClosed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        isPublished
                          ? styles.statusTextPublished
                          : isDraft
                          ? styles.statusTextDraft
                          : styles.statusTextClosed,
                      ]}
                    >
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Details row with vector icons */}
                <View style={styles.detailRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="help-circle-outline" size={13} color={theme.subtext} />
                    <Text style={[styles.detailItem, { color: theme.subtext }]}>
                      {item.total_questions} Questions ({item.total_marks} Marks)
                    </Text>
                  </View>

                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={13} color={theme.subtext} />
                    <Text style={[styles.detailItem, { color: theme.subtext }]}>
                      {item.duration_minutes}m
                    </Text>
                  </View>

                  <View style={styles.metaItem}>
                    <Ionicons name="ribbon-outline" size={13} color={theme.subtext} />
                    <Text style={[styles.detailItem, { color: theme.subtext }]}>
                      Pass {item.passing_percentage}%
                    </Text>
                  </View>

                  <View style={styles.metaItem}>
                    <Ionicons name="speedometer-outline" size={13} color={theme.subtext} />
                    <Text style={[styles.detailItem, { color: theme.subtext }]}>
                      {item.difficulty}
                    </Text>
                  </View>
                </View>

                {/* Bottom card footer */}
                <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                  <View style={styles.viewDetailsRow}>
                    <Text style={[styles.viewDetailsText, { color: theme.accent }]}>
                      {isDraft ? "Review Questions" : "View Test Details"}
                    </Text>
                    <Ionicons name="arrow-forward" size={13} color={theme.accent} style={styles.arrowIcon} />
                  </View>

                  <TouchableOpacity
                    style={styles.cardDeleteBtn}
                    hitSlop={HIT_SLOP}
                    onPress={() => handleDeleteTest(item.id, item.title)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={15} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={44} color={theme.subtext} style={styles.emptyIcon} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No tests found</Text>
              <Text style={[styles.emptySubtitle, { color: theme.subtext }]}>
                {searchQuery || statusFilter !== "all" || selectedClassroomId
                  ? "Try adjusting your filters or search."
                  : "Generate your first AI assessment grounded in classroom chapters."}
              </Text>
              <TouchableOpacity
                style={[styles.emptyCreateBtn, { backgroundColor: theme.accent }]}
                onPress={() => setIsCreatingTest(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="sparkles" size={15} color="#ffffff" style={styles.createBtnIcon} />
                <Text style={styles.emptyCreateBtnText}>Generate Test</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const TOP_HEADER_PADDING =
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
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: TOP_HEADER_PADDING,
    paddingBottom: 14,
  },
  headerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIcon: {
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  createBtnIcon: {
    marginRight: 4,
  },
  createBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  topContainer: {
    marginBottom: 12,
  },
  errorBanner: {
    fontSize: 13,
    marginBottom: 10,
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
    gap: 2,
  },
  metricNumber: {
    fontSize: 19,
    fontWeight: "800",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginBottom: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  filterChipRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  classroomFilterContainer: {
    marginBottom: 8,
  },
  classroomFilterTitle: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 5,
  },
  classroomChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  classFilterChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  classFilterChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  testCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  testTitle: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  classInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 4,
  },
  classroomName: {
    fontSize: 12,
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  statusBadgeDraft: {
    backgroundColor: "#fef3c7",
  },
  statusBadgePublished: {
    backgroundColor: "#dcfce7",
  },
  statusBadgeClosed: {
    backgroundColor: "#f4f4f5",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
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
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  detailItem: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 10,
  },
  viewDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: "700",
  },
  arrowIcon: {
    marginLeft: 4,
  },
  cardDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 44,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 16,
  },
  emptyCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  emptyCreateBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
});
