import { describe, expect, it } from "vitest";
import {
  HabitHistory,
  streak,
  tally,
  weekdayTallies,
  weekProgress,
  type HabitInput,
} from "../src/domain/progress.js";
import { toDayNumber, weekdayOf, weekStartOf } from "../src/lib/dates.js";

// September 2026, for reading the tests:
//
//   Mon Tue Wed Thu Fri Sat Sun
//        1   2   3   4   5   6
//    7   8   9  10  11  12  13
//   14  15  16  17  18  19  20
//   21  22  23  24  25  26  27
//   28  29  30
//
// "Today" is Tuesday 29 unless a test says otherwise.

const MON = 1;
const SUN = 0;
const sep = (day: number) => `2026-09-${String(day).padStart(2, "0")}`;
const sepRange = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => sep(from + i));

function history(
  habit: Partial<HabitInput>,
  done: (string | { date: string; value: number })[],
  today = sep(29),
) {
  return new HabitHistory(
    {
      frequency: "DAILY",
      targetWeekdays: [],
      timesPerWeek: null,
      targetValue: null,
      startDate: sep(1),
      pauses: [],
      ...habit,
    },
    done.map((d) => (typeof d === "string" ? { date: d, value: null } : d)),
    today,
  );
}

describe("date helpers", () => {
  it("knows the day of the week", () => {
    expect(weekdayOf(toDayNumber(sep(29)))).toBe(2); // Tuesday
    expect(weekdayOf(toDayNumber("1969-12-28"))).toBe(0); // before day 0 still works
  });

  it("finds the start of the week for either week start day", () => {
    const tue29 = toDayNumber(sep(29));
    expect(weekStartOf(tue29, MON)).toBe(toDayNumber(sep(28)));
    expect(weekStartOf(tue29, SUN)).toBe(toDayNumber(sep(27)));
    expect(weekStartOf(toDayNumber(sep(27)), MON)).toBe(toDayNumber(sep(21)));
  });
});

describe("daily streaks", () => {
  it("is zero for a brand-new habit, and one once today is done", () => {
    expect(streak(history({ startDate: sep(29) }, []), MON)).toEqual({ current: 0, longest: 0, unit: "days" });
    expect(streak(history({ startDate: sep(29) }, [sep(29)]), MON)).toMatchObject({ current: 1, longest: 1 });
  });

  it("keeps the streak alive while today is still in progress (before midnight)", () => {
    const h = history({}, [sep(27), sep(28)]);
    expect(streak(h, MON)).toMatchObject({ current: 2, longest: 2 });
  });

  it("breaks the streak once a day has passed undone (after midnight)", () => {
    // Same check-offs, but now it's the 30th and the 29th was missed.
    const h = history({}, [sep(27), sep(28)], sep(30));
    expect(streak(h, MON)).toMatchObject({ current: 0, longest: 2 });
  });

  it("tracks the longest run separately from the current one", () => {
    const h = history({}, [...sepRange(10, 20), ...sepRange(24, 28)]);
    expect(streak(h, MON)).toMatchObject({ current: 5, longest: 11 });
  });

  it("doesn't break for archived days", () => {
    const h = history({ pauses: [{ startDate: sep(22), endDate: sep(25) }] }, [sep(20), sep(21), ...sepRange(26, 28)]);
    expect(streak(h, MON)).toMatchObject({ current: 5 });
  });

  it("counts a day that was done on the day it was archived", () => {
    const h = history({ pauses: [{ startDate: sep(28), endDate: null }] }, [sep(27), sep(28)]);
    expect(streak(h, MON)).toMatchObject({ current: 2 });
  });

  it("ignores check-offs before the start date and doesn't count days before it as misses", () => {
    const h = history({ startDate: sep(26) }, [sep(20), sep(21), ...sepRange(26, 28)]);
    expect(streak(h, MON)).toMatchObject({ current: 3, longest: 3 });
    expect(h.totalCompletions).toBe(3);
  });

  it("is zero for a habit that starts in the future", () => {
    const h = history({ startDate: sep(30) }, []);
    expect(streak(h, MON)).toMatchObject({ current: 0, longest: 0 });
    expect(h.isDueToday()).toBe(false);
  });

  it("needs a measured habit to reach its target for the day to count", () => {
    const h = history({ targetValue: 8 }, [
      { date: sep(26), value: 8 },
      { date: sep(27), value: 5 },
      { date: sep(28), value: 10 },
    ]);
    expect(streak(h, MON)).toMatchObject({ current: 1, longest: 1 });
    expect(h.totalCompletions).toBe(2);
    expect(h.valueOn(toDayNumber(sep(27)))).toBe(5);
    expect(h.isDone(toDayNumber(sep(27)))).toBe(false);
  });
});

