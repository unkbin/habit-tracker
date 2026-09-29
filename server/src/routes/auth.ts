import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError, unauthorized } from "../lib/errors.js";
import { sendEmail } from "../lib/mailer.js";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { isValidTimeZone } from "../lib/timezone.js";
import { generateOpaqueToken, hashToken, signAccessToken } from "../lib/tokens.js";
import { toPublicUser } from "../lib/users.js";
import { createAuthLimiters } from "../middleware/rateLimit.js";
import { createSession, revokeSessionFamily, rotateSession, type IssuedRefreshToken } from "../services/sessions.js";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address"));
// Upper bound stops very long inputs being used to make hashing expensive.
const newPassword = z.string().min(8, "Password must be at least 8 characters").max(128);

const signupBody = z.object({
  email,
  password: newPassword,
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone").default("UTC"),
});
const loginBody = z.object({ email, password: z.string().min(1).max(128) });
const forgotPasswordBody = z.object({ email });
const resetPasswordBody = z.object({ token: z.string().min(1).max(200), password: newPassword });

const FORGOT_PASSWORD_MESSAGE = "If an account exists for that email, a reset link has been sent.";

export function authRouter(): Router {
  const router = Router();
  const limit = createAuthLimiters();

  router.post("/signup", limit.signup, async (req, res) => {
    const body = signupBody.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    let user;
    try {
      user = await prisma.user.create({
        data: { email: body.email, passwordHash, name: body.name, timezone: body.timezone },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new HttpError(409, "email_taken", "An account with that email already exists");
      }
      throw err;
    }
    await startSession(req, res, user.id);
    res.status(201).json({ accessToken: await signAccessToken(user.id), user: toPublicUser(user) });
  });

  router.post("/login", limit.login, async (req, res) => {
    const body = loginBody.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Same error and similar timing whether the email or the password was wrong.
    if (!user) {
      await burnPasswordCheck(body.password);
      throw invalidCredentials();
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) throw invalidCredentials();

    await startSession(req, res, user.id);
    res.json({ accessToken: await signAccessToken(user.id), user: toPublicUser(user) });
  });

  // Called on page load and when the access token expires. Also returns the user so the
  // frontend can restore the session from the cookie alone.
  router.post("/refresh", async (req, res) => {
    const token = readRefreshCookie(req);
    const rotated = token ? await rotateSession(token, req.get("user-agent")) : null;
    const user = rotated && (await prisma.user.findUnique({ where: { id: rotated.userId } }));
    if (!rotated || !user) {
      clearRefreshCookie(res);
      throw unauthorized("Session expired, please log in again");
    }
    setRefreshCookie(res, rotated);
    res.json({ accessToken: await signAccessToken(user.id), user: toPublicUser(user) });
  });

  router.post("/logout", async (req, res) => {
    const token = readRefreshCookie(req);
    if (token) await revokeSessionFamily(token);
    clearRefreshCookie(res);
    res.status(204).end();
  });

  // Always answers the same way so it can't be used to discover which emails have accounts.
  router.post("/forgot-password", limit.forgotPassword, async (req, res) => {
    const body = forgotPasswordBody.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (user) {
      const token = generateOpaqueToken();
      await prisma.$transaction([
        // Only the newest link works.
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + config.passwordResetTtlMs),
          },
        }),
      ]);
      const link = new URL("/reset-password", config.APP_URL);
      link.searchParams.set("token", token);
      // Not awaited: the response shouldn't wait on (or reveal anything through) the email provider.
      sendEmail({
        to: user.email,
        subject: "Reset your password",
        text:
          `Someone asked to reset the password for your account.\n\n` +
          `Reset it here (the link works once and expires in 1 hour):\n${link}\n\n` +
          `If this wasn't you, you can ignore this email.`,
      }).catch((err) => console.error("Failed to send password reset email", err));
    }
    res.status(202).json({ message: FORGOT_PASSWORD_MESSAGE });
  });

  router.post("/reset-password", limit.resetPassword, async (req, res) => {
    const body = resetPasswordBody.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const now = new Date();

    const reset = await prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
      if (!record || record.usedAt || record.expiresAt <= now) return null;
      // Conditional update so the same link can't be used twice concurrently.
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count === 0) return null;

      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      // Log out every device, in case the reset was because the account was compromised.
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } });
      return record;
    });

    if (!reset) throw new HttpError(400, "invalid_reset_token", "This reset link is invalid or has expired");
    clearRefreshCookie(res);
    res.status(204).end();
  });

  return router;
}

function invalidCredentials() {
  return new HttpError(401, "invalid_credentials", "Incorrect email or password");
}

async function startSession(req: Request, res: Response, userId: string): Promise<void> {
  setRefreshCookie(res, await createSession(userId, req.get("user-agent")));
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[config.refreshCookieName];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  // The frontend and API are served from the same site (see docs/DECISIONS.md), so Lax is
  // enough for the cookie to be sent and blocks it on cross-site requests (CSRF).
  sameSite: "lax" as const,
  path: config.COOKIE_PATH,
});

function setRefreshCookie(res: Response, issued: IssuedRefreshToken): void {
  res.cookie(config.refreshCookieName, issued.token, { ...cookieOptions(), expires: issued.expiresAt });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.refreshCookieName, cookieOptions());
}
