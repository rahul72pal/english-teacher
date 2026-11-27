import { useState } from "react";
import { Keyboard, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import type { Role, Session } from "./index";
import { themes } from "./theme";
import { TabBarVisibilityContext } from "./appChrome";
import ClassroomsTab from "./ClassroomsTab";
import TutorTab from "./TutorTab";
import ProfileTab from "./ProfileTab";
import ProgressTab from "./ProgressTab";
import TeacherResultsTab from "./TeacherResultsTab";
import TestsTab from "./tests/TestsTab";
import StudentTestsTab from "./tests/StudentTestsTab";

interface TabsShellProps {
  role: Role;
  session: Session;
  onLogout: () => void;
}

type TabKey = "classrooms" | "tests" | "results" | "tutor" | "progress" | "profile";

interface TabItem {
  key: TabKey;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
}

export default function TabsShell({ role, session, onLogout }: TabsShellProps) {
  const theme = themes[role];
  const [active, setActive] = useState<TabKey>("classrooms");
  const [testsClassroomId, setTestsClassroomId] = useState<string | null>(null);
  const [tabBarHidden, setTabBarHidden] = useState(false);

  const tabs: TabItem[] =
    role === "teacher"
      ? [
          {
            key: "classrooms",
            label: "Classrooms",
            activeIcon: "school",
            inactiveIcon: "school-outline",
          },
          {
            key: "tests",
            label: "Tests",
            activeIcon: "document-text",
            inactiveIcon: "document-text-outline",
          },
          {
            key: "results",
            label: "Results",
            activeIcon: "clipboard",
            inactiveIcon: "clipboard-outline",
          },
          {
            key: "tutor",
            label: "AI Tutor",
            activeIcon: "chatbubble-ellipses",
            inactiveIcon: "chatbubble-ellipses-outline",
          },
          {
            key: "profile",
            label: "Profile",
            activeIcon: "person",
            inactiveIcon: "person-outline",
          },
        ]
      : [
          {
            key: "classrooms",
            label: "My Classes",
            activeIcon: "school",
            inactiveIcon: "school-outline",
          },
          {
            key: "tests",
            label: "Tests",
            activeIcon: "document-text",
            inactiveIcon: "document-text-outline",
          },
          {
            key: "tutor",
            label: "AI Tutor",
            activeIcon: "chatbubble-ellipses",
            inactiveIcon: "chatbubble-ellipses-outline",
          },
          {
            key: "progress",
            label: "Progress",
            activeIcon: "stats-chart",
            inactiveIcon: "stats-chart-outline",
          },
          {
            key: "profile",
            label: "Profile",
            activeIcon: "person",
            inactiveIcon: "person-outline",
          },
        ];

  const handleNavigateToTests = (classroomId?: string) => {
    setTestsClassroomId(classroomId ?? null);
    setActive("tests");
  };

  const screens: Record<TabKey, React.ReactNode> = {
    classrooms: (
      <ClassroomsTab
        role={role}
        session={session}
        onNavigateToTests={handleNavigateToTests}
      />
    ),
    tests:
      role === "teacher" ? (
        <TestsTab
          session={session}
          initialClassroomId={testsClassroomId}
          key={`tests-${testsClassroomId ?? "all"}`}
        />
      ) : (
        <StudentTestsTab
          session={session}
          initialClassroomId={testsClassroomId}
          key={`student-tests-${testsClassroomId ?? "all"}`}
        />
      ),
    results: role === "teacher" ? <TeacherResultsTab session={session} /> : null,
    tutor: <TutorTab role={role} session={session} />,
    progress: role === "student" ? <ProgressTab session={session} /> : null,
    profile: <ProfileTab role={role} session={session} onLogout={onLogout} />,
  };

  return (
    <TabBarVisibilityContext.Provider value={setTabBarHidden}>
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.screen}>{screens[active]}</View>

        {/* bottom tab bar */}
        {tabBarHidden ? null : (
          <View style={[styles.tabBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            {tabs.map((tab) => {
              const isActive = active === tab.key;
              const iconName = isActive ? tab.activeIcon : tab.inactiveIcon;
              const color = isActive ? theme.accent : theme.subtext;

              return (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.tab}
                  onPress={() => {
                    Keyboard.dismiss();
                    if (tab.key === "tests") {
                      setTestsClassroomId(null);
                    }
                    setTabBarHidden(false);
                    setActive(tab.key);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={iconName} size={22} color={color} />
                  <Text
                    style={[
                      styles.tabLabel,
                      {
                        color,
                        fontWeight: isActive ? "700" : "500",
                      },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </TabBarVisibilityContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingBottom: 24,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 3,
    letterSpacing: 0.1,
  },
});
