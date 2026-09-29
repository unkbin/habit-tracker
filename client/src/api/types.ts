// Shapes returned by the API. Dates are "YYYY-MM-DD" strings in the user's timezone.

export type Theme = "LIGHT" | "DARK" | "SYSTEM";
export type Frequency = "DAILY" | "WEEKDAYS" | "TIMES_PER_WEEK";

export interface User {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  /** 0 = Sunday */
  weekStartDay: number;
  theme: Theme;
  createdAt: string;
}

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  frequency: Frequency;
  /** 0 = Sunday */
  targetWeekdays: number[];
  timesPerWeek: number | null;
  /** Null for yes/no habits. */
  targetValue: number | null;
  unit: string | null;
  startDate: string;
  reminderTime: string | null;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Completion {
  date: string;
  value: number | null;
  note: string | null;
}

export interface Streak {
  current: number;
  longest: number;
  unit: "days" | "weeks";
}

/** Completed and expected check-ins over a period; rate is 0-1, or null with nothing expected yet. */
export interface Tally {
  completed: number;
  expected: number;
  rate: number | null;
}

export interface HabitStats {
  streak: Streak;
  completionRate: { last7: number | null; last30: number | null; last90: number | null };
  totalCompletions: number;
  /** Index 0 = Sunday. */
  byWeekday: (Tally & { weekday: number })[];
  weekProgress: { done: number; target: number } | null;
}

/** GET /stats/overview: every active habit combined. */
export interface StatsOverview {
  date: string;
  completionRate: { last7: number | null; last30: number | null; last90: number | null };
  totalCompletions: number;
  /** Last 30 days: how many habits were done each day. */
  days: { date: string; completed: number }[];
  /** Last 12 weeks, oldest first, each starting on the user's week start day. */
  weeks: (Tally & { weekStart: string })[];
  /** Last 6 months, oldest first; month is "YYYY-MM". */
  months: (Tally & { month: string })[];
  /** Last 90 days, index 0 = Sunday. */
  byWeekday: (Tally & { weekday: number })[];
  bestWeekday: number | null;
  worstWeekday: number | null;
  /** Best 30-day rate first. */
  habits: { id: string; name: string; icon: string; color: string; rate30: number | null; streak: Streak }[];
}

export interface TodayItem {
  habit: Habit;
  /** Checked off today (for measured habits: target reached). */
  done: boolean;
  value: number | null;
  note: string | null;
  streak: Streak;
  weekProgress: { done: number; target: number } | null;
  /** Nothing more needed today: done, or this week's target already met. */
  satisfied: boolean;
}

export interface TodayResponse {
  date: string;
  summary: { completed: number; total: number };
  habits: TodayItem[];
}
