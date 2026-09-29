import {
  HabitHistory,
  streak,
  tally,
  weekdayTallies,
  weekProgress,
  type Tally,
} from "../domain/progress.js";
import type { Prisma } from "../generated/prisma/client.js";
import { fromDbDate, type LocalDate } from "../lib/dates.js";

// Everything the progress calculations need: all pauses and the full check-off history.
export const historyInclude = {
  pauses: true,
  completions: { select: { date: true, value: true, note: true } },
} satisfies Prisma.HabitInclude;

export type HabitWithHistory = Prisma.HabitGetPayload<{ include: typeof historyInclude }>;

export function toHistory(habit: HabitWithHistory, today: LocalDate): HabitHistory {
  return new HabitHistory(
    {
      frequency: habit.frequency,
      targetWeekdays: habit.targetWeekdays,
      timesPerWeek: habit.timesPerWeek,
      targetValue: habit.targetValue,
      startDate: fromDbDate(habit.startDate),
      pauses: habit.pauses.map((p) => ({
        startDate: fromDbDate(p.startDate),
        endDate: p.endDate && fromDbDate(p.endDate),
      })),
    },
    habit.completions.map((c) => ({ date: fromDbDate(c.date), value: c.value })),
    today,
  );
}

export const RATE_WINDOWS = { last7: 7, last30: 30, last90: 90 } as const;

export function completionRates(history: HabitHistory) {
  return {
    last7: tally(history, RATE_WINDOWS.last7).rate,
    last30: tally(history, RATE_WINDOWS.last30).rate,
    last90: tally(history, RATE_WINDOWS.last90).rate,
  };
}

/** Everything the habit detail screen shows. */
export function habitStats(history: HabitHistory, weekStartDay: number) {
  return {
    streak: streak(history, weekStartDay),
    completionRate: completionRates(history),
    totalCompletions: history.totalCompletions,
    byWeekday: withWeekdays(weekdayTallies(history)),
    weekProgress: weekProgress(history, weekStartDay),
  };
}

export function withWeekdays(tallies: Tally[]) {
  return tallies.map((t, weekday) => ({ weekday, ...t }));
}
