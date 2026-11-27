import { useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";

import {
  api,
  type PublishTestPayload,
  type TestItem,
} from "../index";
import { themes } from "../theme";

interface PublishTestModalProps {
  visible: boolean;
  token: string;
  test: TestItem | null;
  unapprovedCount: number;
  onClose: () => void;
  onPublished: (updatedTest: TestItem) => void;
}

export default function PublishTestModal({
  visible,
  token,
  test,
  unapprovedCount,
  onClose,
  onPublished,
}: PublishTestModalProps) {
  const theme = themes.teacher;

  if (!test) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <PublishTestModalContent
        token={token}
        test={test}
        unapprovedCount={unapprovedCount}
        theme={theme}
        onClose={onClose}
        onPublished={onPublished}
      />
    </Modal>
  );
}

interface ContentProps {
  token: string;
  test: TestItem;
  unapprovedCount: number;
  theme: typeof themes.teacher;
  onClose: () => void;
  onPublished: (updatedTest: TestItem) => void;
}

function PublishTestModalContent({
  token,
  test,
  unapprovedCount,
  theme,
  onClose,
  onPublished,
}: ContentProps) {
  const [duration, setDuration] = useState(String(test.duration_minutes));
  const [passingPercentage, setPassingPercentage] = useState(String(test.passing_percentage));
  const [attempts, setAttempts] = useState(String(test.attempts_allowed));
  const [startAt, setStartAt] = useState(test.start_at ?? "");
  const [endAt, setEndAt] = useState(test.end_at ?? "");
  const [publishing, setPublishing] = useState(false);

  const handlePublish = async () => {
    const parsedDuration = parseInt(duration, 10);
    if (isNaN(parsedDuration) || parsedDuration < 1 || parsedDuration > 300) {
      Alert.alert("Validation", "Duration must be between 1 and 300 minutes.");
      return;
    }

    const parsedPassing = parseInt(passingPercentage, 10);
    if (isNaN(parsedPassing) || parsedPassing < 1 || parsedPassing > 100) {
      Alert.alert("Validation", "Passing score must be between 1% and 100%.");
      return;
    }

    const parsedAttempts = parseInt(attempts, 10);
    if (isNaN(parsedAttempts) || parsedAttempts < 1 || parsedAttempts > 5) {
      Alert.alert("Validation", "Attempts allowed must be between 1 and 5.");
      return;
    }

    const payload: PublishTestPayload = {
      duration_minutes: parsedDuration,
      passing_percentage: parsedPassing,
      attempts_allowed: parsedAttempts,
      start_at: startAt.trim().length > 0 ? startAt.trim() : null,
      end_at: endAt.trim().length > 0 ? endAt.trim() : null,
    };

    setPublishing(true);
    try {
      const response = await api.publishTeacherTest(token, test.id, payload);
      Alert.alert("Published", response.message);
      onPublished(response.test);
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      Alert.alert("Publish Failed", errorMessage);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View style={styles.backdrop}>
      <View style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Publish Assessment</Text>
          <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={theme.subtext} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={[styles.testTitle, { color: theme.text }]}>{test.title}</Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            {test.total_questions} Questions · {test.total_marks} Total Marks
          </Text>

          {unapprovedCount > 0 && (
            <View style={[styles.warningBox, { backgroundColor: "#fffbeb", borderColor: "#fde68a" }]}>
              <Ionicons name="alert-circle-outline" size={17} color="#b45309" style={styles.warningIcon} />
              <Text style={styles.warningText}>
                You have {unapprovedCount} unapproved question(s). Publishing will automatically
                approve all remaining questions.
              </Text>
            </View>
          )}

          <Text style={[styles.label, { color: theme.text }]}>Duration (minutes)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            keyboardType="number-pad"
            value={duration}
            onChangeText={setDuration}
            placeholder="e.g. 30"
            placeholderTextColor={theme.subtext}
          />

          <Text style={[styles.label, { color: theme.text }]}>Passing Percentage (%)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            keyboardType="number-pad"
            value={passingPercentage}
            onChangeText={setPassingPercentage}
            placeholder="e.g. 40"
            placeholderTextColor={theme.subtext}
          />

          <Text style={[styles.label, { color: theme.text }]}>Attempts Allowed (1-5)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            keyboardType="number-pad"
            value={attempts}
            onChangeText={setAttempts}
            placeholder="e.g. 1"
            placeholderTextColor={theme.subtext}
          />

          <Text style={[styles.label, { color: theme.text }]}>Available From (optional ISO date)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={startAt}
            onChangeText={setStartAt}
            placeholder="YYYY-MM-DDTHH:MM:SSZ"
            placeholderTextColor={theme.subtext}
          />

          <Text style={[styles.label, { color: theme.text }]}>Available Until (optional ISO date)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={endAt}
            onChangeText={setEndAt}
            placeholder="YYYY-MM-DDTHH:MM:SSZ"
            placeholderTextColor={theme.subtext}
          />
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={publishing}>
            <Text style={[styles.cancelText, { color: theme.subtext }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.publishBtn, { backgroundColor: "#15803d" }]}
            onPress={handlePublish}
            disabled={publishing}
            activeOpacity={0.8}
          >
            {publishing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={styles.publishBtnContent}>
                <Ionicons name="rocket-outline" size={16} color="#ffffff" style={styles.publishIcon} />
                <Text style={styles.publishText}>Publish Now</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  dialog: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "85%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  body: {
    flexGrow: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  testTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  warningIcon: {
    marginTop: 1,
  },
  warningText: {
    flex: 1,
    color: "#b45309",
    fontSize: 12,
    lineHeight: 17,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  publishBtn: {
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 140,
    alignItems: "center",
  },
  publishBtnContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  publishIcon: {
    marginRight: 6,
  },
  publishText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
