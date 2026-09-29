import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { MAX_LATE_MINUTES, sendDueReminders } from "../src/jobs/reminders.js";
import { prisma } from "../src/lib/prisma.js";
import { setPushSender, type PushMessage, type PushResult } from "../src/lib/push.js";
import { createHabit, createUser, resetDatabase, type TestUser } from "./helpers.js";

// Wednesday 30 September 2026. London is on BST (UTC+1), so 06:30 UTC is 07:30 there.
const AT_0730_LONDON = new Date("2026-09-30T06:30:00Z");

let app: ReturnType<typeof createApp>;
let sent: { endpoint: string; message: PushMessage }[];
let responses: Map<string, PushResult>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  await resetDatabase();
  app = createApp();
  sent = [];
  responses = new Map();
  setPushSender(async (target, message) => {
    sent.push({ endpoint: target.endpoint, message });
    return responses.get(target.endpoint) ?? "sent";
  });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

let deviceCount = 0;
async function addDevice(user: TestUser): Promise<string> {
  const endpoint = `https://fcm.googleapis.com/fcm/send/device-${++deviceCount}`;
  const res = await user.post("/push/subscriptions").send({ endpoint, keys: { p256dh: "key", auth: "secret" } });
  expect(res.status).toBe(201);
  return endpoint;
}

async function londoner(reminderTime = "07:30", habit: Record<string, unknown> = {}) {
  const user = await createUser(app, { timezone: "Europe/London" });
  await addDevice(user);
  const created = await createHabit(user, { name: "Stretch", reminderTime, startDate: "2026-09-01", ...habit });
  return { user, habit: created };
}

