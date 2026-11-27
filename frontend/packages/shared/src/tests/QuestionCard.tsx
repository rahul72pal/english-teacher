import React from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  type TestQuestion,
  type TestStatus,
} from "../index";
import { themes } from "../theme";

interface QuestionCardProps {
  question: TestQuestion;
  index: number;
  testStatus: TestStatus;
  isBusy: boolean;
  onApprove: (questionId: string) => void;
  onRegenerate: (questionId: string) => void;
  onEdit: (question: TestQuestion) => void;
  onDelete: (questionId: string) => void;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  mcq: { label: "Multiple Choice", icon: "list" },
  true_false: { label: "True / False", icon: "swap-horizontal" },
  descriptive: { label: "Descriptive", icon: "document-text" },
};

export default function QuestionCard({
  question,
  index,
  testStatus,
  isBusy,
  onApprove,
  onRegenerate,
  onEdit,
  onDelete,
}: QuestionCardProps) {
  const theme = themes.teacher;
  const isDraft = testStatus === "draft";
  const typeInfo = TYPE_CONFIG[question.type] ?? {
    label: question.type,
    icon: "help-circle-outline",
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete Question",
      `Are you sure you want to delete Question ${index + 1}? Test totals will be recalculated.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(question.id),
        },
      ]
    );
  };

  const confirmRegenerate = () => {
    Alert.alert(
      "Regenerate Question",
      "Do you want to regenerate this question with AI using chapter source materials?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Regenerate",
          onPress: () => onRegenerate(question.id),
        },
      ]
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Header Badges */}
      <View style={styles.cardHeader}>
        <View style={styles.badgeRow}>
          <View style={[styles.typeBadge, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name={typeInfo.icon} size={13} color={theme.accent} style={styles.badgeIcon} />
            <Text style={[styles.typeBadgeText, { color: theme.accent }]}>
              {typeInfo.label}
            </Text>
          </View>

          <View style={styles.marksBadge}>
            <Text style={styles.marksBadgeText}>
              {question.marks} {question.marks === 1 ? "mark" : "marks"}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              question.approved ? styles.statusApproved : styles.statusPending,
            ]}
          >
            <Ionicons
              name={question.approved ? "checkmark-circle" : "time-outline"}
              size={12}
              color={question.approved ? "#15803d" : "#b45309"}
              style={styles.badgeIcon}
            />
            <Text
              style={[
                styles.statusBadgeText,
                question.approved ? styles.statusTextApproved : styles.statusTextPending,
              ]}
            >
              {question.approved ? "Approved" : "Review Required"}
            </Text>
          </View>
        </View>

        <Text style={[styles.qIndex, { color: theme.subtext }]}>#{index + 1}</Text>
      </View>

      {/* Question Statement */}
      <Text style={[styles.questionText, { color: theme.text }]}>{question.question}</Text>

      {/* Multiple Choice Options */}
      {question.type === "mcq" && question.options && (
        <View style={styles.optionsContainer}>
          {question.options.map((option, optIdx) => {
            const isCorrect = String(question.correct_answer) === option;
            return (
              <View
                key={`opt-${optIdx}`}
                style={[
                  styles.optionItem,
                  { borderColor: theme.border },
                  isCorrect && styles.optionItemCorrect,
                ]}
              >
                <View
                  style={[
                    styles.radioIndicator,
                    { borderColor: isCorrect ? "#15803d" : theme.border },
                    isCorrect && styles.radioIndicatorCorrect,
                  ]}
                >
                  {isCorrect && (
                    <Ionicons name="checkmark" size={11} color="#ffffff" />
                  )}
                </View>
                <Text
                  style={[
                    styles.optionText,
                    { color: theme.text },
                    isCorrect && styles.optionTextCorrect,
                  ]}
                >
                  {option}
                </Text>
                {isCorrect && (
                  <View style={styles.correctPill}>
                    <Text style={styles.correctPillText}>Correct Answer</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* True / False Options */}
      {question.type === "true_false" && (
        <View style={styles.tfContainer}>
          <View
            style={[
              styles.tfPill,
              { borderColor: theme.border },
              question.correct_answer === true && styles.tfPillCorrect,
            ]}
          >
            <Ionicons
              name={question.correct_answer === true ? "checkmark-circle" : "ellipse-outline"}
              size={16}
              color={question.correct_answer === true ? "#15803d" : theme.subtext}
              style={styles.tfIcon}
            />
            <Text
              style={[
                styles.tfText,
                { color: theme.text },
                question.correct_answer === true && styles.tfTextCorrect,
              ]}
            >
              True {question.correct_answer === true ? "(Correct)" : ""}
            </Text>
          </View>

          <View
            style={[
              styles.tfPill,
              { borderColor: theme.border },
              question.correct_answer === false && styles.tfPillCorrect,
            ]}
          >
            <Ionicons
              name={question.correct_answer === false ? "checkmark-circle" : "ellipse-outline"}
              size={16}
              color={question.correct_answer === false ? "#15803d" : theme.subtext}
              style={styles.tfIcon}
            />
            <Text
              style={[
                styles.tfText,
                { color: theme.text },
                question.correct_answer === false && styles.tfTextCorrect,
              ]}
            >
              False {question.correct_answer === false ? "(Correct)" : ""}
            </Text>
          </View>
        </View>
      )}

      {/* Descriptive Rubric & Model Answer */}
      {question.type === "descriptive" && (
        <View style={styles.descriptiveContainer}>
          {question.expected_answer && (
            <View style={[styles.rubricBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <View style={styles.rubricHeaderRow}>
                <Ionicons name="bulb-outline" size={14} color={theme.accent} />
                <Text style={[styles.rubricHeader, { color: theme.accent }]}>Model Answer / Key Points</Text>
              </View>
              <Text style={[styles.rubricBody, { color: theme.text }]}>{question.expected_answer}</Text>
            </View>
          )}

          {question.evaluation_rubric && question.evaluation_rubric.length > 0 && (
            <View style={[styles.rubricBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <View style={styles.rubricHeaderRow}>
                <Ionicons name="clipboard-outline" size={14} color={theme.accent} />
                <Text style={[styles.rubricHeader, { color: theme.accent }]}>Evaluation Criteria</Text>
              </View>
              {question.evaluation_rubric.map((item, rubIdx) => (
                <View key={`rubric-${rubIdx}`} style={styles.rubricRow}>
                  <Text style={[styles.rubricCrit, { color: theme.text }]}>
                    • {item.criterion ?? JSON.stringify(item)}
                  </Text>
                  {typeof item.marks === "number" && (
                    <Text style={[styles.rubricMarks, { color: theme.accent }]}>
                      {item.marks} {item.marks === 1 ? "pt" : "pts"}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Action Footer (for drafts) */}
      {isDraft && (
        <View style={[styles.cardActions, { borderTopColor: theme.border }]}>
          {isBusy ? (
            <ActivityIndicator size="small" color={theme.accent} style={styles.spinner} />
          ) : (
            <>
              {!question.approved && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.approveBtn]}
                  onPress={() => onApprove(question.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={15} color="#ffffff" style={styles.btnIcon} />
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionBtn, styles.secondaryBtn, { borderColor: theme.border }]}
                onPress={() => onEdit(question)}
                activeOpacity={0.8}
              >
                <Ionicons name="create-outline" size={14} color={theme.text} style={styles.btnIcon} />
                <Text style={[styles.actionBtnText, { color: theme.text }]}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.secondaryBtn, { borderColor: theme.border }]}
                onPress={confirmRegenerate}
                activeOpacity={0.8}
              >
                <Ionicons name="sparkles-outline" size={14} color={theme.accent} style={styles.btnIcon} />
                <Text style={[styles.actionBtnText, { color: theme.accent }]}>AI Retry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={confirmDelete}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color="#dc2626" />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeIcon: {
    marginRight: 4,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  marksBadge: {
    backgroundColor: "#f4f4f5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  marksBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#52525b",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusApproved: {
    backgroundColor: "#dcfce7",
  },
  statusPending: {
    backgroundColor: "#fef3c7",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  statusTextApproved: {
    color: "#15803d",
  },
  statusTextPending: {
    color: "#b45309",
  },
  qIndex: {
    fontSize: 13,
    fontWeight: "700",
  },
  questionText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
    letterSpacing: -0.1,
    marginBottom: 12,
  },
  optionsContainer: {
    gap: 8,
    marginBottom: 8,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fafafa",
  },
  optionItemCorrect: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
  },
  radioIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  radioIndicatorCorrect: {
    backgroundColor: "#15803d",
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  optionTextCorrect: {
    fontWeight: "600",
    color: "#166534",
  },
  correctPill: {
    backgroundColor: "#15803d",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  correctPillText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  tfContainer: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  tfPill: {
    flex: 1,
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
  },
  tfIcon: {
    marginRight: 6,
  },
  tfPillCorrect: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4",
  },
  tfText: {
    fontSize: 14,
    fontWeight: "600",
  },
  tfTextCorrect: {
    color: "#15803d",
  },
  descriptiveContainer: {
    gap: 8,
    marginBottom: 8,
  },
  rubricBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 11,
  },
  rubricHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  rubricHeader: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  rubricBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  rubricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  rubricCrit: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  rubricMarks: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 8,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 8,
    gap: 8,
  },
  spinner: {
    paddingVertical: 6,
  },
  actionBtn: {
    flexDirection: "row",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  btnIcon: {
    marginRight: 4,
  },
  approveBtn: {
    backgroundColor: "#15803d",
  },
  approveBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryBtn: {
    borderWidth: 1,
    backgroundColor: "#ffffff",
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
  },
});
