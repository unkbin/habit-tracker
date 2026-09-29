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
