import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createHabit, createUser, resetDatabase, type TestUser } from "./helpers.js";

let app: ReturnType<typeof createApp>;
let ada: TestUser;
let habit: { id: string };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Noon UTC on 29 September: the 29th in London and in Los Angeles.
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  await resetDatabase();
  app = createApp();
  ada = await createUser(app, { timezone: "Europe/London" });
  habit = await createHabit(ada, { startDate: "2026-09-01" });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const complete = (user: TestUser, habitId: string, body: Record<string, unknown>) =>
  user.post(`/habits/${habitId}/completions`).send(body);

describe("POST /habits/:id/completions", () => {
  it("checks off today", async () => {
    const res = await complete(ada, habit.id, { date: "2026-09-29" });
    expect(res.status).toBe(200);
    expect(res.body.completion).toEqual({ date: "2026-09-29", value: null, note: null });
  });

  it("is idempotent, so retries and offline replays are harmless", async () => {
    await complete(ada, habit.id, { date: "2026-09-29", note: "felt good" });
    const again = await complete(ada, habit.id, { date: "2026-09-29" });
    expect(again.status).toBe(200);
    // Omitting the note on a repeat keeps the existing one.
    expect(again.body.completion.note).toBe("felt good");
    expect(await prisma.completion.count()).toBe(1);
  });

  it("clears a note when sent an empty one", async () => {
    await complete(ada, habit.id, { date: "2026-09-29", note: "oops" });
    const res = await complete(ada, habit.id, { date: "2026-09-29", note: "" });
    expect(res.body.completion.note).toBeNull();
  });

  it("allows logging up to 7 days back but not further", async () => {
    expect((await complete(ada, habit.id, { date: "2026-09-22" })).status).toBe(200);
    const tooOld = await complete(ada, habit.id, { date: "2026-09-21" });
    expect(tooOld.status).toBe(400);
    expect(tooOld.body.error.fields[0].path).toBe("date");
  });

  it("rejects future dates", async () => {
    expect((await complete(ada, habit.id, { date: "2026-09-30" })).status).toBe(400);
  });

  it("judges 'today' in the user's timezone", async () => {
    // 23:55 UTC on the 29th: already the 30th in Tokyo, still the 29th in Los Angeles.
    vi.setSystemTime(new Date("2026-09-29T23:55:00Z"));
    const tokyo = await createUser(app, { timezone: "Asia/Tokyo" });
    const la = await createUser(app, { timezone: "America/Los_Angeles" });
    const tokyoHabit = await createHabit(tokyo, { startDate: "2026-09-01" });
    const laHabit = await createHabit(la, { startDate: "2026-09-01" });

    expect((await complete(tokyo, tokyoHabit.id, { date: "2026-09-30" })).status).toBe(200);
    expect((await complete(la, laHabit.id, { date: "2026-09-30" })).status).toBe(400);
    expect((await complete(la, laHabit.id, { date: "2026-09-29" })).status).toBe(200);
  });

  it("allows for a phone clock running a few minutes fast just before midnight", async () => {
    // 23:55 in London (BST, UTC+1); the phone already thinks it's the 30th.
    vi.setSystemTime(new Date("2026-09-29T22:55:00Z"));
    await ada.renew();
    expect((await complete(ada, habit.id, { date: "2026-09-30" })).status).toBe(200);

    // An hour before midnight is too early.
    const other = await createHabit(ada, { startDate: "2026-09-01" });
    vi.setSystemTime(new Date("2026-09-29T22:00:00Z"));
    await ada.renew();
    expect((await complete(ada, other.id, { date: "2026-09-30" })).status).toBe(400);
  });

  it("rejects dates before the habit started", async () => {
    const later = await createHabit(ada, { startDate: "2026-09-28" });
    expect((await complete(ada, later.id, { date: "2026-09-27" })).status).toBe(400);
    expect((await complete(ada, later.id, { date: "2026-09-28" })).status).toBe(200);
  });

  it("requires an amount for measured habits and refuses one otherwise", async () => {
    const water = await createHabit(ada, { targetValue: 8, unit: "glasses", startDate: "2026-09-01" });

    expect((await complete(ada, water.id, { date: "2026-09-29" })).status).toBe(400);
    const partial = await complete(ada, water.id, { date: "2026-09-29", value: 5 });
    expect(partial.body.completion.value).toBe(5);
    const updated = await complete(ada, water.id, { date: "2026-09-29", value: 8 });
    expect(updated.body.completion.value).toBe(8);

    expect((await complete(ada, habit.id, { date: "2026-09-29", value: 3 })).status).toBe(400);
  });

  it("refuses check-offs on archived habits", async () => {
    await ada.patch(`/habits/${habit.id}`).send({ archived: true });
    const res = await complete(ada, habit.id, { date: "2026-09-29" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("habit_archived");
  });

  it("validates the date format", async () => {
    expect((await complete(ada, habit.id, { date: "29/09/2026" })).status).toBe(400);
    expect((await complete(ada, habit.id, {})).status).toBe(400);
  });
});

describe("DELETE /habits/:id/completions/:date", () => {
  it("unchecks a day, and succeeds again if it's already unchecked", async () => {
    await complete(ada, habit.id, { date: "2026-09-29" });
    expect((await ada.delete(`/habits/${habit.id}/completions/2026-09-29`)).status).toBe(204);
    expect(await prisma.completion.count()).toBe(0);
    expect((await ada.delete(`/habits/${habit.id}/completions/2026-09-29`)).status).toBe(204);
  });

  it("applies the same 7-day window", async () => {
    await prisma.completion.create({ data: { habitId: habit.id, date: new Date("2026-09-10") } });
    expect((await ada.delete(`/habits/${habit.id}/completions/2026-09-10`)).status).toBe(400);
    expect(await prisma.completion.count()).toBe(1);
  });

  it("validates the date", async () => {
    expect((await ada.delete(`/habits/${habit.id}/completions/yesterday`)).status).toBe(400);
  });
});

describe("GET /habits/:id/completions", () => {
  beforeEach(async () => {
    for (const date of ["2026-09-02", "2026-09-15", "2026-09-28", "2026-09-29"]) {
      await prisma.completion.create({ data: { habitId: habit.id, date: new Date(date) } });
    }
  });

  it("returns the requested range in date order", async () => {
    const res = await ada.get(`/habits/${habit.id}/completions?from=2026-09-15&to=2026-09-28`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: "2026-09-15", to: "2026-09-28" });
    expect(res.body.completions.map((c: { date: string }) => c.date)).toEqual(["2026-09-15", "2026-09-28"]);
  });

  it("defaults to the last 365 days", async () => {
    const res = await ada.get(`/habits/${habit.id}/completions`);
    expect(res.body).toMatchObject({ from: "2025-09-30", to: "2026-09-29" });
    expect(res.body.completions).toHaveLength(4);
  });

  it("rejects backwards or oversized ranges", async () => {
    expect((await ada.get(`/habits/${habit.id}/completions?from=2026-09-29&to=2026-09-01`)).status).toBe(400);
    expect((await ada.get(`/habits/${habit.id}/completions?from=2024-01-01&to=2026-09-29`)).status).toBe(400);
  });
});
