import { Router } from "express";
import { z } from "zod";
import type { User } from "../generated/prisma/client.js";
import { addDays, daysBetween, fromDbDate, localDate, localDateSchema, toDbDate, type LocalDate } from "../lib/dates.js";
import { HttpError, validationError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { findCurrentUser } from "../lib/users.js";
import { currentUserId } from "../middleware/requireAuth.js";
import { findOwnedHabit, isArchived, toPublicCompletion } from "../services/habits.js";

/** How many days back a check-off can be added or removed. */
export const BACKFILL_DAYS = 7;
// A phone clock running slightly fast shouldn't make "today" count as the future just after midnight.
const CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_RANGE_DAYS = 400;

const createBody = z.object({
  date: localDateSchema,
  value: z.int().min(0).max(1_000_000).nullish(),
  note: z.string().trim().max(500).nullish(),
});

const rangeQuery = z.object({
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
});

// Mounted at /habits/:id/completions behind requireAuth.
export function completionsRouter(): Router {
  const router = Router({ mergeParams: true });

  // An upsert, so repeating it (a retry, or a queued offline check-off) is harmless.
  router.post("/", async (req, res) => {
    const body = createBody.parse(req.body);
    const params = req.params as { id: string };
    const user = await findCurrentUser(currentUserId(req));
    const habit = await findOwnedHabit(user.id, params.id);

    if (isArchived(habit)) {
      throw new HttpError(409, "habit_archived", "Restore the habit before checking it off");
    }
    assertEditableDate(user, body.date);
    if (body.date < fromDbDate(habit.startDate)) {
      throw validationError([{ path: "date", message: "That's before the habit started" }]);
    }

    const measured = habit.targetValue !== null;
    if (measured && body.value == null) {
      throw validationError([{ path: "value", message: "Enter how much you did" }]);
    }
    if (!measured && body.value != null) {
      throw validationError([{ path: "value", message: "This habit doesn't track an amount" }]);
    }

    const value = measured ? body.value : null;
    // An omitted note leaves any existing note alone; null or "" clears it.
    const note = body.note === undefined ? undefined : body.note || null;
    const completion = await prisma.completion.upsert({
      where: { habitId_date: { habitId: habit.id, date: toDbDate(body.date) } },
      create: { habitId: habit.id, date: toDbDate(body.date), value, note },
      update: { value, note },
    });
    res.json({ completion: toPublicCompletion(completion) });
  });

  // Succeeds whether or not the day was checked off, so retries are harmless.
  router.delete("/:date", async (req, res) => {
    const params = req.params as { id: string; date: string };
    const date = localDateSchema.parse(params.date);
    const user = await findCurrentUser(currentUserId(req));
    const habit = await findOwnedHabit(user.id, params.id);
    assertEditableDate(user, date);

    await prisma.completion.deleteMany({ where: { habitId: habit.id, date: toDbDate(date) } });
    res.status(204).end();
  });

  // Defaults to the last 365 days, enough for a year-long heatmap.
  router.get("/", async (req, res) => {
    const query = rangeQuery.parse(req.query);
    const params = req.params as { id: string };
    const user = await findCurrentUser(currentUserId(req));
    const habit = await findOwnedHabit(user.id, params.id);

    const to = query.to ?? localDate(user.timezone);
    const from = query.from ?? addDays(to, -364);
    if (from > to) throw validationError([{ path: "from", message: "from must not be after to" }]);
    if (daysBetween(from, to) >= MAX_RANGE_DAYS) {
      throw validationError([{ path: "from", message: `Ask for at most ${MAX_RANGE_DAYS} days at a time` }]);
    }

    const completions = await prisma.completion.findMany({
      where: { habitId: habit.id, date: { gte: toDbDate(from), lte: toDbDate(to) } },
      orderBy: { date: "asc" },
    });
    res.json({ from, to, completions: completions.map(toPublicCompletion) });
  });

  return router;
}

/** Check-offs can be changed from BACKFILL_DAYS ago up to today, in the user's timezone. */
function assertEditableDate(user: User, date: LocalDate): void {
  const latest = localDate(user.timezone, new Date(Date.now() + CLOCK_SKEW_MS));
  const earliest = addDays(localDate(user.timezone), -BACKFILL_DAYS);
  if (date > latest) {
    throw validationError([{ path: "date", message: "You can't check off a day in the future" }]);
  }
  if (date < earliest) {
    throw validationError([{ path: "date", message: `You can only change the last ${BACKFILL_DAYS} days` }]);
  }
}
