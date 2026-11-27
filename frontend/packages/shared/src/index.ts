import { Platform } from "react-native";

// Shared types between the student and teacher apps, mirroring the FastAPI backend.

export interface Student {
  id: number;
  name: string;
  email: string;
  level: string;
  created_at: string;
}

export interface Teacher {
  id: number;
  name: string;
  email: string;
  specialty: string;
  created_at: string;
}

export interface Lesson {
  id: number;
  title: string;
  lesson_date: string | null;
  completed: boolean;
  student_id: number;
  teacher_id: number;
  created_at: string;
}

export type Role = "teacher" | "student";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
}

export interface AuthResult {
  success: boolean;
  access_token: string;
  refresh_token?: string;
  token_type: string;
  user: AuthUser;
}

export interface RefreshTokenResponse {
  success: boolean;
  access_token: string;
  refresh_token?: string;
  token_type: string;
  user?: AuthUser;
}

export interface ClassroomTeacherView {
  id: string;
  name: string;
  description: string;
  join_code: string;
  is_active: boolean;
  student_count: number;
}

export interface ClassroomStudentView {
  id: string;
  name: string;
  description: string;
  teacher_name: string;
}

export type Session = {
  token: string;
  refreshToken?: string;
  user: AuthUser;
};

export interface TeacherProfile {
  id: string;
  user_id: string;
  bio: string;
  institution: string;
  subjects: string[];
}

export interface ChapterView {
  id: string;
  classroom_id: string;
  teacher_id: string;
  title: string;
  file_url: string;
  status: "processing" | "ready" | "failed";
  chunk_count: number;
  total_pages?: number;
  warning?: string | null;
  flagged_chunks?: number[];
  error: string | null;
}

export interface ChapterPage {
  page_number: number;
  text: string;
}

export interface ChapterPagesResponse {
  chapter_id: string;
  title: string;
  total_pages: number;
  pages: ChapterPage[];
}

export interface EnrolledStudent {
  id: string;
  student_id: string;
  name: string;
  email: string;
  joined_at: string;
}

export interface FilePick {
  uri: string;
  name: string;
  file?: File | Blob;
}

export type TestDifficulty = "easy" | "medium" | "hard";
export type QuestionType = "mcq" | "true_false" | "descriptive";
export type TestStatus = "draft" | "published" | "closed";

/**
 * Safely parses an ISO date string from the backend into a timestamp in milliseconds.
 * If the string lacks an explicit timezone offset (e.g. "2026-11-23T13:40:37"),
 * it is treated as UTC to prevent JavaScript from incorrectly interpreting it as local device time.
 */
export function parseServerDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const hasTimezone = /Z|[+-]\d{2}(?::?\d{2})?$/i.test(trimmed);
  const normalized = hasTimezone ? trimmed : `${trimmed}Z`;
  const time = new Date(normalized).getTime();
  return isNaN(time) ? null : time;
}

export interface QuestionDistribution {
  mcq: number;
  true_false: number;
  descriptive: number;
}

export interface GenerateTestPayload {
  classroom_id: string;
  chapter_ids?: string[];
  title: string;
  difficulty: TestDifficulty;
  question_distribution: QuestionDistribution;
  duration_minutes: number;
  passing_percentage: number;
  attempts_allowed: number;
  start_at?: string | null;
  end_at?: string | null;
}

export interface UpdateTestPayload {
  title?: string;
  duration_minutes?: number;
  passing_percentage?: number;
  attempts_allowed?: number;
  start_at?: string | null;
  end_at?: string | null;
}

export interface PublishTestPayload {
  start_at?: string | null;
  end_at?: string | null;
  duration_minutes?: number;
  passing_percentage?: number;
  attempts_allowed?: number;
}

export interface EditQuestionPayload {
  question?: string;
  options?: string[];
  correct_answer?: string | boolean;
  marks?: number;
}

export interface EvaluationRubricItem {
  criterion?: string;
  marks?: number;
  [key: string]: unknown;
}

