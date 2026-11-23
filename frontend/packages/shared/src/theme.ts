import type { Role } from "./index";

export type Theme = {
  bg: string;
  surface: string;
  text: string;
  subtext: string;
  accent: string;
  accentSoft: string;
  border: string;
  danger: string;
  emoji: string;
};

export const themes: Record<Role, Theme> = {
  student: {
    bg: "#f4f7fb",
    surface: "#ffffff",
    text: "#1c3d5a",
    subtext: "#5a7a94",
    accent: "#2a6db5",
    accentSoft: "#e3eefb",
    border: "#dfe8f2",
    danger: "#b3261e",
    emoji: "🎓",
  },
  teacher: {
    bg: "#fbf6ef",
    surface: "#ffffff",
    text: "#5a3d1c",
    subtext: "#94785a",
    accent: "#b57b2a",
    accentSoft: "#f6ecdd",
    border: "#f0e4d3",
    danger: "#b3261e",
    emoji: "👩‍🏫",
  },
};
