import { api, type Session } from "./client";
import type { Completion, Frequency, Habit, HabitStats, StatsOverview, TodayResponse, User } from "./types";

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

export const meApi = {
  update: (body: Partial<Pick<User, "name" | "timezone" | "weekStartDay" | "theme">>) =>
    api<{ user: User }>("/me", { method: "PATCH", body }).then((r) => r.user),
  /** Deletes the account and everything in it. Needs the password again; a wrong one is a 403. */
  remove: (password: string) => api("/me", { method: "DELETE", body: { password } }),
  export: () => api<unknown>("/me/export"),
};

export const todayApi = {
  get: () => api<TodayResponse>("/today"),
};

/** The editable fields of a habit, as the API accepts them on create and update. */
export interface HabitInput {
  name: string;
  description: string | null;
  icon: string;
  color: string;
  frequency: Frequency;
  targetWeekdays: number[];
  timesPerWeek: number | null;
  targetValue: number | null;
  unit: string | null;
  reminderTime: string | null;
  startDate: string;
}

export const habitsApi = {
  list: (status: "active" | "archived" | "all" = "active") =>
    api<{ habits: Habit[] }>(`/habits?status=${status}`).then((r) => r.habits),
  get: (id: string) => api<{ habit: Habit }>(`/habits/${id}`).then((r) => r.habit),
  create: (body: HabitInput) => api<{ habit: Habit }>("/habits", { method: "POST", body }).then((r) => r.habit),
  update: (id: string, body: Partial<HabitInput> & { archived?: boolean }) =>
    api<{ habit: Habit }>(`/habits/${id}`, { method: "PATCH", body }).then((r) => r.habit),
  /** Listed habits take positions 0..n-1; unlisted ones keep their order after them. */
  reorder: (ids: string[]) => api("/habits/reorder", { method: "PATCH", body: { ids } }),
  remove: (id: string) => api(`/habits/${id}`, { method: "DELETE" }),
  stats: (id: string) => api<{ stats: HabitStats }>(`/habits/${id}/stats`).then((r) => r.stats),
  completions: (id: string, from: string, to: string) =>
    api<{ completions: Completion[] }>(`/habits/${id}/completions?from=${from}&to=${to}`).then((r) => r.completions),
};

export const statsApi = {
  overview: () => api<StatsOverview>("/stats/overview"),
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
  /** Prefix for every habit query, so invalidating it refreshes lists and single habits. */
  habits: ["habits"] as const,
  /** Prefix for one habit: its data, stats and check-offs. */
  habit: (id: string) => ["habits", id] as const,
  habitStats: (id: string) => ["habits", id, "stats"] as const,
  habitMonth: (id: string, month: string) => ["habits", id, "completions", month] as const,
  /** Every habit, active and archived; screens filter it. */
  allHabits: ["habits", "list", "all"] as const,
  /** Prefix for overview statistics. */
  stats: ["stats"] as const,
  statsOverview: ["stats", "overview"] as const,
};
