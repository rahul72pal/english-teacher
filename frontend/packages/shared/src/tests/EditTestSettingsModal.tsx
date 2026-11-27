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
  type TestItem,
  type UpdateTestPayload,
} from "../index";
import { themes } from "../theme";

interface EditTestSettingsModalProps {
  visible: boolean;
  token: string;
  test: TestItem | null;
  onClose: () => void;
  onUpdated: (updatedTest: TestItem) => void;
}

export default function EditTestSettingsModal({
  visible,
  token,
  test,
  onClose,
  onUpdated,
}: EditTestSettingsModalProps) {
  const theme = themes.teacher;

  if (!test) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <EditTestSettingsModalContent
        token={token}
        test={test}
        theme={theme}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </Modal>
  );
}

interface ContentProps {
  token: string;
  test: TestItem;
  theme: typeof themes.teacher;
  onClose: () => void;
  onUpdated: (updatedTest: TestItem) => void;
}

function EditTestSettingsModalContent({
  token,
  test,
  theme,
  onClose,
  onUpdated,
}: ContentProps) {
  const [title, setTitle] = useState(test.title);
  const [duration, setDuration] = useState(String(test.duration_minutes));
  const [passingPercentage, setPassingPercentage] = useState(String(test.passing_percentage));
  const [attempts, setAttempts] = useState(String(test.attempts_allowed));
  const [startAt, setStartAt] = useState(test.start_at ?? "");
  const [endAt, setEndAt] = useState(test.end_at ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2 || trimmedTitle.length > 150) {
      Alert.alert("Validation", "Title must be between 2 and 150 characters.");
      return;
    }

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

    const payload: UpdateTestPayload = {
      title: trimmedTitle,
      duration_minutes: parsedDuration,
      passing_percentage: parsedPassing,
      attempts_allowed: parsedAttempts,
      start_at: startAt.trim().length > 0 ? startAt.trim() : null,
      end_at: endAt.trim().length > 0 ? endAt.trim() : null,
    };

    setSaving(true);
    try {
      const response = await api.updateTeacherTest(token, test.id, payload);
      onUpdated(response.test);
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      Alert.alert("Update Failed", errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.backdrop}>
      <View style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Edit Test Settings</Text>
          <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={theme.subtext} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={[styles.label, { color: theme.text }]}>Test Title</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Test title..."
            placeholderTextColor={theme.subtext}
          />

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

          <Text style={[styles.label, { color: theme.text }]}>Start At (optional)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={startAt}
            onChangeText={setStartAt}
            placeholder="YYYY-MM-DDTHH:MM:SSZ"
            placeholderTextColor={theme.subtext}
          />

          <Text style={[styles.label, { color: theme.text }]}>End At (optional)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={endAt}
            onChangeText={setEndAt}
            placeholder="YYYY-MM-DDTHH:MM:SSZ"
            placeholderTextColor={theme.subtext}
          />
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
            <Text style={[styles.cancelText, { color: theme.subtext }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.accent }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={styles.saveBtnContent}>
                <Ionicons name="checkmark" size={16} color="#ffffff" style={styles.saveIcon} />
                <Text style={styles.saveText}>Save Settings</Text>
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
  saveBtn: {
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 130,
    alignItems: "center",
  },
  saveBtnContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  saveIcon: {
    marginRight: 5,
  },
  saveText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
