import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { setEmailTransport, type Email } from "../src/lib/mailer.js";
import { prisma } from "../src/lib/prisma.js";
import { rawRefreshCookie, refreshCookieFrom, resetDatabase, TEST_PASSWORD as PASSWORD } from "./helpers.js";

let app: ReturnType<typeof createApp>;
let emails: Email[];

beforeEach(async () => {
  await resetDatabase();
  // A fresh app per test also resets the in-memory rate limit counters.
  app = createApp();
  emails = [];
  setEmailTransport((email) => {
    emails.push(email);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function signup(body: Record<string, unknown> = {}) {
  return request(app)
    .post("/auth/signup")
    .send({ email: "ada@example.com", password: PASSWORD, timezone: "Europe/London", ...body });
}

function login(email = "ada@example.com", password = PASSWORD) {
  return request(app).post("/auth/login").send({ email, password });
}

function refresh(cookie?: string) {
  const req = request(app).post("/auth/refresh");
  return cookie ? req.set("Cookie", cookie) : req;
}

function resetTokenFromEmail(): string {
  const email = emails.at(-1);
  const match = email?.text.match(/token=([\w-]+)/);
  if (!match) throw new Error("No reset link was emailed");
  return match[1]!;
}

describe("POST /auth/signup", () => {
  it("creates the account, returns an access token and sets a secure-by-default refresh cookie", async () => {
    const res = await signup({ email: "  Ada@Example.COM ", name: "Ada" });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      email: "ada@example.com",
      name: "Ada",
      timezone: "Europe/London",
      weekStartDay: 1,
      theme: "SYSTEM",
    });
    expect(res.body.user).not.toHaveProperty("passwordHash");

    const cookie = rawRefreshCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/auth/);
  });

  it("stores an argon2id hash, never the password", async () => {
    await signup();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "ada@example.com" } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
  });

  it("defaults the timezone to UTC", async () => {
    const res = await signup({ timezone: undefined });
    expect(res.body.user.timezone).toBe("UTC");
  });

  it("rejects an email that is already registered, ignoring case", async () => {
    await signup();
    const res = await signup({ email: "ADA@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
  });

  it.each([
    ["an invalid email", { email: "not-an-email" }, "email"],
    ["a short password", { password: "short" }, "password"],
    ["an unknown timezone", { timezone: "Mars/Olympus_Mons" }, "timezone"],
  ])("rejects %s", async (_label, body, field) => {
    const res = await signup(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.fields.map((f: { path: string }) => f.path)).toContain(field);
  });

  it("rejects malformed JSON", async () => {
    const res = await request(app).post("/auth/signup").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_json");
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await signup();
  });

  it("logs in with the right password, case-insensitively on email", async () => {
    const res = await login("ADA@example.com");
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe("ada@example.com");
    expect(rawRefreshCookie(res)).toBeDefined();
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const wrongPassword = await login("ada@example.com", "wrong password!");
    const unknownEmail = await login("nobody@example.com", PASSWORD);
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it("rate limits repeated attempts", async () => {
    for (let i = 0; i < 10; i++) {
      await login("ada@example.com", "wrong password!");
    }
    const res = await login();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("rate_limited");
  });
});

describe("protected routes (GET /me)", () => {
  it("returns the user for a valid access token", async () => {
    const { body } = await signup();
    const res = await request(app).get("/me").set("Authorization", `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("ada@example.com");
  });

  it("rejects a missing, malformed, forged or expired token", async () => {
    const { body } = await signup();
    const userId: string = body.user.id;

    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setAudience("habit-tracker")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("some-other-secret-that-is-32-chars-or-more"));
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setAudience("habit-tracker")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    for (const header of [undefined, "Bearer", "Bearer not-a-jwt", `Bearer ${forged}`, `Bearer ${expired}`]) {
      const req = request(app).get("/me");
      const res = await (header ? req.set("Authorization", header) : req);
      expect(res.status, `header: ${header}`).toBe(401);
    }
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the refresh token and returns a new access token and the user", async () => {
    const first = refreshCookieFrom(await signup());

    const res = await refresh(first);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe("ada@example.com");
    expect(refreshCookieFrom(res)).not.toBe(first);
  });

  it("revokes the whole session family when an old token is reused", async () => {
    const first = refreshCookieFrom(await signup());
    const second = refreshCookieFrom(await refresh(first));

    const reuse = await refresh(first);
    expect(reuse.status).toBe(401);
    // The attacker (or victim) holding the newer token is logged out too.
    expect((await refresh(second)).status).toBe(401);
  });

  it("keeps separate logins independent", async () => {
    const phone = refreshCookieFrom(await signup());
    const laptop = refreshCookieFrom(await login());

    await refresh(phone);
    await refresh(phone); // reuse: revokes the phone's family only
    expect((await refresh(laptop)).status).toBe(200);
  });

  it("rejects a missing, unknown or expired cookie and clears it", async () => {
    expect((await refresh()).status).toBe(401);
    const unknown = await refresh("refresh_token=made-up");
    expect(unknown.status).toBe(401);
    expect(rawRefreshCookie(unknown)).toMatch(/Expires=Thu, 01 Jan 1970/);

    const cookie = refreshCookieFrom(await signup());
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(cookie)).status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the session so it can't be refreshed, and clears the cookie", async () => {
    const cookie = refreshCookieFrom(await signup());
    const res = await request(app).post("/auth/logout").set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect(rawRefreshCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await refresh(cookie)).status).toBe(401);
  });

  it("succeeds without a cookie", async () => {
    expect((await request(app).post("/auth/logout")).status).toBe(204);
  });
});

describe("password reset", () => {
  function forgot(email = "ada@example.com") {
    return request(app).post("/auth/forgot-password").send({ email });
  }
  function reset(token: string, password = "a brand new password") {
    return request(app).post("/auth/reset-password").send({ token, password });
  }

  beforeEach(async () => {
    await signup();
  });

  it("answers identically for known and unknown emails, and only emails real accounts", async () => {
    const known = await forgot("ADA@example.com");
    const unknown = await forgot("nobody@example.com");
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toBe("ada@example.com");
    expect(emails[0]!.text).toContain("http://localhost:5173/reset-password?token=");
  });

  it("stores only a hash of the reset token", async () => {
    await forgot();
    const token = resetTokenFromEmail();
    const stored = await prisma.passwordResetToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes the password, logs out every device, and works only once", async () => {
    const existingSession = refreshCookieFrom(await login());
    await forgot();
    const token = resetTokenFromEmail();

    expect((await reset(token)).status).toBe(204);
    expect((await login()).status).toBe(401);
    expect((await login("ada@example.com", "a brand new password")).status).toBe(200);
    expect((await refresh(existingSession)).status).toBe(401);

    const again = await reset(token, "yet another password");
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("invalid_reset_token");
  });

  it("only honours the most recent link", async () => {
    await forgot();
    const older = resetTokenFromEmail();
    await forgot();
    const newer = resetTokenFromEmail();

    expect((await reset(older)).status).toBe(400);
    expect((await reset(newer)).status).toBe(204);
  });

  it("rejects an expired or made-up token", async () => {
    await forgot();
    const token = resetTokenFromEmail();
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await reset(token)).status).toBe(400);
    expect((await reset("made-up-token")).status).toBe(400);
    expect((await login()).status).toBe(200);
  });

  it("validates the new password", async () => {
    await forgot();
    const res = await reset(resetTokenFromEmail(), "short");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });
});

describe("app hardening", () => {
  it("sends security headers and only allows the configured origin", async () => {
    const allowed = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(allowed.headers["x-powered-by"]).toBeUndefined();

    const blocked = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(blocked.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("returns JSON 404s for unknown routes", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
