import { weekProgress } from "../domain/progress.js";
import { addDays, fromDbDate, localDate, localMinutes, minutesOf, toDbDate } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { toHistory } from "../services/progress.js";
import { sendToUser } from "../services/push.js";

/**
 * How late a reminder may still go out. If the scheduler was down past this, the reminder is
 * skipped rather than arriving hours after the time the user picked.
 */
export const MAX_LATE_MINUTES = 120;

export interface ReminderRun {
  /** Habits whose reminder went out in this run. */
  reminded: number;
  /** People notified (several habits due together make one notification). */
  users: number;
  /** Devices the notification reached. */
  delivered: number;
}

/**
 * Sends every reminder that is due. Safe to run as often as you like (every minute or every few
 * minutes): each habit is reminded at most once per local day, claimed with a conditional update
 * before sending, so overlapping runs can't double-send.
 *
 * A habit is due when its reminder time has passed in its owner's timezone (by at most
 * MAX_LATE_MINUTES), it's scheduled today, it isn't archived, it isn't done yet, and for
 * X-times-per-week habits this week's target isn't met yet.
 */
export async function sendDueReminders(now: Date = new Date()): Promise<ReminderRun> {
  // Only habits of people with at least one device to notify. Completions from the last ~9 days
  // cover "today" and "this week" in any timezone.
  const habits = await prisma.habit.findMany({
    where: {
      reminderTime: { not: null },
      pauses: { none: { endDate: null } },
      user: { pushSubscriptions: { some: {} } },
    },
    include: {
      user: { select: { id: true, timezone: true, weekStartDay: true } },
      pauses: true,
      completions: {
        where: { date: { gte: toDbDate(addDays(fromDbDate(now), -9)) } },
        select: { date: true, value: true, note: true },
      },
    },
    orderBy: [{ userId: "asc" }, { sortOrder: "asc" }],
  });

  const dueByUser = new Map<string, string[]>();
  let reminded = 0;

  for (const habit of habits) {
    const { timezone, weekStartDay } = habit.user;
    const today = localDate(timezone, now);
    if (habit.lastRemindedOn && fromDbDate(habit.lastRemindedOn) === today) continue;

    const late = localMinutes(timezone, now) - minutesOf(habit.reminderTime!);
    if (late < 0 || late > MAX_LATE_MINUTES) continue;

    const history = toHistory(habit, today);
    if (!history.isDueToday() || history.isDone(history.today)) continue;
    const week = weekProgress(history, weekStartDay);
    if (week && week.done >= week.target) continue;

    // Claim it: only one run gets count 1 for this habit today.
    const { count } = await prisma.habit.updateMany({
      where: {
        id: habit.id,
        OR: [{ lastRemindedOn: null }, { lastRemindedOn: { not: toDbDate(today) } }],
      },
      data: { lastRemindedOn: toDbDate(today) },
    });
    if (count === 0) continue;

    reminded++;
    dueByUser.set(habit.userId, [...(dueByUser.get(habit.userId) ?? []), habit.name]);
  }

  let delivered = 0;
  for (const [userId, names] of dueByUser) {
    const result = await sendToUser(userId, {
      title: names.length === 1 ? names[0]! : "Habit reminder",
      body: names.length === 1 ? "Time for your habit. Tap to tick it off." : `Time for ${listOf(names)}.`,
      url: "/",
      // One reminder notification at a time; a later one replaces an unread earlier one.
      tag: "habit-reminder",
    });
    delivered += result.sent;
  }

  return { reminded, users: dueByUser.size, delivered };
}

/** "A", "A and B", "A, B and C". */
function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
