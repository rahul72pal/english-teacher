import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AuthUser } from "../index";

// ---------- auth (Redux Toolkit: session/token, persisted via shared storage) ----------

const authSlice = createSlice({
  name: "auth",
  initialState: { token: null as string | null, user: null as AuthUser | null },
  reducers: {
    sessionSet: (state, action: PayloadAction<{ token: string; user: AuthUser }>) => {
      state.token = action.payload.token;
      state.user = action.payload.user;
    },
    sessionCleared: (state) => {
      state.token = null;
      state.user = null;
    },
  },
});
export const { sessionSet, sessionCleared } = authSlice.actions;

// ---------- classroom (client state: currently selected classroom) ----------

const classroomSlice = createSlice({
  name: "classroom",
  initialState: { selectedClassroomId: null as string | null },
  reducers: {
    classroomSelected: (state, action: PayloadAction<string | null>) => {
      state.selectedClassroomId = action.payload;
    },
  },
});
export const { classroomSelected } = classroomSlice.actions;

// ---------- test attempt (active exam: answers, navigation, review marks) ----------

export interface TestAttemptState {
  attemptId: string | null;
  testTitle: string;
  currentQuestionIndex: number;
  // question_id -> { answer, saved }
  answers: Record<string, { answer: string | boolean | null; saved: "saved" | "saving" | "dirty" | "none" }>;
  markedForReview: string[];
  expiresAt: string | null;
  isSubmitted: boolean;
}

const initialState: TestAttemptState = {
  attemptId: null,
  testTitle: "",
  currentQuestionIndex: 0,
  answers: {},
  markedForReview: [],
  expiresAt: null,
  isSubmitted: false,
};

const testAttemptSlice = createSlice({
  name: "testAttempt",
  initialState,
  reducers: {
    startAttempt: (
      state,
      action: PayloadAction<{ attemptId: string; expiresAt: string | null; testTitle?: string; answers?: TestAttemptState["answers"] }>,
    ) => {
      state.attemptId = action.payload.attemptId;
      state.expiresAt = action.payload.expiresAt;
      state.testTitle = action.payload.testTitle ?? "";
      state.answers = action.payload.answers ?? {};
      state.currentQuestionIndex = 0;
      state.markedForReview = [];
      state.isSubmitted = false;
    },
    saveAnswer: (state, action: PayloadAction<{ questionId: string; answer: string | boolean | null; saved: TestAttemptState["answers"][string]["saved"] }>) => {
      const { questionId, answer, saved } = action.payload;
      state.answers[questionId] = { answer, saved };
    },
    setCurrentQuestion: (state, action: PayloadAction<number>) => {
      state.currentQuestionIndex = action.payload;
    },
    toggleReview: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      const i = state.markedForReview.indexOf(id);
      if (i >= 0) state.markedForReview.splice(i, 1);
      else state.markedForReview.push(id);
    },
    submitAttempt: (state) => {
      state.isSubmitted = true;
    },
    clearAttempt: () => initialState,
  },
});
export const {
  startAttempt,
  saveAnswer,
  setCurrentQuestion,
  toggleReview,
  submitAttempt,
  clearAttempt,
} = testAttemptSlice.actions;

// ---------- store ----------

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    classroom: classroomSlice.reducer,
    testAttempt: testAttemptSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
