import request, { type Response } from "supertest";
import type { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

type App = ReturnType<typeof createApp>;

export const TEST_PASSWORD = "correct horse battery";

/** Empties every table. Deleting users cascades to everything else. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE`);
}

/** The refresh cookie from a response, as a `name=value` string ready for a Cookie header. */
export function refreshCookieFrom(res: Response): string {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith("refresh_token="));
  if (!cookie) throw new Error("Response did not set a refresh_token cookie");
  return cookie.split(";")[0]!;
}

/** The raw Set-Cookie header for the refresh cookie, including its attributes. */
export function rawRefreshCookie(res: Response): string | undefined {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  return header?.find((c) => c.startsWith("refresh_token="));
}

/**
 * Signs up a user and returns request builders that send their access token.
 * Usage: `const ada = await createUser(app); await ada.post("/habits").send({...})`.
 */
export async function createUser(app: App, overrides: Record<string, unknown> = {}) {
  const email = `user-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app)
    .post("/auth/signup")
    .send({ email, password: TEST_PASSWORD, timezone: "UTC", ...overrides });
  if (res.status !== 201) throw new Error(`Signup failed: ${res.status} ${JSON.stringify(res.body)}`);

  let auth = `Bearer ${res.body.accessToken as string}`;
  const user = {
    id: res.body.user.id as string,
    email: res.body.user.email as string,
    cookie: refreshCookieFrom(res),
    /** Swaps the refresh cookie for a new access token, as the frontend does when one expires. */
    async renew() {
      const renewed = await request(app).post("/auth/refresh").set("Cookie", user.cookie);
      if (renewed.status !== 200) throw new Error(`Refresh failed: ${renewed.status}`);
      auth = `Bearer ${renewed.body.accessToken as string}`;
      user.cookie = refreshCookieFrom(renewed);
    },
    get: (path: string) => request(app).get(path).set("Authorization", auth),
    post: (path: string) => request(app).post(path).set("Authorization", auth),
    patch: (path: string) => request(app).patch(path).set("Authorization", auth),
    delete: (path: string) => request(app).delete(path).set("Authorization", auth),
  };
  return user;
}

export type TestUser = Awaited<ReturnType<typeof createUser>>;

export const habitInput = (overrides: Record<string, unknown> = {}) => ({
  name: "Drink water",
  icon: "droplet",
  color: "#0EA5E9",
  frequency: "DAILY",
  ...overrides,
});

/** Creates a habit and returns its public JSON. */
export async function createHabit(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await user.post("/habits").send(habitInput(overrides));
  if (res.status !== 201) throw new Error(`Create habit failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.habit as { id: string; [key: string]: unknown };
}