export interface TestQuestion {
  id: string;
  test_id?: string;
  question_id: string;
  type: QuestionType;
  question: string;
  options: string[] | null;
  correct_answer: string | boolean | null;
  marks: number;
  difficulty: TestDifficulty;
  source_chunks: string[];
  evaluation_rubric: EvaluationRubricItem[] | null;
  expected_answer: string | null;
  approved: boolean;
  created_at?: string;
}

export interface TestItem {
  id: string;
  teacher_id: string;
  classroom_id: string;
  chapter_ids: string[];
  title: string;
  difficulty: TestDifficulty;
  total_questions: number;
  total_marks: number;
  duration_minutes: number;
  passing_percentage: number;
  attempts_allowed: number;
  status: TestStatus;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
}

export interface GenerateTestResponse {
  success: boolean;
  message: string;
  test: TestItem;
  warnings: string[];
}

export interface TestWithQuestionsResponse {
  success: boolean;
  test: TestItem;
  questions: TestQuestion[];
}

export interface QuestionResponse {
  success: boolean;
  question: TestQuestion;
}

export interface TutorCitation {
  chapter_id: string;
  chapter_title: string;
  chunk_index?: number;
  score: number;
  text: string;
}

export interface TutorAnswer {
  answer: string;
  citations: TutorCitation[];
}

const RAW_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://0.0.0.0:8000";

// Resolves 0.0.0.0 to routable client addresses:
// - iOS Simulator uses 127.0.0.1 (WebKit blocks 0.0.0.0)
// - Android Emulator uses 10.0.2.2 (special alias for host 127.0.0.1)
// - Physical devices should provide LAN IP in EXPO_PUBLIC_API_BASE_URL
export const API_BASE_URL = (() => {
  if (RAW_API_BASE_URL.includes("0.0.0.0")) {
    const host = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1";
    return RAW_API_BASE_URL.replace("0.0.0.0", host);
  }
  return RAW_API_BASE_URL;
})();

export function getChapterPdfUrl(chapterId: string): string {
  return `${API_BASE_URL}/api/v1/chapters/${chapterId}/pdf`;
}

type SessionListener = (session: Session | null) => void;

class AuthSessionManager {
  private currentSession: Session | null = null;
  private listeners: Set<SessionListener> = new Set();
  private refreshPromise: Promise<string | null> | null = null;

  init(session: Session | null): void {
    this.currentSession = session;
  }

  getSession(): Session | null {
    return this.currentSession;
  }

  getAccessToken(): string | null {
    return this.currentSession?.token ?? null;
  }

  getRefreshToken(): string | null {
    return this.currentSession?.refreshToken ?? null;
  }

  setSession(session: Session | null): void {
    this.currentSession = session;
    this.listeners.forEach((listener) => {
      try {
        listener(session);
      } catch {}
    });
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Refreshes access token with deduplication (single-flight promise).
   */
  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!res.ok) {
          // Refresh token invalid or expired: force logout
          this.setSession(null);
          return null;
        }

        const data = (await res.json()) as RefreshTokenResponse;
        if (!data.access_token) {
          this.setSession(null);
          return null;
        }

        if (this.currentSession) {
          const updatedSession: Session = {
            ...this.currentSession,
            token: data.access_token,
            refreshToken: data.refresh_token || this.currentSession.refreshToken,
            user: data.user || this.currentSession.user,
          };
          this.setSession(updatedSession);
        }

        return data.access_token;
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }
}