describe("sendDueReminders", () => {
  it("sends a reminder at its time in the user's timezone, once a day", async () => {
    await londoner();

    expect(await sendDueReminders(AT_0730_LONDON)).toEqual({ reminded: 1, users: 1, delivered: 1 });
    expect(sent[0]!.message).toEqual({
      title: "Stretch",
      body: "Time for your habit. Tap to tick it off.",
      url: "/",
      tag: "habit-reminder",
    });

    // Later runs the same day don't repeat it...
    expect((await sendDueReminders(new Date("2026-09-30T06:35:00Z"))).reminded).toBe(0);
    // ...but the next day's does.
    expect((await sendDueReminders(new Date("2026-10-01T06:30:00Z"))).reminded).toBe(1);
    expect(sent).toHaveLength(2);
  });

  it("waits until the reminder time and gives up once it's too late", async () => {
    await londoner();
    expect((await sendDueReminders(new Date("2026-09-30T06:29:00Z"))).reminded).toBe(0);

    const tooLate = new Date(AT_0730_LONDON.getTime() + (MAX_LATE_MINUTES + 1) * 60_000);
    expect((await sendDueReminders(tooLate)).reminded).toBe(0);

    const stillOk = new Date(AT_0730_LONDON.getTime() + MAX_LATE_MINUTES * 60_000);
    expect((await sendDueReminders(stillOk)).reminded).toBe(1);
  });

  it("uses each user's own timezone", async () => {
    const tokyo = await createUser(app, { timezone: "Asia/Tokyo" });
    await addDevice(tokyo);
    await createHabit(tokyo, { name: "Tokyo habit", reminderTime: "07:30", startDate: "2026-09-01" });
    await londoner();

    // 07:30 in Tokyo is 22:30 UTC the day before, when it's still evening in London.
    const run = await sendDueReminders(new Date("2026-09-29T22:30:00Z"));
    expect(run.reminded).toBe(1);
    expect(sent.map((s) => s.message.title)).toEqual(["Tokyo habit"]);
  });

  it("skips habits already done today, including via check-off on the day", async () => {
    const { user, habit } = await londoner();
    vi.setSystemTime(AT_0730_LONDON);
    await user.renew();
    await user.post(`/habits/${habit.id}/completions`).send({ date: "2026-09-30" });

    expect((await sendDueReminders(AT_0730_LONDON)).reminded).toBe(0);
  });

  it("still reminds a measured habit that is only partly done", async () => {
    const { user, habit } = await londoner("07:30", { targetValue: 8, unit: "glasses" });
    vi.setSystemTime(AT_0730_LONDON);
    await user.renew();
    await user.post(`/habits/${habit.id}/completions`).send({ date: "2026-09-30", value: 3 });

    expect((await sendDueReminders(AT_0730_LONDON)).reminded).toBe(1);
  });

  it.each([
    ["not scheduled today (Mon/Fri habit on a Wednesday)", { frequency: "WEEKDAYS", targetWeekdays: [1, 5] }],
    ["not started yet", { startDate: "2026-10-01" }],
  ])("skips habits %s", async (_label, habit) => {
    await londoner("07:30", habit);
    expect((await sendDueReminders(AT_0730_LONDON)).reminded).toBe(0);
  });

  it("skips archived habits and habits without a reminder", async () => {
    const { user, habit } = await londoner();
    await user.patch(`/habits/${habit.id}`).send({ archived: true });
    await createHabit(user, { name: "No reminder", startDate: "2026-09-01" });
    expect((await sendDueReminders(AT_0730_LONDON)).reminded).toBe(0);
  });

  it("stops reminding a weekly habit once this week's target is met", async () => {
    const { habit } = await londoner("07:30", { frequency: "TIMES_PER_WEEK", timesPerWeek: 2 });
    // Monday 28 and Tuesday 29: two done this (Monday-start) week.
    await prisma.completion.createMany({
      data: ["2026-09-28", "2026-09-29"].map((d) => ({ habitId: habit.id, date: new Date(d) })),
    });
    expect((await sendDueReminders(AT_0730_LONDON)).reminded).toBe(0);
  });

  it("reminds a weekly habit whose target isn't met yet", async () => {
    const { habit } = await londoner("07:30", { frequency: "TIMES_PER_WEEK", timesPerWeek: 2 });
    await prisma.completion.create({ data: { habitId: habit.id, date: new Date("2026-09-28") } });
    expect((await sendDueReminders(AT_0730_LONDON)).reminded).toBe(1);
  });

  it("combines habits due together into one notification per person", async () => {
    const { user } = await londoner("07:00");
    await createHabit(user, { name: "Read", reminderTime: "07:15", startDate: "2026-09-01" });
    await createHabit(user, { name: "Water", reminderTime: "07:30", startDate: "2026-09-01" });
    const second = await addDevice(user);

    const run = await sendDueReminders(AT_0730_LONDON);
    expect(run).toEqual({ reminded: 3, users: 1, delivered: 2 });
    expect(sent.map((s) => s.endpoint)).toContain(second);
    expect(sent[0]!.message).toMatchObject({ title: "Habit reminder", body: "Time for Stretch, Read and Water." });
  });

  it("doesn't remind people with no devices, so turning notifications on later still works", async () => {
    const user = await createUser(app, { timezone: "Europe/London" });
    const habit = await createHabit(user, { reminderTime: "07:30", startDate: "2026-09-01" });
    expect((await sendDueReminders(AT_0730_LONDON)).reminded).toBe(0);
    const stored = await prisma.habit.findUniqueOrThrow({ where: { id: habit.id } });
    expect(stored.lastRemindedOn).toBeNull();

    await addDevice(user);
    expect((await sendDueReminders(new Date("2026-09-30T06:40:00Z"))).reminded).toBe(1);
  });

  it("forgets devices the push service reports as gone", async () => {
    const { user } = await londoner();
    const dead = await addDevice(user);
    responses.set(dead, "gone");

    const run = await sendDueReminders(AT_0730_LONDON);
    expect(run.delivered).toBe(1);
    expect(await prisma.pushSubscription.count({ where: { endpoint: dead } })).toBe(0);
    expect(await prisma.pushSubscription.count()).toBe(1);
  });

  it("never double-sends when runs overlap", async () => {
    await londoner();
    const runs = await Promise.all([sendDueReminders(AT_0730_LONDON), sendDueReminders(AT_0730_LONDON)]);
    expect(runs.map((r) => r.reminded).sort()).toEqual([0, 1]);
    expect(sent).toHaveLength(1);
  });

  it("sends a new reminder the same day after the reminder time is changed", async () => {
    const { user, habit } = await londoner("07:00");
    await sendDueReminders(AT_0730_LONDON);
    await user.patch(`/habits/${habit.id}`).send({ reminderTime: "20:00" });

    expect((await sendDueReminders(new Date("2026-09-30T19:00:00Z"))).reminded).toBe(1);
    expect(sent).toHaveLength(2);
  });
});
