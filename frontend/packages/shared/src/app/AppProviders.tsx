import { useEffect, type ReactNode } from "react";
import { Provider, useDispatch } from "react-redux";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "./queryClient";
import { sessionCleared, sessionSet, store, type AppDispatch, type RootState } from "./store";
import type { Session } from "../index";
import { storageGet, storageRemove, storageSet } from "../storage";

/** Keeps the Redux auth slice in sync with the app's session lifecycle. */
function AuthSync({ session }: { session: Session | null }) {
  const dispatch: AppDispatch = useDispatch();

  useEffect(() => {
    if (session) {
      dispatch(sessionSet({ token: session.token, user: session.user }));
    } else {
      dispatch(sessionCleared());
    }
  }, [session?.token, session?.user.id, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/**
 * Hydrates the auth slice from persisted storage on boot and persists
 * every subsequent session change (token/user only — answer state is NOT
 * persisted here; the FastAPI backend is the source of truth for answers).
 */
function AuthPersistence({ role }: { role: "teacher" | "student" }) {
  const dispatch: AppDispatch = useDispatch();

  useEffect(() => {
    const key = `@english_teacher/session/${role}`;
    const raw = storageGet(key);
    if (raw) {
      try {
        const s = JSON.parse(raw) as Session;
        if (s.user?.role === role && s.token) {
          dispatch(sessionSet({ token: s.token, user: s.user }));
        }
      } catch {}
    }
  }, [role, dispatch]);

  return null;
}

/** Persist session token/user whenever the store's auth slice changes. */
export function persistAuthState(state: RootState, role: "teacher" | "student") {
  const key = `@english_teacher/session/${role}`;
  const { auth } = state;
  if (auth.token && auth.user) {
    storageSet(key, JSON.stringify({ token: auth.token, user: auth.user }));
  } else {
    storageRemove(key);
  }
}

type Props = {
  children: ReactNode;
  /** current session from the app shell; syncs into Redux */
  session?: Session | null;
  role?: "teacher" | "student";
};

export default function AppProviders({ children, session = null, role }: Props) {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        {role ? <AuthPersistence role={role} /> : null}
        <AuthSync session={session} />
        {children}
      </QueryClientProvider>
    </Provider>
  );
}
