import { useState } from "react";
import {
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

import { studentTestsApi, type Session, type StudentTest } from "../index";
import { themes } from "../theme";

type Props = {
  session: Session;
  test: StudentTest;
  onBack: () => void;
  onStarted: (attemptId: string) => void;
};

const TOP_HEADER_PADDING =
  Platform.OS === "ios"
    ? 56
    : StatusBar.currentHeight
    ? StatusBar.currentHeight + 12
    : 44;

export default function TestInstructionsScreen({ session, test, onBack, onStarted }: Props) {
  const theme = themes.student;
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try {
      const attempt = await studentTestsApi.startAttempt(session.token, test.id);
      if (attempt.resumed) {
        Alert.alert("Resumed", "Picking up where you left off — the timer never stopped.");
      }
      onStarted(attempt.id);
    } catch (e) {
      Alert.alert("Could not start", e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const info: [string, string, keyof typeof Ionicons.glyphMap][] = [
    ["Total questions", String(test.total_questions), "help-circle-outline"],
    ["Total marks", String(test.total_marks), "medal-outline"],
    ["Duration", `${test.duration_minutes} minutes`, "time-outline"],
    ["Difficulty", test.difficulty.toUpperCase(), "speedometer-outline"],
    ["Passing mark", `${test.passing_percentage}%`, "shield-checkmark-outline"],
    ["Attempts allowed", String(test.attempts_allowed), "refresh-outline"],
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: TOP_HEADER_PADDING, paddingBottom: 40 }}
    >
      <TouchableOpacity onPress={onBack} style={styles.backBtnRow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={20} color={theme.accent} />
        <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 16 }}>Back</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: theme.text }]}>{test.title}</Text>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {info.map(([label, value, icon]) => (
          <View key={label} style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name={icon} size={16} color={theme.subtext} style={{ marginRight: 8 }} />
              <Text style={{ color: theme.subtext, fontSize: 13 }}>{label}</Text>
            </View>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.instructionHeaderRow}>
          <Ionicons name="information-circle-outline" size={18} color={theme.accent} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}>Test Instructions</Text>
        </View>
        {[
          "Read each question carefully before answering.",
          "Select one option for MCQ questions.",
          "Answer True/False questions by tapping True or False.",
          "Write your answer clearly for descriptive questions.",
          "You can navigate between questions and mark them for review.",
          "Answers autosave continuously — review before submitting.",
          "Submit before the timer expires. The server clock decides the deadline.",
        ].map((line, i) => (
          <View key={i} style={styles.instructionItem}>
            <Text style={{ color: theme.accent, fontWeight: "700", width: 20 }}>{i + 1}.</Text>
            <Text style={{ color: theme.subtext, fontSize: 13, flex: 1, lineHeight: 18 }}>
              {line}
            </Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.accent, opacity: starting ? 0.6 : 1 }]}
        onPress={start}
        disabled={starting}
      >
        <Text style={styles.buttonText}>{starting ? "Starting…" : "Start Test Now"}</Text>
        <Ionicons name="arrow-forward" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backBtnRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3, marginBottom: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  infoLeft: { flexDirection: "row", alignItems: "center" },
  instructionHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  instructionItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  button: {
    flexDirection: "row",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
