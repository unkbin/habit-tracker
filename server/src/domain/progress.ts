// Streaks and stats, calculated from a habit's completions. Pure functions: no database, no
// clock. The caller passes "today" in the user's timezone. The rules are in docs/DECISIONS.md;
// the short version:
//
//   Daily and weekday habits are judged day by day. Each scheduled day is a hit (done), a miss
//   (not done), or skipped (today while it's still in progress, or an archived day). Skips
//   neither extend nor break a streak. Unscheduled days never count, even if done.
//
//   X-times-per-week habits are judged week by week (weeks begin on the user's week start day).
//   A week is a hit once it has enough done days. The current week can only be a hit or skipped.
//   A week the habit didn't fully exist for (its first week, or one partly archived) needs only
//   as many done days as it had available days.
//
//   A measured habit's day is done only when the amount reached the target.

import { toDayNumber, weekdayOf, weekStartOf, type LocalDate } from "../lib/dates.js";

export type Frequency = "DAILY" | "WEEKDAYS" | "TIMES_PER_WEEK";

export interface HabitInput {
  frequency: Frequency;
  targetWeekdays: number[];
  timesPerWeek: number | null;
  targetValue: number | null;
  startDate: LocalDate;
  pauses: { startDate: LocalDate; endDate: LocalDate | null }[];
}

export interface CompletionInput {
  date: LocalDate;
  value: number | null;
}

export interface Streak {
  current: number;
  longest: number;
  /** Daily and weekday habits count days; times-per-week habits count weeks. */
  unit: "days" | "weeks";
}

/** Completed and expected check-ins over a period. `rate` is completed / expected, 0-1. */
export interface Tally {
  completed: number;
  expected: number;
  rate: number | null;
}

type Outcome = "hit" | "miss" | "skip";

/** A habit's history indexed by day number, with "today" fixed. */
export class HabitHistory {
  readonly start: number;
  readonly today: number;
  readonly weekly: boolean;
  private readonly doneDays = new Set<number>();
  private readonly values = new Map<number, number | null>();
  private readonly pauses: [number, number][];

  constructor(
    readonly habit: HabitInput,
    completions: CompletionInput[],
    today: LocalDate,
  ) {
    this.start = toDayNumber(habit.startDate);
    this.today = toDayNumber(today);
    this.weekly = habit.frequency === "TIMES_PER_WEEK";
    this.pauses = habit.pauses.map((p) => [
      toDayNumber(p.startDate),
      p.endDate ? toDayNumber(p.endDate) : Number.POSITIVE_INFINITY,
    ]);
    for (const completion of completions) {
      const day = toDayNumber(completion.date);
      // Check-offs before the start date (e.g. after the start date was moved later) don't count.
      if (day < this.start || day > this.today) continue;
      this.values.set(day, completion.value);
      if (habit.targetValue === null || (completion.value ?? 0) >= habit.targetValue) {
        this.doneDays.add(day);
      }
    }
  }

  isDone(day: number): boolean {
    return this.doneDays.has(day);
  }

  /** The amount logged on a day for a measured habit, even if short of the target. */
  valueOn(day: number): number | null {
    return this.values.get(day) ?? null;
  }

  isLogged(day: number): boolean {
    return this.values.has(day);
  }

  isPaused(day: number): boolean {
    return this.pauses.some(([from, to]) => day >= from && day <= to);
  }

  /** Whether the habit is due on this day of the week. Every day, for times-per-week habits. */
  isOnScheduledWeekday(day: number): boolean {
    return this.habit.frequency !== "WEEKDAYS" || this.habit.targetWeekdays.includes(weekdayOf(day));
  }

  /** Whether the habit belongs on the Today list: it has started and is due today. */
  isDueToday(): boolean {
    return this.today >= this.start && this.isOnScheduledWeekday(this.today);
  }

  get totalCompletions(): number {
    return this.doneDays.size;
  }
}

export function streak(history: HabitHistory, weekStartDay: number): Streak {
  if (history.weekly) {
    return { ...runLengths(weekOutcomes(history, weekStartDay)), unit: "weeks" };
  }
  const outcomes: Outcome[] = [];
  for (let day = history.start; day <= history.today; day++) {
    outcomes.push(dayOutcome(history, day));
  }
  return { ...runLengths(outcomes), unit: "days" };
}

/**
 * How the habit did over the last `days` days, including today.
 * Today counts only once it's done, so an unfinished today doesn't drag the rate down.
 */
