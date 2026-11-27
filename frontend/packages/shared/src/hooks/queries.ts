import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, studentTestsApi, type AttemptDetail, type AttemptResult, type ClassroomStudentView, type StudentPerformance, type StudentTest } from "../index";

// ---------- server state via TanStack Query (FastAPI is the source of truth) ----------

export function useStudentTests(classroomId: string | null, token: string) {
  return useQuery<{ tests: StudentTest[] }>({
    queryKey: ["student-tests", classroomId],
    queryFn: () => studentTestsApi.listClassroomTests(token, classroomId!),
    enabled: !!classroomId && !!token,
  });
}

export function useStudentPerformance(token: string) {
  return useQuery<{ performance: StudentPerformance }>({
    queryKey: ["student-performance"],
    queryFn: () => studentTestsApi.performance(token),
    enabled: !!token,
  });
}

export function useStudentResults(token: string) {
  return useQuery<{ results: AttemptResult[] }>({
    queryKey: ["student-results"],
    queryFn: () => studentTestsApi.allResults(token),
    enabled: !!token,
  });
}

export function useStudentClassrooms(token: string) {
  return useQuery<{ classrooms: ClassroomStudentView[] }>({
    queryKey: ["student-classrooms"],
    queryFn: () => api.studentClassrooms(token),
    enabled: !!token,
  });
}

/** Fetch / resume the active attempt — staleTime 0 so resume is always fresh. */
export function useAttempt(token: string, attemptId: string | null) {
  return useQuery<AttemptDetail>({
    queryKey: ["attempt", attemptId],
    queryFn: () => studentTestsApi.getAttempt(token, attemptId!),
    enabled: !!attemptId && !!token,
    staleTime: 0,
  });
}

/** Submitting an attempt is a mutation; results + performance are invalidated after. */
export function useSubmitAttempt(token: string) {
  const queryClient = useQueryClient();
  return useMutation<AttemptResult, Error, string>({
    mutationFn: (attemptId) => studentTestsApi.submitAttempt(token, attemptId).then((r) => r.result),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-results"] });
      queryClient.invalidateQueries({ queryKey: ["student-performance"] });
    },
  });
}
