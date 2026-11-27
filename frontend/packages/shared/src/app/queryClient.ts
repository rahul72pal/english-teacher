import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query manages all server state (chapters, tests, results,
 * classrooms, performance). FastAPI + MongoDB remain the source of truth;
 * the cache is just a mirror with background refetching.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      networkMode: "online",
    },
    mutations: { retry: 0, networkMode: "online" },
  },
});
