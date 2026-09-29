import { Router } from "express";
import { streak, tally, tallyBetween, weekdayTallies, type Tally } from "../domain/progress.js";
import { fromDayNumber, localDate, toDayNumber, weekStartOf } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { findCurrentUser } from "../lib/users.js";
import { currentUserId, requireAuth } from "../middleware/requireAuth.js";
import { historyInclude, RATE_WINDOWS, toHistory, withWeekdays } from "../services/progress.js";

const CHART_DAYS = 30;
const CHART_WEEKS = 12;
const CHART_MONTHS = 6;
const WEEKDAY_WINDOW_DAYS = 90;

export function statsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // The statistics screen, across all active habits.
  router.get("/overview", async (req, res) => {
    const user = await findCurrentUser(currentUserId(req));
    const today = localDate(user.timezone);
    const todayDay = toDayNumber(today);
    const habits = await prisma.habit.findMany({
      where: { userId: user.id, pauses: { none: { endDate: null } } },
      include: historyInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const histories = habits.map((habit) => toHistory(habit, today));

    // Each habit is tallied over the whole period first, so a 3-per-week habit is judged on its
    // week rather than on each day, then the habits are added together.
    const period = (fromDay: number, toDay: number) =>
      combine(histories.map((h) => tallyBetween(h, fromDay, toDay)));

    const currentWeek = weekStartOf(todayDay, user.weekStartDay);
    const weeks = Array.from({ length: CHART_WEEKS }, (_, i) => {
      const from = currentWeek - 7 * (CHART_WEEKS - 1 - i);
      return { weekStart: fromDayNumber(from), ...period(from, from + 6) };
    });

    const months = monthStarts(today, CHART_MONTHS).map(({ month, from, to }) => ({
      month,
      ...period(from, to),
    }));

    const days = Array.from({ length: CHART_DAYS }, (_, i) => {
      const day = todayDay - (CHART_DAYS - 1 - i);
      return { date: fromDayNumber(day), completed: histories.filter((h) => h.isDone(day)).length };
    });

    const perHabitWeekdays = histories.map((h) => weekdayTallies(h, todayDay - WEEKDAY_WINDOW_DAYS + 1));
    const byWeekday = withWeekdays(
      Array.from({ length: 7 }, (_, weekday) => combine(perHabitWeekdays.map((tallies) => tallies[weekday]!))),
    );
    // Highest rate first; ties keep weekday order. Best/worst only mean something if rates differ.
    const rated = byWeekday.filter((d) => d.rate !== null).sort((a, b) => b.rate! - a.rate!);
    const hasSpread = rated.length > 1 && rated[0]!.rate! > rated.at(-1)!.rate!;

    const habitSummaries = habits
      .map((habit, i) => {
        const history = histories[i]!;
        return {
          id: habit.id,
          name: habit.name,
          icon: habit.icon,
          color: habit.color,
          rate30: tally(history, 30).rate,
          streak: streak(history, user.weekStartDay),
        };
      })
      // Best first; habits with nothing to rate yet go last.
      .sort((a, b) => (b.rate30 ?? -1) - (a.rate30 ?? -1) || b.streak.current - a.streak.current);

    res.json({
      date: today,
      completionRate: {
        last7: combine(histories.map((h) => tally(h, RATE_WINDOWS.last7))).rate,
        last30: combine(histories.map((h) => tally(h, RATE_WINDOWS.last30))).rate,
        last90: combine(histories.map((h) => tally(h, RATE_WINDOWS.last90))).rate,
      },
      totalCompletions: histories.reduce((sum, h) => sum + h.totalCompletions, 0),
      days,
      weeks,
      months,
      byWeekday,
      bestWeekday: hasSpread ? rated[0]!.weekday : null,
      worstWeekday: hasSpread ? rated.at(-1)!.weekday : null,
      habits: habitSummaries,
    });
  });

  return router;
}

function combine(tallies: Tally[]): Tally {
  const completed = tallies.reduce((sum, t) => sum + t.completed, 0);
  const expected = tallies.reduce((sum, t) => sum + t.expected, 0);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    completed: round(completed),
    expected: round(expected),
    rate: expected > 0 ? round(Math.min(completed / expected, 1)) : null,
  };
}

/** The last `count` calendar months up to and including today's, oldest first. */
function monthStarts(today: string, count: number) {
  const [year, month] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const first = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    const iso = first.toISOString().slice(0, 10);
    return {
      month: iso.slice(0, 7),
      from: toDayNumber(iso),
      to: toDayNumber(next.toISOString().slice(0, 10)) - 1,
    };
  });
}