export const authSessionManager = new AuthSessionManager();

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const isAuthEndpoint = path.startsWith("/api/v1/auth/");

  // Use the explicitly passed token, or fall back to the active session's access token
  const effectiveToken = token || authSessionManager.getAccessToken() || undefined;

  const execute = async (tokenToUse?: string): Promise<Response> => {
    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(tokenToUse ? { Authorization: `Bearer ${tokenToUse}` } : {}),
        ...(init?.headers || {}),
      },
    });
  };

  let res = await execute(effectiveToken);

  // If 401 Unauthorized and not an auth endpoint (login/signup/refresh), attempt token refresh & retry
  if (res.status === 401 && !isAuthEndpoint) {
    const newToken = await authSessionManager.refreshAccessToken();
    if (newToken) {
      // Retry the failed request with the new access token
      res = await execute(newToken);
    }
  }

  if (!res.ok) {
    let detail = await res.text();
    try {
      detail = JSON.parse(detail).detail ?? detail;
    } catch {}
    throw new Error(detail || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// --- student tests ---

export interface StudentTest {
  id: string;
  title: string;
  difficulty: string;
  total_questions: number;
  total_marks: number;
  duration_minutes: number;
  passing_percentage: number;
  attempts_allowed: number;
  status: string;
  start_at: string | null;
  end_at: string | null;
}

export interface StudentSafeQuestion {
  question_id: string;
  type: string;
  question: string;
  options: string[] | null;
  marks: number;
}

export interface AttemptInfo {
  id: string;
  test_id: string;
  classroom_id: string;
  status: string;
  test_version: number;
  started_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  obtained_marks: number | null;
  total_marks: number;
  evaluation_status: string;
}

export interface AttemptDetail {
  attempt: AttemptInfo;
  questions: StudentSafeQuestion[];
  answers: { question_id: string; student_answer: string | boolean | null }[];
}

export interface GradedAnswer {
  question_id: string;
  question?: string;
  type?: string;
  options?: string[] | null;
  correct_answer?: string | boolean | null;
  marks_awarded: number;
  max_marks?: number;
  is_correct: boolean;
  feedback?: string | null;
  student_answer: string | boolean | null;
  explanation?: string | null;
}

export interface AttemptResult {
  result_id?: string;
  attempt_id: string;
  test_id: string;
  test_title: string;
  obtained_marks: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  evaluation_status: string;
  evaluated_at: string | null;
  answers: GradedAnswer[];
}

export const studentTestsApi = {
  listClassroomTests: (token: string, classroom_id: string) =>
    request<{ tests: StudentTest[] }>(`/api/v1/student/classrooms/${classroom_id}/tests`, undefined, token),
  getTest: (token: string, test_id: string) =>
    request<{ test: StudentTest; questions: StudentSafeQuestion[]; version: number }>(
      `/api/v1/student/tests/${test_id}`, undefined, token),
  getStudentTest: (token: string, test_id: string) =>
    request<{ test: StudentTest; questions: StudentSafeQuestion[]; version: number }>(
      `/api/v1/student/tests/${test_id}`, undefined, token),
  startAttempt: (token: string, test_id: string) =>
    request<AttemptInfo & { resumed: boolean }>(`/api/v1/student/tests/${test_id}/attempts`, {
      method: "POST",
    }, token),
  getAttempt: (token: string, attempt_id: string) =>
    request<{ attempt: AttemptInfo; questions: StudentSafeQuestion[]; answers: { question_id: string; student_answer: string | boolean | null }[] }>(
      `/api/v1/student/attempts/${attempt_id}`, undefined, token),
  saveAnswer: (token: string, attempt_id: string, question_id: string, student_answer: string | boolean | null) =>
    request<{ saved: boolean }>(`/api/v1/student/attempts/${attempt_id}/answers/${question_id}`, {
      method: "PUT",
      body: JSON.stringify({ student_answer }),
    }, token),
  submitAttempt: (token: string, attempt_id: string) =>
    request<{ result: AttemptResult }>(`/api/v1/student/attempts/${attempt_id}/submit`, {
      method: "POST",
    }, token),
  getResult: (token: string, attempt_id: string) =>
    request<{ result: AttemptResult }>(`/api/v1/student/attempts/${attempt_id}/result`, undefined, token),
  myAttempts: (token: string, test_id: string) =>
    request<{ attempts: AttemptInfo[] }>(`/api/v1/student/tests/${test_id}/my-attempts`, undefined, token),
  allResults: (token: string) =>
    request<{ results: AttemptResult[] }>("/api/v1/student/results", undefined, token),
  resultDetail: (token: string, result_id: string) =>
    request<{ result: AttemptResult & { result_id: string; classroom_id: string; answers: (GradedAnswer & { type: string; question: string })[] } }>(
      `/api/v1/student/results/${result_id}`, undefined, token),
  performance: (token: string) =>
    request<{ performance: StudentPerformance }>("/api/v1/student/performance", undefined, token),
};

// --- teacher results & evaluation ---

export interface TeacherResultRow {
  result_id: string;
  attempt_id: string;
  test_id: string;
  student_id: string;
  student_name: string;
  test_title: string;
  total_marks: number;
  obtained_marks: number;
  percentage: number;
  passed: boolean;
  evaluation_status: string;
  review_status: string;
  published_at: string | null;
  time_taken_seconds: number | null;
  submitted_at: string | null;
}

export interface TestResultsStats {
  total_students: number;
  attempted: number;
  pending_evaluation: number;
  average_percentage: number;
  highest_percentage: number;
  lowest_percentage: number;
  pass_rate: number;
}

export interface TeacherAnswerReview {
  question_id: string;
  type: string;
  question: string;
  student_answer: string | boolean | null;
  correct_answer: string | boolean | null;
  marks: number;
  ai_marks: number | null;
  ai_feedback: string | null;
  teacher_marks: number | null;
  teacher_feedback: string | null;
  effective_marks: number | null;
  is_correct: boolean;
  needs_review: boolean;
}

export interface TeacherResultDetail extends TeacherResultRow {
  answers: TeacherAnswerReview[];
}

export interface PendingEvaluationItem {
  result_id: string;
  attempt_id: string;
  test_id: string;
  test_title: string;
  student_name: string;
  question_id: string;
  question: string;
  student_answer: string | boolean | null;
  ai_marks: number | null;
  ai_feedback: string | null;
  max_marks: number;
}

export interface ClassroomPerformance {
  classroom_id: string;
  classroom_name: string;
  total_students: number;
  total_results: number;
  average_percentage: number;
  pass_rate: number;
  test_stats: { test_id: string; title: string; average_percentage: number; attempts: number }[];
  student_ranking: { student_id: string; student_name: string; average_percentage: number; tests_taken: number }[];
  chapter_performance: { chapter_id: string; chapter: string; average_percentage: number }[];
}

export const teacherResultsApi = {
  testResults: (token: string, test_id: string) =>
    request<{ stats: TestResultsStats; results: TeacherResultRow[] }>(
      `/api/v1/teacher/tests/${test_id}/results`, undefined, token),
  resultDetail: (token: string, result_id: string) =>
    request<{ result: TeacherResultDetail }>(`/api/v1/teacher/results/${result_id}`, undefined, token),
  pendingEvaluation: (token: string) =>
    request<{ pending: PendingEvaluationItem[] }>("/api/v1/teacher/results/pending-evaluation", undefined, token),
  evaluateAnswer: (token: string, result_id: string, question_id: string, marks_awarded: number, feedback?: string | null) =>
    request<{ success: boolean }>(`/api/v1/teacher/results/${result_id}/answers/${question_id}/evaluate`, {
      method: "PATCH",
      body: JSON.stringify({ marks_awarded, feedback: feedback ?? null }),
    }, token),
  finalizeResult: (token: string, result_id: string) =>
    request<{ result: { result_id: string; obtained_marks: number; total_marks: number; percentage: number; passed: boolean; review_status: string } }>(
      `/api/v1/teacher/results/${result_id}/finalize`, { method: "POST" }, token),
  classroomPerformance: (token: string, classroom_id: string) =>
    request<{ performance: ClassroomPerformance }>(
      `/api/v1/teacher/classrooms/${classroom_id}/performance`, undefined, token),
  studentPerformance: (token: string, student_id: string) =>
    request<{ performance: StudentPerformance }>(`/api/v1/teacher/students/${student_id}/performance`, undefined, token),
};

export interface StudentPerformance {
  total_tests: number;
  completed_tests: number;
  average_percentage: number;
  average_marks: number;
  highest_percentage: number;
  lowest_percentage: number;
  passed_tests: number;
  failed_tests: number;
  trend: { test_id: string; test_title: string; percentage: number; evaluated_at: string | null }[];
  chapter_performance: { chapter_id: string; chapter: string; average_percentage: number; attempts: number }[];
  type_performance: { type: string; accuracy: number; answered: number }[];
  weak_chapters: { chapter_id: string; chapter: string; average_percentage: number }[];
}

export const api = {
  // --- auth ---
  signup: (role: Role, body: { name: string; email: string; password: string }) =>
    request<AuthResult>(`/api/v1/auth/${role}/signup`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<AuthResult>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  refresh: (refreshToken: string) =>
    request<RefreshTokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),
  me: (token: string) => request<AuthUser>("/api/v1/auth/me", undefined, token),

  // --- classrooms ---
  teacherClassrooms: (token: string) =>
    request<{ classrooms: ClassroomTeacherView[] }>("/api/v1/classrooms", undefined, token),
  studentClassrooms: (token: string) =>
    request<{ classrooms: ClassroomStudentView[] }>("/api/v1/student/classrooms", undefined, token),
  createClassroom: (token: string, body: { name: string; description: string }) =>
    request<{ classroom: ClassroomTeacherView }>("/api/v1/classrooms", {
      method: "POST",
      body: JSON.stringify(body),
    }, token),
  joinClassroom: (token: string, join_code: string) =>
    request<{ message: string }>("/api/v1/student/classrooms/join", {
      method: "POST",
      body: JSON.stringify({ join_code }),
    }, token),

  // --- ai tutor ---
  askTutor: (token: string, classroom_id: string, question: string, chapter_id?: string) =>
    request<TutorAnswer>(`/api/v1/student/classrooms/${classroom_id}/tutor`, {
      method: "POST",
      body: JSON.stringify({ question, ...(chapter_id ? { chapter_id } : {}) }),
    }, token),

  // --- chapters (teacher) ---
  classStudents: (token: string, classroom_id: string) =>
    request<{ students: EnrolledStudent[] }>(`/api/v1/classrooms/${classroom_id}/students`, undefined, token),
  setClassroomStatus: (token: string, classroom_id: string, is_active: boolean) =>
    request<{ classroom: ClassroomTeacherView }>(`/api/v1/classrooms/${classroom_id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ is_active }),
    }, token),
  teacherChapters: (token: string, classroom_id: string) =>
    request<{ chapters: ChapterView[] }>(`/api/v1/classrooms/${classroom_id}/chapters`, undefined, token),
  uploadChapter: async (token: string, classroom_id: string, title: string, file: FilePick) => {
    const form = new FormData();
    form.append("title", title);

    if (file.file) {
      form.append("file", file.file as Blob, file.name);
    } else {
      try {
        // Modern Expo (WinterCG fetch) requires a standard Blob instance
        const fileRes = await fetch(file.uri);
        const blob = await fileRes.blob();
        form.append("file", blob, file.name || "chapter.pdf");
      } catch {
        // Fallback for React Native fetch environments
        form.append("file", {
          uri: file.uri,
          name: file.name || "chapter.pdf",
          type: "application/pdf",
        } as unknown as Blob);
      }
    }

    return request<{ chapter: ChapterView }>(`/api/v1/classrooms/${classroom_id}/chapters`, {
      method: "POST",
      body: form,
    }, token);
  },
  chapterPages: (token: string, chapterId: string) =>
    request<ChapterPagesResponse>(`/api/v1/chapters/${chapterId}/pages`, undefined, token),
  reprocessChapter: (token: string, chapter_id: string) =>
    request<{ message: string }>(`/api/v1/chapters/${chapter_id}/reprocess`, {
      method: "POST",
    }, token),
  deleteChapter: (token: string, classroom_id: string, chapter_id: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/classrooms/${classroom_id}/chapters/${chapter_id}`, {
      method: "DELETE",
    }, token),

  // --- chapters (student) ---
  studentChapters: (token: string, classroom_id: string) =>
    request<{ chapters: ChapterView[] }>(`/api/v1/student/classrooms/${classroom_id}/chapters`, undefined, token),
  searchChapters: (token: string, classroom_id: string, query: string) =>
    request<{ results: TutorAnswer["citations"] }>(`/api/v1/student/classrooms/${classroom_id}/search`, {
      method: "POST",
      body: JSON.stringify({ query }),
    }, token),

  // --- teacher profile ---
  teacherProfile: (token: string) =>
    request<TeacherProfile>("/api/v1/teacher/profile", undefined, token),
  updateTeacherProfile: (token: string, body: { bio: string; institution: string; subjects: string[] }) =>
    request<TeacherProfile>("/api/v1/teacher/profile", {
      method: "PUT",
      body: JSON.stringify(body),
    }, token),

  // --- tests (teacher) ---
  generateTest: (token: string, body: GenerateTestPayload) =>
    request<GenerateTestResponse>("/api/v1/teacher/tests/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }, token),
  teacherTests: (token: string) =>
    request<{ tests: TestItem[] }>("/api/v1/teacher/tests", undefined, token),
  getTeacherTest: (token: string, testId: string) =>
    request<TestWithQuestionsResponse>(`/api/v1/teacher/tests/${testId}`, undefined, token),
  updateTeacherTest: (token: string, testId: string, body: UpdateTestPayload) =>
    request<{ success: boolean; test: TestItem }>(`/api/v1/teacher/tests/${testId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token),
  editTestQuestion: (token: string, testId: string, questionId: string, body: EditQuestionPayload) =>
    request<QuestionResponse>(`/api/v1/teacher/tests/${testId}/questions/${questionId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, token),
  approveTestQuestion: (token: string, testId: string, questionId: string) =>
    request<QuestionResponse>(`/api/v1/teacher/tests/${testId}/questions/${questionId}/approve`, {
      method: "POST",
    }, token),
  deleteTestQuestion: (token: string, testId: string, questionId: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/teacher/tests/${testId}/questions/${questionId}`, {
      method: "DELETE",
    }, token),
  regenerateTestQuestion: (token: string, testId: string, questionId: string) =>
    request<QuestionResponse>(`/api/v1/teacher/tests/${testId}/questions/regenerate`, {
      method: "POST",
      body: JSON.stringify({ question_id: questionId }),
    }, token),
  publishTeacherTest: (token: string, testId: string, body: PublishTestPayload) =>
    request<{ success: boolean; message: string; test: TestItem }>(`/api/v1/teacher/tests/${testId}/publish`, {
      method: "POST",
      body: JSON.stringify(body),
    }, token),
  deleteTeacherTest: (token: string, testId: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/teacher/tests/${testId}`, {
      method: "DELETE",
    }, token),
  studentTests: studentTestsApi,
};

// --- streaming tutor (NDJSON over XHR so it works in React Native) ---

export type TutorStreamEvent =
  | { type: "citations"; citations: TutorAnswer["citations"] }
  | { type: "token"; text: string }
  | { type: "error"; text: string }
  | { type: "done" };

export function askTutorStream(
  token: string,
  classroom_id: string,
  question: string,
  chapter_id: string | undefined,
  onEvent: (event: TutorStreamEvent) => void,
  onError: (message: string) => void,
): XMLHttpRequest {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${API_BASE_URL}/api/v1/student/classrooms/${classroom_id}/tutor/stream`);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Authorization", `Bearer ${token}`);
  let processed = 0;

  const parseBuffer = (isFinal = false): void => {
    const raw = xhr.responseText;
    if (processed >= raw.length) return;

    if (isFinal) {
      const remaining = raw.slice(processed);
      processed = raw.length;
      for (const line of remaining.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onEvent(JSON.parse(trimmed) as TutorStreamEvent);
        } catch {
          // ignore incomplete trailing line on close
        }
      }
      return;
    }

    const lastNewline = raw.lastIndexOf("\n");
    if (lastNewline === -1 || lastNewline < processed) return;

    const chunk = raw.slice(processed, lastNewline);
    processed = lastNewline + 1;
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed) as TutorStreamEvent);
      } catch {
        // partial line handling
      }
    }
  };

  xhr.onprogress = () => parseBuffer(false);
  xhr.onload = () => {
    if (xhr.status >= 400) {
      onError(`Tutor request failed (${xhr.status})`);
      return;
    }
    parseBuffer(true);
  };
  xhr.onerror = () => onError("Network error while contacting the tutor.");
  xhr.send(JSON.stringify({ question, ...(chapter_id ? { chapter_id } : {}) }));
  return xhr;
}

