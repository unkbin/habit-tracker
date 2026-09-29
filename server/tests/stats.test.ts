import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createHabit, createUser, resetDatabase, type TestUser } from "./helpers.js";

// "Now" is Tuesday 29 September 2026, 12:00 UTC. See the calendar in progress.test.ts.

let app: ReturnType<typeof createApp>;
let ada: TestUser;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  await resetDatabase();
  app = createApp();
  ada = await createUser(app, { timezone: "UTC" });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Writes check-offs straight to the database, bypassing the 7-day editing window. */
async function seed(habitId: string, days: (number | [number, number])[], month = "09") {
  await prisma.completion.createMany({
    data: days.map((d) => {
      const [day, value] = Array.isArray(d) ? d : [d, null];
      return { habitId, date: new Date(`2026-${month}-${String(day).padStart(2, "0")}`), value };
    }),
  });
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("GET /today", () => {
  it("lists only active habits due today, in order, with their status", async () => {
    const water = await createHabit(ada, { name: "Water", startDate: "2026-09-01" });
    await createHabit(ada, { name: "Gym MWF", frequency: "WEEKDAYS", targetWeekdays: [1, 3, 5] });
    const run = await createHabit(ada, { name: "Run 3x", frequency: "TIMES_PER_WEEK", timesPerWeek: 3, startDate: "2026-09-01" });
    await createHabit(ada, { name: "Future", startDate: "2026-10-01" });
    const archived = await createHabit(ada, { name: "Archived" });
    await ada.patch(`/habits/${archived.id}`).send({ archived: true });

    await seed(water.id, range(20, 29));
    await seed(run.id, [28]);

    const res = await ada.get("/today");
    expect(res.status).toBe(200);
    expect(res.body.date).toBe("2026-09-29");
    expect(res.body.habits.map((h: { habit: { name: string } }) => h.habit.name)).toEqual(["Water", "Run 3x"]);

    const [waterItem, runItem] = res.body.habits;
    expect(waterItem).toMatchObject({
      done: true,
      satisfied: true,
      streak: { current: 10, longest: 10, unit: "days" },
      weekProgress: null,
    });
    expect(runItem).toMatchObject({
      done: false,
      satisfied: false,
      streak: { unit: "weeks" },
      weekProgress: { done: 1, target: 3 },
    });
    expect(res.body.summary).toEqual({ completed: 1, total: 2 });
  });

  it("treats a weekly habit that already met its target as satisfied", async () => {
    const run = await createHabit(ada, { frequency: "TIMES_PER_WEEK", timesPerWeek: 1, startDate: "2026-09-01" });
    await seed(run.id, [28]);
    const res = await ada.get("/today");
    expect(res.body.habits[0]).toMatchObject({ done: false, satisfied: true });
    expect(res.body.summary).toEqual({ completed: 1, total: 1 });
  });

  it("shows partial progress on a measured habit", async () => {
    const water = await createHabit(ada, { targetValue: 8, unit: "glasses" });
    await ada.post(`/habits/${water.id}/completions`).send({ date: "2026-09-29", value: 5, note: "so far" });
    const res = await ada.get("/today");
    expect(res.body.habits[0]).toMatchObject({ done: false, value: 5, note: "so far" });
  });

  it("uses the user's own date and weekday", async () => {
    // 23:30 UTC on Tuesday 29th is already Wednesday 30th in Tokyo.
    await ada.patch("/me").send({ timezone: "Asia/Tokyo" });
    await createHabit(ada, { name: "Gym MWF", frequency: "WEEKDAYS", targetWeekdays: [1, 3, 5], startDate: "2026-09-01" });
    vi.setSystemTime(new Date("2026-09-29T23:30:00Z"));
    await ada.renew();

    const res = await ada.get("/today");
    expect(res.body.date).toBe("2026-09-30");
    expect(res.body.habits.map((h: { habit: { name: string } }) => h.habit.name)).toEqual(["Gym MWF"]);
  });

  it("is empty for a new user", async () => {
    const res = await ada.get("/today");
    expect(res.body).toEqual({ date: "2026-09-29", summary: { completed: 0, total: 0 }, habits: [] });
  });
});

describe("GET /habits/:id/stats", () => {
  it("returns streaks, rates, totals and the weekday breakdown", async () => {
    const habit = await createHabit(ada, { frequency: "WEEKDAYS", targetWeekdays: [1, 3, 5], startDate: "2026-09-01" });
    // Every Monday and Friday; Wednesdays only from the 23rd. The last miss is Wednesday 16th,
    // so the current streak is Fri 18, Mon 21, Wed 23, Fri 25, Mon 28.
    await seed(habit.id, [4, 7, 11, 14, 18, 21, 23, 25, 28]);

    const res = await ada.get(`/habits/${habit.id}/stats`);
    expect(res.status).toBe(200);
    const { stats } = res.body;
    expect(stats.streak).toEqual({ current: 5, longest: 5, unit: "days" });
    expect(stats.totalCompletions).toBe(9);
    expect(stats.completionRate).toEqual({ last7: 1, last30: 0.75, last90: 0.75 });
    expect(stats.byWeekday[1]).toEqual({ weekday: 1, completed: 4, expected: 4, rate: 1 });
    expect(stats.byWeekday[3]).toEqual({ weekday: 3, completed: 1, expected: 4, rate: 0.25 });
    expect(stats.weekProgress).toBeNull();
  });

  it("counts weeks from the user's week start day", async () => {
    const habit = await createHabit(ada, { frequency: "TIMES_PER_WEEK", timesPerWeek: 3, startDate: "2026-09-14" });
    await seed(habit.id, [18, 19, 20]);

    const monday = await ada.get(`/habits/${habit.id}/stats`);
    expect(monday.body.stats.streak).toMatchObject({ longest: 1, unit: "weeks" });

    await ada.patch("/me").send({ weekStartDay: 0 });
    const sunday = await ada.get(`/habits/${habit.id}/stats`);
    expect(sunday.body.stats.streak).toMatchObject({ longest: 0 });
  });

  it("works for an archived habit", async () => {
    const habit = await createHabit(ada, { startDate: "2026-09-20" });
    await seed(habit.id, range(20, 28));
    await ada.patch(`/habits/${habit.id}`).send({ archived: true });
    const res = await ada.get(`/habits/${habit.id}/stats`);
    expect(res.body.stats.streak).toMatchObject({ current: 9 });
  });
});

describe("GET /stats/overview", () => {
  it("combines all active habits", async () => {
    const daily = await createHabit(ada, { name: "Daily", startDate: "2026-09-01" });
    const weekly = await createHabit(ada, { name: "Weekly", frequency: "TIMES_PER_WEEK", timesPerWeek: 2, startDate: "2026-09-01" });
    const archived = await createHabit(ada, { name: "Archived", startDate: "2026-09-01" });
    await seed(daily.id, range(15, 28));
    await seed(weekly.id, [22, 24, 28]);
    await seed(archived.id, range(1, 28));
    await ada.patch(`/habits/${archived.id}`).send({ archived: true });

    const res = await ada.get("/stats/overview");
    expect(res.status).toBe(200);
    const body = res.body;

    // Last 7 days: daily 6/6; weekly 3 done vs 2 x 6/7 = 1.714 expected, capped.
    expect(body.completionRate.last7).toBe(1);
    expect(body.totalCompletions).toBe(14 + 3);

    expect(body.days).toHaveLength(30);
    expect(body.days.at(-1)).toEqual({ date: "2026-09-29", completed: 0 });
    expect(body.days.at(-2)).toEqual({ date: "2026-09-28", completed: 2 });

    expect(body.weeks).toHaveLength(12);
    // The week of Mon 21: daily 7/7, weekly 2 of 2 (the 22nd and 24th).
    expect(body.weeks.at(-2)).toEqual({ weekStart: "2026-09-21", completed: 9, expected: 9, rate: 1 });
    // The current week (Mon 28 - today): daily 1 of 1 so far, weekly 1 of 2 x 1/7.
    expect(body.weeks.at(-1).weekStart).toBe("2026-09-28");

    expect(body.months.map((m: { month: string }) => m.month)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(body.months[0]).toMatchObject({ completed: 0, expected: 0, rate: null });

    // 30-day rates: daily 14 of 28 days = 0.5; weekly 3 of 2 x 28/7 = 8 expected = 0.375.
    expect(body.habits.map((h: { name: string; rate30: number }) => [h.name, h.rate30])).toEqual([
      ["Daily", 0.5],
      ["Weekly", 0.375],
    ]);
    expect(body.habits[0]).toMatchObject({ streak: { current: 14, unit: "days" } });
  });

  it("names the best and worst weekdays", async () => {
    const habit = await createHabit(ada, { startDate: "2026-09-01" });
    // Every day except Sundays (6, 13, 20, 27) and one Saturday (26).
    await seed(habit.id, range(1, 28).filter((d) => ![6, 13, 20, 27, 26].includes(d)));

    const res = await ada.get("/stats/overview");
    expect(res.body.bestWeekday).toBe(1); // Monday: first of the days tied at 100%
    expect(res.body.worstWeekday).toBe(0); // Sunday: 0%
    expect(res.body.byWeekday[6]).toMatchObject({ completed: 3, expected: 4, rate: 0.75 });
  });

  it("has nothing to say for a new user", async () => {
    const res = await ada.get("/stats/overview");
    expect(res.body).toMatchObject({
      completionRate: { last7: null, last30: null, last90: null },
      totalCompletions: 0,
      bestWeekday: null,
      worstWeekday: null,
      habits: [],
    });
  });
});
