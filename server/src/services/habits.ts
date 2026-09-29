import { z } from "zod";
import type { Completion, Habit, HabitPause, Prisma } from "../generated/prisma/client.js";
import { fromDbDate } from "../lib/dates.js";
import { HttpError, validationError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

// Loads just enough of a habit's pauses to know whether it is archived (has an open pause).
export const habitInclude = {
  pauses: { where: { endDate: null }, select: { endDate: true } },
} satisfies Prisma.HabitInclude;

type HabitWithOpenPause = Prisma.HabitGetPayload<{ include: typeof habitInclude }>;
// Also accepts a habit loaded with all its pauses (as the export does).
type HabitWithPauses = Habit & { pauses: Pick<HabitPause, "endDate">[] };

export function toPublicHabit(habit: HabitWithPauses) {
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    icon: habit.icon,
    color: habit.color,
    frequency: habit.frequency,
    targetWeekdays: habit.targetWeekdays,
    timesPerWeek: habit.timesPerWeek,
    targetValue: habit.targetValue,
    unit: habit.unit,
    startDate: fromDbDate(habit.startDate),
    reminderTime: habit.reminderTime,
    sortOrder: habit.sortOrder,
    archived: isArchived(habit),
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
  };
}

export function toPublicCompletion(completion: Completion) {
  return { date: fromDbDate(completion.date), value: completion.value, note: completion.note };
}

// Ids that aren't UUIDs would make Postgres throw, so treat them as "not found" up front.
const idSchema = z.guid();

/**
 * The habit if it exists and belongs to the user, otherwise a 404. Every habit route goes
 * through this. Other users' habits get the same 404 as missing ones, so ids can't be probed.
 */
export async function findOwnedHabit(userId: string, habitId: string): Promise<HabitWithOpenPause> {
  const habit = idSchema.safeParse(habitId).success
    ? await prisma.habit.findFirst({ where: { id: habitId, userId }, include: habitInclude })
    : null;
  if (!habit) throw new HttpError(404, "habit_not_found", "Habit not found");
  return habit;
}

export function isArchived(habit: HabitWithPauses): boolean {
  return habit.pauses.some((pause) => pause.endDate === null);
}

export type ScheduleFields = Pick<
  Habit,
  "frequency" | "targetWeekdays" | "timesPerWeek" | "targetValue" | "unit"
>;

/**
 * Clears settings that don't apply to the frequency (so switching a habit from "weekdays" to
 * "daily" just works) and rejects combinations the database would refuse.
 */
export function normalizeSchedule(fields: ScheduleFields): ScheduleFields {
  let { targetWeekdays, timesPerWeek } = fields;

  if (fields.frequency === "WEEKDAYS") {
    timesPerWeek = null;
    if (targetWeekdays.length === 0) {
      throw validationError([{ path: "targetWeekdays", message: "Pick at least one day" }]);
    }
  } else if (fields.frequency === "TIMES_PER_WEEK") {
    targetWeekdays = [];
    if (timesPerWeek == null) {
      throw validationError([{ path: "timesPerWeek", message: "Say how many times per week" }]);
    }
  } else {
    targetWeekdays = [];
    timesPerWeek = null;
  }

  const unit = fields.targetValue == null ? null : fields.unit;
  return { frequency: fields.frequency, targetWeekdays, timesPerWeek, targetValue: fields.targetValue, unit };
}
