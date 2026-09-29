import { api, type Session } from "./client";
import type { Completion, Habit, TodayResponse } from "./types";

export const authApi = {
  signup: (body: { email: string; password: string; name?: string; timezone: string }) =>
    api<Session>("/auth/signup", { method: "POST", body, noRetry: true }),
  login: (body: { email: string; password: string }) =>
    api<Session>("/auth/login", { method: "POST", body, noRetry: true }),
  logout: () => api("/auth/logout", { method: "POST", noRetry: true }),
  forgotPassword: (email: string) =>
    api<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email }, noRetry: true }),
  resetPassword: (token: string, password: string) =>
    api("/auth/reset-password", { method: "POST", body: { token, password }, noRetry: true }),
};

export const todayApi = {
  get: () => api<TodayResponse>("/today"),
};

export const habitsApi = {
  list: (status: "active" | "archived" | "all" = "active") =>
    api<{ habits: Habit[] }>(`/habits?status=${status}`).then((r) => r.habits),
};

export const completionsApi = {
  set: (habitId: string, body: { date: string; value?: number | null; note?: string | null }) =>
    api<{ completion: Completion }>(`/habits/${habitId}/completions`, { method: "POST", body }),
  remove: (habitId: string, date: string) =>
    api(`/habits/${habitId}/completions/${date}`, { method: "DELETE" }),
};

/** TanStack Query cache keys, in one place so invalidation stays consistent. */
export const queryKeys = {
  today: ["today"] as const,
  habits: ["habits"] as const,
  stats: ["stats"] as const,
};