export function tally(history: HabitHistory, days: number): Tally {
  return tallyBetween(history, history.today - days + 1, history.today);
}

/** Like `tally`, for the day numbers `fromDay` to `toDay` inclusive (clipped to start..today). */
export function tallyBetween(history: HabitHistory, fromDay: number, toDay: number): Tally {
  const from = Math.max(history.start, fromDay);
  const to = Math.min(history.today, toDay);
  let completed = 0;
  let expected = 0;

  if (!history.weekly) {
    for (let day = from; day <= to; day++) {
      const outcome = dayOutcome(history, day);
      if (outcome === "hit") completed++;
      if (outcome !== "skip") expected++;
    }
    return { completed, expected, rate: ratio(completed, expected) };
  }

  // Times-per-week: expect timesPerWeek for every 7 available days, pro rata.
  let available = 0;
  for (let day = from; day <= to; day++) {
    if (history.isDone(day)) {
      completed++;
      available++;
    } else if (day !== history.today && !history.isPaused(day)) {
      available++;
    }
  }
  const expectedDays = ((history.habit.timesPerWeek ?? 0) * available) / 7;
  expected = round(expectedDays);
  completed = round(Math.min(completed, expectedDays));
  return { completed, expected, rate: ratio(completed, expectedDays) };
}

/**
 * Hit rate per day of the week (index 0 = Sunday), from `fromDay` (default: the start) to today.
 * For times-per-week habits every day is eligible, so this shows which days they tend to happen.
 */
export function weekdayTallies(history: HabitHistory, fromDay = history.start): Tally[] {
  const completed = Array<number>(7).fill(0);
  const expected = Array<number>(7).fill(0);
  for (let day = Math.max(fromDay, history.start); day <= history.today; day++) {
    if (!history.isOnScheduledWeekday(day)) continue;
    const weekday = weekdayOf(day);
    if (history.isDone(day)) {
      completed[weekday]!++;
      expected[weekday]!++;
    } else if (day !== history.today && !history.isPaused(day)) {
      expected[weekday]!++;
    }
  }
  return completed.map((c, weekday) => ({
    completed: c,
    expected: expected[weekday]!,
    rate: ratio(c, expected[weekday]!),
  }));
}

/** This week's progress for a times-per-week habit, e.g. 2 of 3. Null for other habits. */
export function weekProgress(history: HabitHistory, weekStartDay: number): { done: number; target: number } | null {
  if (!history.weekly) return null;
  const week = weekStartOf(history.today, weekStartDay);
  return weekSummary(history, week);
}

function dayOutcome(history: HabitHistory, day: number): Outcome {
  if (!history.isOnScheduledWeekday(day)) return "skip";
  if (history.isDone(day)) return "hit";
  if (day === history.today || history.isPaused(day)) return "skip";
  return "miss";
}

function weekOutcomes(history: HabitHistory, weekStartDay: number): Outcome[] {
  const outcomes: Outcome[] = [];
  const currentWeek = weekStartOf(history.today, weekStartDay);
  for (let week = weekStartOf(history.start, weekStartDay); week <= currentWeek; week += 7) {
    const { done, target } = weekSummary(history, week);
    if (done > 0 && done >= target) outcomes.push("hit");
    // Nothing was possible (fully archived), or the current week still has time left.
    else if (target === 0 || week === currentWeek) outcomes.push("skip");
    else outcomes.push("miss");
  }
  return outcomes;
}

/** Done days in the week so far, and the target, reduced when the week had fewer available days. */
function weekSummary(history: HabitHistory, week: number): { done: number; target: number } {
  let done = 0;
  let available = 0;
  for (let day = Math.max(week, history.start); day <= week + 6; day++) {
    if (history.isDone(day)) done++;
    if (!history.isPaused(day)) available++;
  }
  return { done, target: Math.min(history.habit.timesPerWeek ?? 0, available) };
}

/** Longest run of hits, and the run still going at the end. Skips don't interrupt a run. */
function runLengths(outcomes: Outcome[]): { current: number; longest: number } {
  let run = 0;
  let longest = 0;
  for (const outcome of outcomes) {
    if (outcome === "hit") longest = Math.max(longest, ++run);
    else if (outcome === "miss") run = 0;
  }
  return { current: run, longest };
}

function ratio(completed: number, expected: number): number | null {
  return expected > 0 ? round(Math.min(completed / expected, 1)) : null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
