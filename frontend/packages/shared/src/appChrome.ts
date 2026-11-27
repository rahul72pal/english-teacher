import { createContext, useContext } from "react";

/**
 * Lets a screen ask the app shell to hide its bottom tab bar, e.g. while a
 * document is being read in full-screen mode.
 *
 * The default is a no-op so screens remain usable outside the tab shell.
 */
export const TabBarVisibilityContext = createContext<(hidden: boolean) => void>(
  () => {},
);

export function useTabBarVisibility(): (hidden: boolean) => void {
  return useContext(TabBarVisibilityContext);
}
