import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createHabit, createUser, habitInput, resetDatabase, type TestUser } from "./helpers.js";

let ada: TestUser;

beforeEach(async () => {
  // Only Date is faked, so database and HTTP timers keep working.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  await resetDatabase();
  ada = await createUser(createApp(), { timezone: "Asia/Tokyo" });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /habits", () => {
  it("creates a daily habit with sensible defaults", async () => {
    const res = await ada.post("/habits").send(habitInput({ description: "  8 glasses  " }));

    expect(res.status).toBe(201);
    expect(res.body.habit).toMatchObject({
      name: "Drink water",
      description: "8 glasses",
      icon: "droplet",
      color: "#0ea5e9",
      frequency: "DAILY",
      targetWeekdays: [],
      timesPerWeek: null,
      targetValue: null,
      unit: null,
      reminderTime: null,
      sortOrder: 0,
      archived: false,
    });
  });

  it("starts today in the user's timezone, not the server's", async () => {
    // 20:00 UTC on the 29th is already the 30th in Tokyo.
    vi.setSystemTime(new Date("2026-09-29T20:00:00Z"));
    await ada.renew();
    const habit = await createHabit(ada);
    expect(habit.startDate).toBe("2026-09-30");
  });

  it("puts each new habit at the end", async () => {
    await createHabit(ada, { name: "One" });
    const second = await createHabit(ada, { name: "Two" });
    expect(second.sortOrder).toBe(1);
  });

  it("creates weekday, times-per-week and measured habits", async () => {
    const gym = await createHabit(ada, { frequency: "WEEKDAYS", targetWeekdays: [5, 1, 3, 1] });
    expect(gym.targetWeekdays).toEqual([1, 3, 5]);

    const run = await createHabit(ada, { frequency: "TIMES_PER_WEEK", timesPerWeek: 3 });
    expect(run.timesPerWeek).toBe(3);

    const read = await createHabit(ada, {
      targetValue: 30,
      unit: "minutes",
      reminderTime: "21:30",
      startDate: "2026-10-01",
    });
    expect(read).toMatchObject({ targetValue: 30, unit: "minutes", reminderTime: "21:30", startDate: "2026-10-01" });
  });

  it("drops settings that don't apply to the frequency", async () => {
    const habit = await createHabit(ada, { frequency: "DAILY", targetWeekdays: [1], timesPerWeek: 3, unit: "cups" });
    expect(habit).toMatchObject({ targetWeekdays: [], timesPerWeek: null, unit: null });
  });

  it.each([
    ["no name", { name: "  " }, "name"],
    ["a bad colour", { color: "blue" }, "color"],
    ["an unknown frequency", { frequency: "HOURLY" }, "frequency"],
    ["weekdays without days", { frequency: "WEEKDAYS" }, "targetWeekdays"],
    ["a weekday out of range", { frequency: "WEEKDAYS", targetWeekdays: [7] }, "targetWeekdays.0"],
    ["times per week without a count", { frequency: "TIMES_PER_WEEK" }, "timesPerWeek"],
    ["8 times per week", { frequency: "TIMES_PER_WEEK", timesPerWeek: 8 }, "timesPerWeek"],
    ["a 12-hour reminder", { reminderTime: "9:30" }, "reminderTime"],
    ["a bad start date", { startDate: "2026-02-30" }, "startDate"],
  ])("rejects %s", async (_label, overrides, field) => {
    const res = await ada.post("/habits").send(habitInput(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.fields.map((f: { path: string }) => f.path)).toContain(field);
  });

  it("requires authentication", async () => {
    const res = await ada.post("/habits").set("Authorization", "").send(habitInput());
    expect(res.status).toBe(401);
  });
});

describe("GET /habits", () => {
  it("lists active habits in order, with archived ones on request", async () => {
    const water = await createHabit(ada, { name: "Water" });
    const walk = await createHabit(ada, { name: "Walk" });
    await ada.patch(`/habits/${water.id}`).send({ archived: true });

    const active = await ada.get("/habits");
    expect(active.body.habits.map((h: { name: string }) => h.name)).toEqual(["Walk"]);

    const archived = await ada.get("/habits?status=archived");
    expect(archived.body.habits.map((h: { id: string }) => h.id)).toEqual([water.id]);

    const all = await ada.get("/habits?status=all");
    expect(all.body.habits.map((h: { id: string }) => h.id)).toEqual([water.id, walk.id]);
  });

  it("returns an empty list for a new user", async () => {
    const res = await ada.get("/habits");
    expect(res.status).toBe(200);
    expect(res.body.habits).toEqual([]);
  });
});

describe("PATCH /habits/:id", () => {
  it("updates only the fields sent", async () => {
    const habit = await createHabit(ada, { description: "keep me" });
    const res = await ada.patch(`/habits/${habit.id}`).send({ name: "Hydrate", color: "#22C55E" });
    expect(res.status).toBe(200);
    expect(res.body.habit).toMatchObject({ name: "Hydrate", color: "#22c55e", description: "keep me" });
  });

  it("switches frequency, clearing settings that no longer apply", async () => {
    const habit = await createHabit(ada, { frequency: "WEEKDAYS", targetWeekdays: [1, 3] });

    const daily = await ada.patch(`/habits/${habit.id}`).send({ frequency: "DAILY" });
    expect(daily.body.habit).toMatchObject({ frequency: "DAILY", targetWeekdays: [] });

    const missingCount = await ada.patch(`/habits/${habit.id}`).send({ frequency: "TIMES_PER_WEEK" });
    expect(missingCount.status).toBe(400);

    const weekly = await ada.patch(`/habits/${habit.id}`).send({ frequency: "TIMES_PER_WEEK", timesPerWeek: 4 });
    expect(weekly.body.habit).toMatchObject({ frequency: "TIMES_PER_WEEK", timesPerWeek: 4 });
  });

  it("changes a measured habit's target but won't switch it to yes/no or back", async () => {
    const measured = await createHabit(ada, { targetValue: 8, unit: "glasses" });
    const yesNo = await createHabit(ada);

    const retarget = await ada.patch(`/habits/${measured.id}`).send({ targetValue: 10 });
    expect(retarget.body.habit).toMatchObject({ targetValue: 10, unit: "glasses" });

    expect((await ada.patch(`/habits/${measured.id}`).send({ targetValue: null })).status).toBe(400);
    expect((await ada.patch(`/habits/${yesNo.id}`).send({ targetValue: 5 })).status).toBe(400);
  });

  it("clears the reminder dedupe marker when the reminder time changes", async () => {
    const habit = await createHabit(ada, { reminderTime: "07:00" });
    await prisma.habit.update({ where: { id: habit.id }, data: { lastRemindedOn: new Date("2026-09-29") } });

    await ada.patch(`/habits/${habit.id}`).send({ reminderTime: "20:00" });
    const stored = await prisma.habit.findUniqueOrThrow({ where: { id: habit.id } });
    expect(stored.lastRemindedOn).toBeNull();
  });

  it("rejects an empty update", async () => {
    const habit = await createHabit(ada);
    expect((await ada.patch(`/habits/${habit.id}`).send({})).status).toBe(400);
  });

  describe("archiving", () => {
    it("records the archived period so it can be skipped by streaks", async () => {
      const habit = await createHabit(ada, { startDate: "2026-09-01" });

      // Archived on the 29th (Tokyo), restored on 3 October: paused 29th-2nd inclusive.
      const archived = await ada.patch(`/habits/${habit.id}`).send({ archived: true });
      expect(archived.body.habit.archived).toBe(true);
      vi.setSystemTime(new Date("2026-10-03T03:00:00Z"));
      await ada.renew();
      const restored = await ada.patch(`/habits/${habit.id}`).send({ archived: false });
      expect(restored.body.habit.archived).toBe(false);

      const pauses = await prisma.habitPause.findMany({ where: { habitId: habit.id } });
      expect(pauses.map((p) => [p.startDate.toISOString().slice(0, 10), p.endDate?.toISOString().slice(0, 10)])).toEqual([
        ["2026-09-29", "2026-10-02"],
      ]);
    });

    it("leaves no pause when archived and restored on the same day", async () => {
      const habit = await createHabit(ada);
      await ada.patch(`/habits/${habit.id}`).send({ archived: true });
      await ada.patch(`/habits/${habit.id}`).send({ archived: false });
      expect(await prisma.habitPause.count()).toBe(0);
    });

    it("ignores archiving an already archived habit", async () => {
      const habit = await createHabit(ada);
      await ada.patch(`/habits/${habit.id}`).send({ archived: true });
      const again = await ada.patch(`/habits/${habit.id}`).send({ archived: true });
      expect(again.status).toBe(200);
      expect(await prisma.habitPause.count()).toBe(1);
    });
  });
});

describe("DELETE /habits/:id", () => {
  it("deletes the habit and its history", async () => {
    const habit = await createHabit(ada);
    await ada.post(`/habits/${habit.id}/completions`).send({ date: "2026-09-29" });

    expect((await ada.delete(`/habits/${habit.id}`)).status).toBe(204);
    expect((await ada.get(`/habits/${habit.id}`)).status).toBe(404);
    expect(await prisma.completion.count()).toBe(0);
  });
});

describe("PATCH /habits/reorder", () => {
  it("applies the given order and keeps unlisted habits after it", async () => {
    const a = await createHabit(ada, { name: "A" });
    await createHabit(ada, { name: "B" });
    const c = await createHabit(ada, { name: "C" });

    expect((await ada.patch("/habits/reorder").send({ ids: [c.id, a.id] })).status).toBe(204);
    const list = await ada.get("/habits");
    expect(list.body.habits.map((h: { name: string }) => h.name)).toEqual(["C", "A", "B"]);
    expect(list.body.habits.map((h: { sortOrder: number }) => h.sortOrder)).toEqual([0, 1, 2]);
  });

  it("rejects duplicate or unknown ids", async () => {
    const a = await createHabit(ada);
    expect((await ada.patch("/habits/reorder").send({ ids: [a.id, a.id] })).status).toBe(400);
    const unknown = await ada.patch("/habits/reorder").send({ ids: [a.id, "00000000-0000-0000-0000-000000000000"] });
    expect(unknown.status).toBe(400);
  });
});

describe("habit ids", () => {
  it("returns 404 for unknown or malformed ids", async () => {
    expect((await ada.get("/habits/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    const malformed = await ada.get("/habits/not-a-uuid");
    expect(malformed.status).toBe(404);
    expect(malformed.body.error.code).toBe("habit_not_found");
  });
});
