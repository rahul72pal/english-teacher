import { useState } from "react";
import { Keyboard, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { Role, Session } from "./index";
import { themes } from "./theme";
import ClassroomsTab from "./ClassroomsTab";
import TutorTab from "./TutorTab";
import ProfileTab from "./ProfileTab";

type Props = {
  role: Role;
  session: Session;
  onLogout: () => void;
};

export default function TabsShell({ role, session, onLogout }: Props) {
  const theme = themes[role];
  const [active, setActive] = useState("classrooms");

  const tabs =
    role === "teacher"
      ? [
          { key: "classrooms", label: "Classrooms", icon: "🏫" },
          { key: "tutor", label: "AI Tutor", icon: "🤖" },
          { key: "profile", label: "Profile", icon: "👤" },
        ]
      : [
          { key: "classrooms", label: "My Classes", icon: "🏫" },
          { key: "tutor", label: "AI Tutor", icon: "🤖" },
          { key: "profile", label: "Profile", icon: "👤" },
        ];

  const screens: Record<string, React.ReactNode> = {
    classrooms: <ClassroomsTab role={role} session={session} />,
    tutor: <TutorTab role={role} session={session} />,
    profile: <ProfileTab role={role} session={session} onLogout={onLogout} />,
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.screen}>{screens[active]}</View>

      {/* bottom tab bar */}
      <View style={[styles.tabBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => {
                Keyboard.dismiss();
                setActive(tab.key);
              }}
            >
              <Text style={[styles.tabIcon, { opacity: isActive ? 1 : 0.55 }]}>{tab.icon}</Text>
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? theme.accent : theme.subtext, fontWeight: isActive ? "700" : "400" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
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
  tab: { flex: 1, alignItems: "center" },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 11, marginTop: 2 },
});