describe("weekday streaks (Mon/Wed/Fri)", () => {
  const mwf = { frequency: "WEEKDAYS" as const, targetWeekdays: [1, 3, 5] };

  it("isn't broken by the days in between", () => {
    const h = history(mwf, [sep(21), sep(23), sep(25), sep(28)]);
    expect(streak(h, MON)).toMatchObject({ current: 4, unit: "days" });
  });

  it("is broken by a missed scheduled day", () => {
    const h = history(mwf, [sep(21), sep(25), sep(28)]);
    expect(streak(h, MON)).toMatchObject({ current: 2, longest: 2 });
  });

  it("doesn't let an unscheduled day extend or save the streak", () => {
    // Tuesday 22 is extra; Wednesday 23 was still required.
    const h = history({ ...mwf, startDate: sep(21) }, [sep(21), sep(22), sep(25)], sep(26));
    expect(streak(h, MON)).toMatchObject({ current: 1, longest: 1 });
    expect(h.totalCompletions).toBe(3);
  });

  it("keeps the streak while a scheduled today is in progress", () => {
    const h = history(mwf, [sep(25), sep(28)], sep(30));
    expect(streak(h, MON)).toMatchObject({ current: 2 });
    expect(h.isDueToday()).toBe(true);
  });

  it("isn't due on an unscheduled day", () => {
    expect(history(mwf, []).isDueToday()).toBe(false); // Tuesday
  });
});

describe("times-per-week streaks (3 per week)", () => {
  const thrice = { frequency: "TIMES_PER_WEEK" as const, timesPerWeek: 3, startDate: sep(7) };

  it("counts consecutive weeks that met the target", () => {
    const h = history(thrice, [sep(7), sep(9), sep(11), sep(14), sep(15), sep(20), sep(22), sep(24)]);
    // Weeks from Mon 7, 14: hit. Week from 21: only 2, a miss. Current week: in progress.
    expect(streak(h, MON)).toEqual({ current: 0, longest: 2, unit: "weeks" });
  });

  it("doesn't count the current week against the streak until it ends", () => {
    const h = history(thrice, [...[14, 16, 18, 21, 23, 25].map(sep), sep(28), sep(29)]);
    expect(streak(h, MON)).toMatchObject({ current: 2 });
  });

  it("counts the current week as soon as it meets the target", () => {
    const h = history(thrice, [...[14, 16, 18, 21, 23, 25].map(sep), ...sepRange(28, 30)], sep(30));
    expect(streak(h, MON)).toMatchObject({ current: 3 });
  });

  it("depends on which day the week starts", () => {
    // Fri 18, Sat 19, Sun 20 are one Monday-week but split across two Sunday-weeks.
    const h = history({ ...thrice, startDate: sep(14) }, [sep(18), sep(19), sep(20)]);
    expect(streak(h, MON)).toMatchObject({ current: 0, longest: 1 });
    expect(streak(h, SUN)).toMatchObject({ current: 0, longest: 0 });
  });

  it("only asks for the days available in the first week", () => {
    // Started Saturday 26: that week had two days, so two check-offs meet a target of 5.
    const h = history({ ...thrice, timesPerWeek: 5, startDate: sep(26) }, [sep(26), sep(27)]);
    expect(streak(h, MON)).toMatchObject({ current: 1 });
  });

  it("skips a fully archived week", () => {
    const h = history(thrice, [sep(14), sep(15), sep(16), ...[28].map(sep)], sep(29));
    const paused = history(
      { ...thrice, pauses: [{ startDate: sep(21), endDate: sep(27) }] },
      [sep(14), sep(15), sep(16), sep(28)],
      sep(29),
    );
    expect(streak(h, MON)).toMatchObject({ current: 0 });
    expect(streak(paused, MON)).toMatchObject({ current: 1 });
  });

  it("reports this week's progress", () => {
    const h = history(thrice, [sep(27), sep(28)]);
    expect(weekProgress(h, MON)).toEqual({ done: 1, target: 3 });
    expect(weekProgress(h, SUN)).toEqual({ done: 2, target: 3 });
    expect(weekProgress(history({}, []), MON)).toBeNull();
    expect(h.isDueToday()).toBe(true);
  });
});

