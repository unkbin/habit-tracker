import { Router } from "express";
import { z } from "zod";
import { Theme } from "../generated/prisma/client.js";
import { fromDbDate } from "../lib/dates.js";
import { HttpError } from "../lib/errors.js";
import { verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { clearRefreshCookie } from "../lib/refreshCookie.js";
import { isValidTimeZone } from "../lib/timezone.js";
import { findCurrentUser, toPublicUser } from "../lib/users.js";
import { currentUserId, requireAuth } from "../middleware/requireAuth.js";
import { toPublicCompletion, toPublicHabit } from "../services/habits.js";

const updateBody = z
  .object({
    name: z
      .string()
      .trim()
      .max(100)
      .nullable()
      .transform((value) => value || null),
    timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
    weekStartDay: z.int().min(0).max(6),
    theme: z.enum(Theme),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update");

const deleteBody = z.object({ password: z.string().min(1).max(128) });

export function meRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const user = await findCurrentUser(currentUserId(req));
    res.json({ user: toPublicUser(user) });
  });

  router.patch("/", async (req, res) => {
    const body = updateBody.parse(req.body);
    const user = await findCurrentUser(currentUserId(req));
    const updated = await prisma.user.update({ where: { id: user.id }, data: body });
    res.json({ user: toPublicUser(updated) });
  });

  // Asks for the password again so an unlocked phone or a stolen access token can't wipe the
  // account. A wrong password is 403, not 401, so the frontend doesn't treat it as logged out.
  router.delete("/", async (req, res) => {
    const { password } = deleteBody.parse(req.body);
    const user = await findCurrentUser(currentUserId(req));
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new HttpError(403, "incorrect_password", "That password isn't right");
    }
    // Cascades to habits, completions, pauses, sessions, reset tokens and push subscriptions.
    await prisma.user.delete({ where: { id: user.id } });
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.get("/export", async (req, res) => {
    const user = await findCurrentUser(currentUserId(req));
    const habits = await prisma.habit.findMany({
      where: { userId: user.id },
      include: {
        pauses: { orderBy: { startDate: "asc" } },
        completions: { orderBy: { date: "asc" } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const data = {
      exportedAt: new Date().toISOString(),
      user: toPublicUser(user),
      habits: habits.map((habit) => ({
        ...toPublicHabit(habit),
        archivedPeriods: habit.pauses.map((pause) => ({
          from: fromDbDate(pause.startDate),
          to: pause.endDate && fromDbDate(pause.endDate),
        })),
        completions: habit.completions.map(toPublicCompletion),
      })),
    };

    res.attachment(`habits-export-${new Date().toISOString().slice(0, 10)}.json`);
    res.json(data);
  });

  return router;
}
