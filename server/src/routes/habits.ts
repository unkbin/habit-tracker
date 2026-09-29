import { Router } from "express";
import { z } from "zod";
import { FrequencyType } from "../generated/prisma/client.js";
import { addDays, fromDbDate, localDate, localDateSchema, toDbDate } from "../lib/dates.js";
import { validationError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { findCurrentUser } from "../lib/users.js";
import { currentUserId, requireAuth } from "../middleware/requireAuth.js";
import {
  findOwnedHabit,
  habitInclude,
  isArchived,
  normalizeSchedule,
  toPublicHabit,
} from "../services/habits.js";
import { completionsRouter } from "./completions.js";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const habitFields = {
  name: z.string().trim().min(1, "Give the habit a name").max(60),
  description: optionalText(500),
  icon: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #22c55e").toLowerCase(),
  frequency: z.enum(FrequencyType),
  // Sorted and de-duplicated so equal schedules compare equal. 0 = Sunday.
  targetWeekdays: z
    .array(z.int().min(0).max(6))
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  timesPerWeek: z.int().min(1).max(7).nullable(),
  targetValue: z.int().min(1).max(100_000).nullable(),
  unit: optionalText(20),
  startDate: localDateSchema,
  reminderTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Use 24-hour HH:MM")
    .nullable(),
};

const createBody = z.object({
  ...habitFields,
  targetWeekdays: habitFields.targetWeekdays.default([]),
  timesPerWeek: habitFields.timesPerWeek.default(null),
  targetValue: habitFields.targetValue.default(null),
  startDate: habitFields.startDate.optional(),
  reminderTime: habitFields.reminderTime.default(null),
});

const updateBody = z
  .object({ ...habitFields, archived: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update");

const listQuery = z.object({
  status: z.enum(["active", "archived", "all"]).default("active"),
});

const reorderBody = z.object({
  ids: z
    .array(z.guid())
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length, "Ids must be unique"),
});

export function habitsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const { status } = listQuery.parse(req.query);
    const openPause = { some: { endDate: null } };
    const habits = await prisma.habit.findMany({
      where: {
        userId: currentUserId(req),
        ...(status === "active" && { pauses: { none: { endDate: null } } }),
        ...(status === "archived" && { pauses: openPause }),
      },
      include: habitInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    res.json({ habits: habits.map(toPublicHabit) });
  });

  router.post("/", async (req, res) => {
    const body = createBody.parse(req.body);
    const user = await findCurrentUser(currentUserId(req));
    const schedule = normalizeSchedule(body);

    const last = await prisma.habit.findFirst({
      where: { userId: user.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const habit = await prisma.habit.create({
      data: {
        userId: user.id,
        name: body.name,
        description: body.description,
        icon: body.icon,
        color: body.color,
        ...schedule,
        startDate: toDbDate(body.startDate ?? localDate(user.timezone)),
        reminderTime: body.reminderTime,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      include: habitInclude,
    });
    res.status(201).json({ habit: toPublicHabit(habit) });
  });

  // Must be registered before "/:id", or Express would treat "reorder" as a habit id.
  // Habits listed in `ids` take positions 0..n-1 in that order; any of the user's habits not
  // listed (e.g. archived ones, or one created on another device) keep their order after them.
  router.patch("/reorder", async (req, res) => {
    const { ids } = reorderBody.parse(req.body);
    const userId = currentUserId(req);
    const habits = await prisma.habit.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    const owned = new Set(habits.map((h) => h.id));
    const unknown = ids.filter((id) => !owned.has(id));
    if (unknown.length > 0) {
      throw validationError([{ path: "ids", message: `Unknown habit ids: ${unknown.join(", ")}` }]);
    }

    const listed = new Set(ids);
    const order = [...ids, ...habits.map((h) => h.id).filter((id) => !listed.has(id))];
    await prisma.$transaction(
      order.map((id, index) => prisma.habit.update({ where: { id }, data: { sortOrder: index } })),
    );
    res.status(204).end();
  });

  router.get("/:id", async (req, res) => {
    const habit = await findOwnedHabit(currentUserId(req), req.params.id);
    res.json({ habit: toPublicHabit(habit) });
  });

  router.patch("/:id", async (req, res) => {
    const body = updateBody.parse(req.body);
    const user = await findCurrentUser(currentUserId(req));
    const habit = await findOwnedHabit(user.id, req.params.id);

    const merged = {
      frequency: body.frequency ?? habit.frequency,
      targetWeekdays: body.targetWeekdays ?? habit.targetWeekdays,
      timesPerWeek: body.timesPerWeek !== undefined ? body.timesPerWeek : habit.timesPerWeek,
      targetValue: body.targetValue !== undefined ? body.targetValue : habit.targetValue,
      unit: body.unit !== undefined ? body.unit : habit.unit,
    };
    // Past completions of a yes/no habit have no amounts (and vice versa), so a habit can't
    // switch kind. The amount itself can change.
    if ((merged.targetValue === null) !== (habit.targetValue === null)) {
      throw validationError([
        { path: "targetValue", message: "A habit can't switch between yes/no and measured; create a new one" },
      ]);
    }
    const schedule = normalizeSchedule(merged);
    const today = localDate(user.timezone);

    await prisma.$transaction(async (tx) => {
      await tx.habit.update({
        where: { id: habit.id },
        data: {
          name: body.name,
          description: body.description,
          icon: body.icon,
          color: body.color,
          ...schedule,
          startDate: body.startDate && toDbDate(body.startDate),
          reminderTime: body.reminderTime,
          // A new reminder time should fire today even if the old one already did.
          ...(body.reminderTime !== undefined && body.reminderTime !== habit.reminderTime && { lastRemindedOn: null }),
        },
      });

      if (body.archived === true && !isArchived(habit)) {
        await tx.habitPause.create({ data: { habitId: habit.id, startDate: toDbDate(today) } });
      }
      if (body.archived === false && isArchived(habit)) {
        const pause = await tx.habitPause.findFirstOrThrow({ where: { habitId: habit.id, endDate: null } });
        const lastPausedDay = addDays(today, -1);
        // Archived and restored on the same day: nothing was actually paused.
        if (lastPausedDay < fromDbDate(pause.startDate)) {
          await tx.habitPause.delete({ where: { id: pause.id } });
        } else {
          await tx.habitPause.update({ where: { id: pause.id }, data: { endDate: toDbDate(lastPausedDay) } });
        }
      }
    });

    const updated = await findOwnedHabit(user.id, habit.id);
    res.json({ habit: toPublicHabit(updated) });
  });

  router.delete("/:id", async (req, res) => {
    const habit = await findOwnedHabit(currentUserId(req), req.params.id);
    await prisma.habit.delete({ where: { id: habit.id } });
    res.status(204).end();
  });

  router.use("/:id/completions", completionsRouter());

  return router;
}