describe("completion rate", () => {
  it("counts scheduled days, and leaves out today until it's done", () => {
    const h = history({}, sepRange(23, 28));
    expect(tally(h, 7)).toEqual({ completed: 6, expected: 6, rate: 1 });
    // Since the start on the 1st: 28 finished days, 6 done.
    expect(tally(h, 30)).toEqual({ completed: 6, expected: 28, rate: 0.214 });
  });

  it("includes today once it's done", () => {
    expect(tally(history({}, sepRange(23, 29)), 7)).toEqual({ completed: 7, expected: 7, rate: 1 });
  });

  it("only expects scheduled weekdays", () => {
    const h = history({ frequency: "WEEKDAYS", targetWeekdays: [1, 3, 5] }, [sep(23), sep(28)]);
    // Wed 23, Fri 25 and Mon 28 were due.
    expect(tally(h, 7)).toEqual({ completed: 2, expected: 3, rate: 0.667 });
  });

  it("expects times-per-week habits pro rata, capped at 100%", () => {
    const h = history({ frequency: "TIMES_PER_WEEK", timesPerWeek: 3 }, [sep(23), sep(25), sep(27), sep(28)]);
    // 6 finished days in the window: 3 x 6/7 = 2.571 expected.
    expect(tally(h, 7)).toEqual({ completed: 2.571, expected: 2.571, rate: 1 });
  });

  it("leaves archived days out", () => {
    const h = history({ pauses: [{ startDate: sep(23), endDate: sep(26) }] }, [sep(27), sep(28)]);
    expect(tally(h, 7)).toEqual({ completed: 2, expected: 2, rate: 1 });
  });

  it("has no rate before there's anything to measure", () => {
    expect(tally(history({ startDate: sep(29) }, []), 7)).toEqual({ completed: 0, expected: 0, rate: null });
  });
});

describe("weekday breakdown", () => {
  it("rates each scheduled weekday separately", () => {
    const h = history({ frequency: "WEEKDAYS", targetWeekdays: [1, 3, 5] }, [sep(7), sep(14), sep(21), sep(28), sep(4)]);
    const byDay = weekdayTallies(h);
    expect(byDay[1]).toEqual({ completed: 4, expected: 4, rate: 1 }); // every Monday
    expect(byDay[3]).toEqual({ completed: 0, expected: 4, rate: 0 }); // Wednesdays 2-23: none done
    expect(byDay[5]).toEqual({ completed: 1, expected: 4, rate: 0.25 });
    expect(byDay[2]).toEqual({ completed: 0, expected: 0, rate: null }); // Tuesdays aren't scheduled
  });

  it("can be limited to recent weeks", () => {
    const h = history({}, [sep(1), sep(8)]);
    const recent = weekdayTallies(h, toDayNumber(sep(15)));
    expect(recent[2]).toEqual({ completed: 0, expected: 2, rate: 0 }); // Tue 15 and 22; the 29th is today
  });
});
