import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createHabit, createUser, rawRefreshCookie, resetDatabase, TEST_PASSWORD, type TestUser } from "./helpers.js";

let app: ReturnType<typeof createApp>;
let ada: TestUser;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
  await resetDatabase();
  app = createApp();
  ada = await createUser(app, { name: "Ada" });
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PATCH /me", () => {
  it("updates settings", async () => {
    const res = await ada
      .patch("/me")
      .send({ name: "Ada L.", timezone: "America/New_York", weekStartDay: 0, theme: "DARK" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: "Ada L.",
      timezone: "America/New_York",
      weekStartDay: 0,
      theme: "DARK",
    });
  });

  it("clears the name with an empty string", async () => {
    const res = await ada.patch("/me").send({ name: "" });
    expect(res.body.user.name).toBeNull();
  });

  it.each([
    ["an unknown timezone", { timezone: "Nowhere/Special" }],
    ["a week start of 7", { weekStartDay: 7 }],
    ["an unknown theme", { theme: "PINK" }],
    ["nothing", {}],
  ])("rejects %s", async (_label, body) => {
    expect((await ada.patch("/me").send(body)).status).toBe(400);
  });

  it("ignores fields that can't be changed here", async () => {
    const res = await ada.patch("/me").send({ theme: "LIGHT", email: "evil@example.com", passwordHash: "x" });
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ada.id } });
    expect(user.email).toBe(ada.email);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe("DELETE /me", () => {
  it("needs the password, answering 403 (not 401) when it's wrong", async () => {
    const wrong = await ada.delete("/me").send({ password: "not my password" });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe("incorrect_password");
    expect((await ada.delete("/me").send({})).status).toBe(400);
    expect(await prisma.user.count()).toBe(1);
  });

  it("deletes the account and everything in it, and logs out", async () => {
    const habit = await createHabit(ada);
    await ada.post(`/habits/${habit.id}/completions`).send({ date: "2026-09-29" });

    const res = await ada.delete("/me").send({ password: TEST_PASSWORD });
    expect(res.status).toBe(204);
    expect(rawRefreshCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);

    for (const count of [
      prisma.user.count(),
      prisma.habit.count(),
      prisma.completion.count(),
      prisma.session.count(),
    ]) {
      expect(await count).toBe(0);
    }
    // The still-unexpired access token no longer works, and the refresh cookie is dead.
    expect((await ada.get("/me")).status).toBe(401);
    expect((await ada.post("/habits").send({ name: "x", icon: "x", color: "#000000", frequency: "DAILY" })).status).toBe(401);
    expect((await request(app).post("/auth/refresh").set("Cookie", ada.cookie)).status).toBe(401);
  });
});

describe("GET /me/export", () => {
  it("downloads all of the user's data as JSON, without secrets", async () => {
    const habit = await createHabit(ada, { name: "Read", startDate: "2026-09-01" });
    await ada.post(`/habits/${habit.id}/completions`).send({ date: "2026-09-28", note: "chapter 3" });
    await ada.patch(`/habits/${habit.id}`).send({ archived: true });

    const res = await ada.get("/me/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="habits-export-2026-09-29.json"');
    expect(res.body.user).toMatchObject({ email: ada.email, name: "Ada" });
    expect(res.body.habits).toHaveLength(1);
    expect(res.body.habits[0]).toMatchObject({
      name: "Read",
      archived: true,
      archivedPeriods: [{ from: "2026-09-29", to: null }],
      completions: [{ date: "2026-09-28", value: null, note: "chapter 3" }],
    });

    const text = JSON.stringify(res.body);
    expect(text).not.toContain("argon2");
    expect(text).not.toMatch(/passwordHash|tokenHash/);
  });

  it("marks a restored habit as not archived", async () => {
    const habit = await createHabit(ada, { startDate: "2026-09-01" });
    await ada.patch(`/habits/${habit.id}`).send({ archived: true });
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    await ada.renew();
    await ada.patch(`/habits/${habit.id}`).send({ archived: false });

    const res = await ada.get("/me/export");
    expect(res.body.habits[0]).toMatchObject({
      archived: false,
      archivedPeriods: [{ from: "2026-09-29", to: "2026-10-01" }],
    });
  });
});
