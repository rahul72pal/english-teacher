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
  type EditQuestionPayload,
  type TestQuestion,
} from "../index";
import { themes } from "../theme";

interface EditQuestionModalProps {
  visible: boolean;
  testId: string;
  token: string;
  question: TestQuestion | null;
  onClose: () => void;
  onSaved: (updatedQuestion: TestQuestion) => void;
}

export default function EditQuestionModal({
  visible,
  testId,
  token,
  question,
  onClose,
  onSaved,
}: EditQuestionModalProps) {
  const theme = themes.teacher;

  if (!question) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <EditQuestionModalContent
        testId={testId}
        token={token}
        question={question}
        theme={theme}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Modal>
  );
}

interface ContentProps {
  testId: string;
  token: string;
  question: TestQuestion;
  theme: typeof themes.teacher;
  onClose: () => void;
  onSaved: (updatedQuestion: TestQuestion) => void;
}

function EditQuestionModalContent({
  testId,
  token,
  question,
  theme,
  onClose,
  onSaved,
}: ContentProps) {
  const [questionText, setQuestionText] = useState(question.question);
  const [marks, setMarks] = useState(String(question.marks));
  const [options, setOptions] = useState<string[]>(
    question.options ? [...question.options] : ["", "", "", ""]
  );
  const [selectedCorrect, setSelectedCorrect] = useState<string | boolean | null>(
    question.correct_answer
  );
  const [saving, setSaving] = useState(false);

  const handleOptionChange = (text: string, index: number) => {
    const updatedOptions = [...options];
    const oldOptionValue = updatedOptions[index];
    updatedOptions[index] = text;
    setOptions(updatedOptions);

    if (selectedCorrect === oldOptionValue) {
      setSelectedCorrect(text);
    }
  };

  const handleSave = async () => {
    const trimmedQuestion = questionText.trim();
    if (trimmedQuestion.length < 5) {
      Alert.alert("Validation", "Question text must be at least 5 characters.");
      return;
    }

    const parsedMarks = parseInt(marks, 10);
    if (isNaN(parsedMarks) || parsedMarks < 1 || parsedMarks > 20) {
      Alert.alert("Validation", "Marks must be an integer between 1 and 20.");
      return;
    }

    const payload: EditQuestionPayload = {
      question: trimmedQuestion,
      marks: parsedMarks,
    };

    if (question.type === "mcq") {
      const cleanedOptions = options.map((opt) => opt.trim()).filter((opt) => opt.length > 0);
      if (cleanedOptions.length < 2) {
        Alert.alert("Validation", "MCQ requires at least 2 non-empty options.");
        return;
      }
      if (!selectedCorrect || !cleanedOptions.includes(String(selectedCorrect))) {
        Alert.alert("Validation", "Please select one of the valid options as the correct answer.");
        return;
      }
      payload.options = cleanedOptions;
      payload.correct_answer = String(selectedCorrect);
    } else if (question.type === "true_false") {
      if (selectedCorrect !== true && selectedCorrect !== false) {
        Alert.alert("Validation", "Please select either True or False as the correct answer.");
        return;
      }
      payload.correct_answer = selectedCorrect;
    }

    setSaving(true);
    try {
      const response = await api.editTestQuestion(token, testId, question.id, payload);
      onSaved(response.question);
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      Alert.alert("Save Failed", errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.backdrop}>
      <View style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            Edit Question ({question.question_id})
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={theme.subtext} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={[styles.label, { color: theme.text }]}>Question Text</Text>
          <TextInput
            style={[styles.textArea, { color: theme.text, borderColor: theme.border }]}
            multiline
            numberOfLines={4}
            value={questionText}
            onChangeText={setQuestionText}
            placeholder="Enter question text..."
            placeholderTextColor={theme.subtext}
          />

          <Text style={[styles.label, { color: theme.text }]}>Marks (1-20)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            keyboardType="number-pad"
            value={marks}
            onChangeText={setMarks}
            placeholder="Marks"
            placeholderTextColor={theme.subtext}
          />

          {question.type === "mcq" && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.text }]}>
                Options (tap radio to select correct answer)
              </Text>
              {options.map((option, index) => {
                const isCorrect = selectedCorrect === option && option.trim().length > 0;
                return (
                  <View key={`opt-${index}`} style={styles.optionRow}>
                    <TouchableOpacity
                      style={[
                        styles.radio,
                        { borderColor: isCorrect ? "#15803d" : theme.border },
                        isCorrect && { backgroundColor: "#15803d" },
                      ]}
                      onPress={() => setSelectedCorrect(option)}
                      activeOpacity={0.7}
                    >
                      {isCorrect && (
                        <Ionicons name="checkmark" size={13} color="#ffffff" />
                      )}
                    </TouchableOpacity>
                    <TextInput
                      style={[
                        styles.optionInput,
                        { color: theme.text, borderColor: theme.border },
                        isCorrect && { borderColor: "#15803d" },
                      ]}
                      value={option}
                      onChangeText={(txt) => handleOptionChange(txt, index)}
                      placeholder={`Option ${index + 1}`}
                      placeholderTextColor={theme.subtext}
                    />
                  </View>
                );
              })}
            </View>
          )}

          {question.type === "true_false" && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.text }]}>Correct Answer</Text>
              <View style={styles.choiceRow}>
                <TouchableOpacity
                  style={[
                    styles.choiceBtn,
                    { borderColor: theme.border },
                    selectedCorrect === true && {
                      backgroundColor: theme.accent,
                      borderColor: theme.accent,
                    },
                  ]}
                  onPress={() => setSelectedCorrect(true)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      { color: selectedCorrect === true ? "#ffffff" : theme.text },
                    ]}
                  >
                    True
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.choiceBtn,
                    { borderColor: theme.border },
                    selectedCorrect === false && {
                      backgroundColor: theme.accent,
                      borderColor: theme.accent,
                    },
                  ]}
                  onPress={() => setSelectedCorrect(false)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      { color: selectedCorrect === false ? "#ffffff" : theme.text },
                    ]}
                  >
                    False
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
                <Text style={styles.saveText}>Save Changes</Text>
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
    maxWidth: 520,
    maxHeight: "88%",
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
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  section: {
    marginTop: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 12,
  },
  choiceBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  choiceText: {
    fontSize: 15,
    fontWeight: "600",
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
