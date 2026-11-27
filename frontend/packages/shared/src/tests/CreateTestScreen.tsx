import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
  type ChapterView,
  type ClassroomTeacherView,
  type GenerateTestPayload,
  type QuestionDistribution,
  type Session,
  type TestDifficulty,
} from "../index";
import { themes } from "../theme";

interface CreateTestScreenProps {
  session: Session;
  initialClassroomId?: string | null;
  onBack: () => void;
  onTestCreated: (testId: string) => void;
}

export default function CreateTestScreen({
  session,
  initialClassroomId,
  onBack,
  onTestCreated,
}: CreateTestScreenProps) {
  const theme = themes.teacher;

  const [classrooms, setClassrooms] = useState<ClassroomTeacherView[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(
    initialClassroomId ?? ""
  );
  const [chapters, setChapters] = useState<ChapterView[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);

  const [title, setTitle] = useState("English Assessment");
  const [difficulty, setDifficulty] = useState<TestDifficulty>("medium");

  const [distribution, setDistribution] = useState<QuestionDistribution>({
    mcq: 5,
    true_false: 3,
    descriptive: 2,
  });

  const [duration, setDuration] = useState("30");
  const [passingPercentage, setPassingPercentage] = useState("40");
  const [attempts, setAttempts] = useState("1");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const [loadingClassrooms, setLoadingClassrooms] = useState(true);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.teacherClassrooms(session.token)
      .then((res) => {
        setClassrooms(res.classrooms);
        if (!selectedClassroomId && res.classrooms.length > 0) {
          setSelectedClassroomId(res.classrooms[0].id);
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert("Classrooms Load Error", msg);
      })
      .finally(() => setLoadingClassrooms(false));
  }, [session.token, selectedClassroomId]);

  const loadChaptersForClassroom = useCallback(
    async (classroomId: string) => {
      if (!classroomId) {
        setChapters([]);
        return;
      }
      setLoadingChapters(true);
      try {
        const res = await api.teacherChapters(session.token, classroomId);
        setChapters(res.chapters);
        setSelectedChapterIds([]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Alert.alert("Chapters Load Error", msg);
      } finally {
        setLoadingChapters(false);
      }
    },
    [session.token]
  );

  useEffect(() => {
    if (selectedClassroomId) {
      loadChaptersForClassroom(selectedClassroomId);
    }
  }, [selectedClassroomId, loadChaptersForClassroom]);

  const toggleChapterSelection = (chapterId: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(chapterId)
        ? prev.filter((id) => id !== chapterId)
        : [...prev, chapterId]
    );
  };

  const updateDistribution = (key: keyof QuestionDistribution, delta: number) => {
    setDistribution((prev) => {
      const current = prev[key];
      const next = Math.max(0, Math.min(50, current + delta));
      return { ...prev, [key]: next };
    });
  };

  const totalQuestions = distribution.mcq + distribution.true_false + distribution.descriptive;

  const handleGenerate = async () => {
    if (!selectedClassroomId) {
      Alert.alert("Validation", "Please select a classroom first.");
      return;
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2 || trimmedTitle.length > 150) {
      Alert.alert("Validation", "Test title must be between 2 and 150 characters.");
      return;
    }

    if (totalQuestions <= 0) {
      Alert.alert("Validation", "Please select at least 1 question to generate.");
      return;
    }

    const parsedDuration = parseInt(duration, 10);
    if (isNaN(parsedDuration) || parsedDuration < 1 || parsedDuration > 300) {
      Alert.alert("Validation", "Duration must be between 1 and 300 minutes.");
      return;
    }

    const parsedPassing = parseInt(passingPercentage, 10);
    if (isNaN(parsedPassing) || parsedPassing < 1 || parsedPassing > 100) {
      Alert.alert("Validation", "Passing percentage must be between 1% and 100%.");
      return;
    }

    const parsedAttempts = parseInt(attempts, 10);
    if (isNaN(parsedAttempts) || parsedAttempts < 1 || parsedAttempts > 5) {
      Alert.alert("Validation", "Attempts allowed must be between 1 and 5.");
      return;
    }

    const payload: GenerateTestPayload = {
      classroom_id: selectedClassroomId,
      chapter_ids: selectedChapterIds,
      title: trimmedTitle,
      difficulty,
      question_distribution: distribution,
      duration_minutes: parsedDuration,
      passing_percentage: parsedPassing,
      attempts_allowed: parsedAttempts,
      start_at: startAt.trim().length > 0 ? startAt.trim() : null,
      end_at: endAt.trim().length > 0 ? endAt.trim() : null,
    };

    setGenerating(true);
    try {
      const response = await api.generateTest(session.token, payload);
      if (response.warnings && response.warnings.length > 0) {
        Alert.alert(
          "Test Generated with Warnings",
          response.warnings.join("\n"),
          [
            {
              text: "Review Questions",
              onPress: () => onTestCreated(response.test.id),
            },
          ]
        );
      } else {
        Alert.alert("Success", response.message, [
          {
            text: "Review Questions",
            onPress: () => onTestCreated(response.test.id),
          },
        ]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Generation Failed", msg);
    } finally {
      setGenerating(false);
    }
  };

  const readyChapters = chapters.filter((c) => c.status === "ready");

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Top Header */}
      <View style={[styles.navBar, { backgroundColor: theme.accentSoft, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={HIT_SLOP}
          style={styles.navCloseBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={22} color={theme.text} />
        </TouchableOpacity>

        <Text style={[styles.navTitle, { color: theme.text }]}>Generate AI Assessment</Text>

        <View style={styles.navPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 1. Classroom Selection */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.stepBadge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.stepBadgeText, { color: theme.accent }]}>1</Text>
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Target Classroom</Text>
          </View>

          {loadingClassrooms ? (
            <ActivityIndicator size="small" color={theme.accent} style={styles.loadingSpinner} />
          ) : classrooms.length === 0 ? (
            <Text style={[styles.helperText, { color: theme.danger }]}>
              No classrooms found. Please create a classroom first.
            </Text>
          ) : (
            <View style={styles.chipRow}>
              {classrooms.map((cls) => {
                const isSelected = selectedClassroomId === cls.id;
                return (
                  <TouchableOpacity
                    key={cls.id}
                    style={[
                      styles.classroomChip,
                      { borderColor: theme.border },
                      isSelected && {
                        backgroundColor: theme.accent,
                        borderColor: theme.accent,
                      },
                    ]}
                    onPress={() => setSelectedClassroomId(cls.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="school-outline"
                      size={14}
                      color={isSelected ? "#ffffff" : theme.text}
                      style={styles.chipIcon}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: isSelected ? "#ffffff" : theme.text },
                      ]}
                    >
                      {cls.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Chapters Selection */}
          <Text style={[styles.subLabel, { color: theme.text }]}>Source Chapters</Text>
          {loadingChapters ? (
            <ActivityIndicator size="small" color={theme.accent} style={styles.loadingSpinner} />
          ) : readyChapters.length === 0 ? (
            <Text style={[styles.helperText, { color: theme.subtext }]}>
              No ready chapters uploaded in this classroom yet. Tests require indexed PDF documents.
            </Text>
          ) : (
            <View>
              <Text style={[styles.helperText, { color: theme.subtext }]}>
                {selectedChapterIds.length === 0
                  ? "Grounding in all ready chapters of this classroom"
                  : `Grounding in ${selectedChapterIds.length} selected chapter(s)`}
              </Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[
                    styles.chapterChip,
                    { borderColor: theme.border },
                    selectedChapterIds.length === 0 && {
                      backgroundColor: theme.accentSoft,
                      borderColor: theme.accent,
                    },
                  ]}
                  onPress={() => setSelectedChapterIds([])}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="library-outline"
                    size={13}
                    color={selectedChapterIds.length === 0 ? theme.accent : theme.subtext}
                    style={styles.chipIcon}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: selectedChapterIds.length === 0 ? theme.accent : theme.subtext },
                    ]}
                  >
                    All Ready ({readyChapters.length})
                  </Text>
                </TouchableOpacity>

                {readyChapters.map((ch) => {
                  const isSelected = selectedChapterIds.includes(ch.id);
                  return (
                    <TouchableOpacity
                      key={ch.id}
                      style={[
                        styles.chapterChip,
                        { borderColor: theme.border },
                        isSelected && {
                          backgroundColor: theme.accent,
                          borderColor: theme.accent,
                        },
                      ]}
                      onPress={() => toggleChapterSelection(ch.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isSelected ? "checkmark" : "book-outline"}
                        size={13}
                        color={isSelected ? "#ffffff" : theme.text}
                        style={styles.chipIcon}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          { color: isSelected ? "#ffffff" : theme.text },
                        ]}
                      >
                        {ch.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>

        {/* 2. Test Configuration */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.stepBadge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.stepBadgeText, { color: theme.accent }]}>2</Text>
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Assessment Info</Text>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>Test Title</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Unit 1 & 2 Reading Comprehension"
            placeholderTextColor={theme.subtext}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>Difficulty Level</Text>
          <View style={styles.difficultyRow}>
            {(["easy", "medium", "hard"] as TestDifficulty[]).map((level) => {
              const isSelected = difficulty === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.difficultyBtn,
                    { borderColor: theme.border },
                    isSelected && {
                      backgroundColor: theme.accent,
                      borderColor: theme.accent,
                    },
                  ]}
                  onPress={() => setDifficulty(level)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.difficultyText,
                      { color: isSelected ? "#ffffff" : theme.text },
                    ]}
                  >
                    {level.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 3. Question Distribution */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.distHeaderRow}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.stepBadge, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.stepBadgeText, { color: theme.accent }]}>3</Text>
              </View>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Question Distribution</Text>
            </View>

            <View style={[styles.totalBadge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.totalBadgeText, { color: theme.accent }]}>
                {totalQuestions} Questions
              </Text>
            </View>
          </View>

          <View style={styles.stepperRow}>
            <View style={styles.stepperInfo}>
              <Text style={[styles.stepperName, { color: theme.text }]}>Multiple Choice (MCQ)</Text>
              <Text style={[styles.stepperSub, { color: theme.subtext }]}>1 mark each with 4 options</Text>
            </View>
            <View style={styles.stepperControls}>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.border }]}
                onPress={() => updateDistribution("mcq", -1)}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={15} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.stepValue, { color: theme.text }]}>{distribution.mcq}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.border }]}
                onPress={() => updateDistribution("mcq", 1)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={15} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.stepperRow}>
            <View style={styles.stepperInfo}>
              <Text style={[styles.stepperName, { color: theme.text }]}>True / False</Text>
              <Text style={[styles.stepperSub, { color: theme.subtext }]}>1 mark each</Text>
            </View>
            <View style={styles.stepperControls}>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.border }]}
                onPress={() => updateDistribution("true_false", -1)}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={15} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.stepValue, { color: theme.text }]}>{distribution.true_false}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.border }]}
                onPress={() => updateDistribution("true_false", 1)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={15} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.stepperRow}>
            <View style={styles.stepperInfo}>
              <Text style={[styles.stepperName, { color: theme.text }]}>Descriptive</Text>
              <Text style={[styles.stepperSub, { color: theme.subtext }]}>5 marks each with rubric</Text>
            </View>
            <View style={styles.stepperControls}>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.border }]}
                onPress={() => updateDistribution("descriptive", -1)}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={15} color={theme.text} />
              </TouchableOpacity>
              <Text style={[styles.stepValue, { color: theme.text }]}>{distribution.descriptive}</Text>
              <TouchableOpacity
                style={[styles.stepBtn, { borderColor: theme.border }]}
                onPress={() => updateDistribution("descriptive", 1)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={15} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 4. Timing & Scoring */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={[styles.stepBadge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.stepBadgeText, { color: theme.accent }]}>4</Text>
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Timing & Scoring</Text>
          </View>

          <View style={styles.settingsGrid}>
            <View style={styles.settingsGridItem}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Duration (min)</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                keyboardType="number-pad"
                value={duration}
                onChangeText={setDuration}
                placeholder="30"
                placeholderTextColor={theme.subtext}
              />
            </View>

            <View style={styles.settingsGridItem}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Pass Mark (%)</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                keyboardType="number-pad"
                value={passingPercentage}
                onChangeText={setPassingPercentage}
                placeholder="40"
                placeholderTextColor={theme.subtext}
              />
            </View>

            <View style={styles.settingsGridItem}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Attempts</Text>
              <TextInput
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                keyboardType="number-pad"
                value={attempts}
                onChangeText={setAttempts}
                placeholder="1"
                placeholderTextColor={theme.subtext}
              />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>Available From (optional ISO date)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={startAt}
            onChangeText={setStartAt}
            placeholder="e.g. 2026-12-01T09:00:00Z"
            placeholderTextColor={theme.subtext}
          />

          <Text style={[styles.fieldLabel, { color: theme.text }]}>Available Until (optional ISO date)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={endAt}
            onChangeText={setEndAt}
            placeholder="e.g. 2026-12-05T18:00:00Z"
            placeholderTextColor={theme.subtext}
          />
        </View>

        {/* Generate Button */}
        <TouchableOpacity
          style={[styles.generateBtn, { backgroundColor: theme.accent }, generating && styles.disabledBtn]}
          onPress={handleGenerate}
          disabled={generating || readyChapters.length === 0}
          activeOpacity={0.8}
        >
          {generating ? (
            <View style={styles.generatingRow}>
              <ActivityIndicator size="small" color="#ffffff" style={styles.spinner} />
              <Text style={styles.generateBtnText}>AI Generating Test from Chapters...</Text>
            </View>
          ) : (
            <View style={styles.generatingRow}>
              <Ionicons name="sparkles" size={17} color="#ffffff" style={styles.btnIcon} />
              <Text style={styles.generateBtnText}>Generate Test ({totalQuestions} Questions)</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: TOP_NAV_PADDING,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  navCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  navPlaceholder: {
    width: 36,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  loadingSpinner: {
    marginVertical: 12,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  classroomChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chapterChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  difficultyRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  difficultyBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  difficultyText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  distHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  totalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  totalBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  stepperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eeeeee",
  },
  stepperInfo: {
    flex: 1,
  },
  stepperName: {
    fontSize: 14,
    fontWeight: "600",
  },
  stepperSub: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  stepValue: {
    fontSize: 16,
    fontWeight: "700",
    minWidth: 24,
    textAlign: "center",
  },
  settingsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  settingsGridItem: {
    flex: 1,
  },
  generateBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  disabledBtn: {
    opacity: 0.65,
  },
  generatingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnIcon: {
    marginRight: 6,
  },
  spinner: {
    marginRight: 8,
  },
  generateBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
