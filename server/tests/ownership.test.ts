import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { localDate } from "../src/lib/dates.js";
import { prisma } from "../src/lib/prisma.js";
import { createHabit, createUser, habitInput, resetDatabase, type TestUser } from "./helpers.js";

// One user must never be able to see or change another user's data. Every habit route is
// exercised as an intruder; each must answer exactly like the habit doesn't exist.

let owner: TestUser;
let intruder: TestUser;
let habitId: string;
const today = () => localDate("UTC");

beforeEach(async () => {
  await resetDatabase();
  const app = createApp();
  owner = await createUser(app);
  intruder = await createUser(app);
  const habit = await createHabit(owner, { name: "Owner's habit" });
  habitId = habit.id;
  await owner.post(`/habits/${habitId}/completions`).send({ date: today() });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("another user's habit", () => {
  const attempts: [string, (u: TestUser) => Promise<{ status: number; body: { error?: { code: string } } }>][] = [
    ["read it", (u) => u.get(`/habits/${habitId}`)],
    ["edit it", (u) => u.patch(`/habits/${habitId}`).send({ name: "Mine now" })],
    ["archive it", (u) => u.patch(`/habits/${habitId}`).send({ archived: true })],
    ["delete it", (u) => u.delete(`/habits/${habitId}`)],
    ["check it off", (u) => u.post(`/habits/${habitId}/completions`).send({ date: today() })],
    ["uncheck it", (u) => u.delete(`/habits/${habitId}/completions/${today()}`)],
    ["read its history", (u) => u.get(`/habits/${habitId}/completions`)],
  ];

  it.each(attempts)("can't %s", async (_label, attempt) => {
    const res = await attempt(intruder);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("habit_not_found");

    const habit = await prisma.habit.findUniqueOrThrow({ where: { id: habitId } });
    expect(habit.name).toBe("Owner's habit");
    expect(await prisma.habitPause.count()).toBe(0);
    expect(await prisma.completion.count({ where: { habitId } })).toBe(1);
  });

  it("isn't listed", async () => {
    await createHabit(intruder, { name: "Intruder's habit" });
    for (const status of ["active", "archived", "all"]) {
      const res = await intruder.get(`/habits?status=${status}`);
      expect(res.body.habits.every((h: { name: string }) => h.name === "Intruder's habit")).toBe(true);
    }
  });

  it("can't be reordered", async () => {
    const res = await intruder.patch("/habits/reorder").send({ ids: [habitId] });
    expect(res.status).toBe(400);
    const habit = await prisma.habit.findUniqueOrThrow({ where: { id: habitId } });
    expect(habit.sortOrder).toBe(0);
  });

  it("isn't included in an export", async () => {
    const res = await intruder.get("/me/export");
    expect(JSON.stringify(res.body)).not.toContain("Owner's habit");
  });

  it("can't be claimed by sending a userId", async () => {
    const res = await intruder.post("/habits").send({ ...habitInput(), userId: owner.id });
    expect(res.status).toBe(201);
    const created = await prisma.habit.findUniqueOrThrow({ where: { id: res.body.habit.id } });
    expect(created.userId).toBe(intruder.id);
  });
});
