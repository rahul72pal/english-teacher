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
  token_type: string;
  user: AuthUser;
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

export type Session = { token: string; user: AuthUser };

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
  error: string | null;
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
}

export interface TutorAnswer {
  answer: string;
  citations: {
    chapter_id: string;
    chapter_title: string;
    chunk_index: number;
    score: number;
    text: string;
  }[];
}

// Change this to your machine's LAN IP to test on a physical device,
// e.g. "http://192.168.1.10:8000". Android emulator uses 10.0.2.2 for localhost.
export const API_BASE_URL = "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (!res.ok) {
    let detail = await res.text();
    try {
      detail = JSON.parse(detail).detail ?? detail;
    } catch {}
    throw new Error(detail || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
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
  uploadChapter: (token: string, classroom_id: string, title: string, file: FilePick) => {
    const form = new FormData();
    form.append("title", title);
    form.append("file", { uri: file.uri, name: file.name, type: "application/pdf" } as any);
    return request<{ chapter: ChapterView }>(`/api/v1/classrooms/${classroom_id}/chapters`, {
      method: "POST",
      body: form,
    }, token);
  },
  reprocessChapter: (token: string, chapter_id: string) =>
    request<{ message: string }>(`/api/v1/chapters/${chapter_id}/reprocess`, {
      method: "POST",
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
};
