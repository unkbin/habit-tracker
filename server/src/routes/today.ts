import { Router } from "express";
import { streak, weekProgress } from "../domain/progress.js";
import { fromDbDate, localDate } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { findCurrentUser } from "../lib/users.js";
import { currentUserId, requireAuth } from "../middleware/requireAuth.js";
import { toPublicHabit } from "../services/habits.js";
import { historyInclude, toHistory } from "../services/progress.js";

export function todayRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // The home screen: active habits due today in the user's timezone, with today's status.
  router.get("/", async (req, res) => {
    const user = await findCurrentUser(currentUserId(req));
    const today = localDate(user.timezone);
    const habits = await prisma.habit.findMany({
      where: { userId: user.id, pauses: { none: { endDate: null } } },
      include: historyInclude,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const items = habits.flatMap((habit) => {
      const history = toHistory(habit, today);
      if (!history.isDueToday()) return [];
      const todays = habit.completions.find((c) => fromDbDate(c.date) === today);
      const week = weekProgress(history, user.weekStartDay);
      return [
        {
          habit: toPublicHabit(habit),
          done: history.isDone(history.today),
          // For measured habits: the amount so far, possibly short of the target.
          value: todays?.value ?? null,
          note: todays?.note ?? null,
          streak: streak(history, user.weekStartDay),
          weekProgress: week,
          // Nothing more is needed today: done, or a weekly target already met this week.
          satisfied: history.isDone(history.today) || (week !== null && week.done >= week.target),
        },
      ];
    });

    res.json({
      date: today,
      summary: { completed: items.filter((i) => i.satisfied).length, total: items.length },
      habits: items,
    });
  });

  return router;
}
