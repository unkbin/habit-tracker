import { useEffect, useRef } from "react";
import type { TodayResponse } from "../api/types";
import { useToast } from "../components/ui/Toast";
import { launchConfetti } from "../lib/confetti";

/** Day-streak lengths worth celebrating, largest first. */
const MILESTONES = [100, 30, 7];

const allDone = (data: TodayResponse) => data.summary.total > 0 && data.summary.completed === data.summary.total;

/**
 * Celebrates on the Today screen when the last habit of the day gets ticked, or a daily streak
 * reaches 7, 30 or 100 days. It compares each update with the previous one, so it reacts to the
 * user's own check-offs, not to opening a day that was already complete. The toast carries the
 * news for screen readers; the confetti is decoration.
 */
export function useCelebrations(data: TodayResponse | undefined) {
  const toast = useToast();
  const previous = useRef<TodayResponse | undefined>(undefined);

  useEffect(() => {
    const before = previous.current;
    previous.current = data;
    // Nothing to compare on first load, or when the date rolls over at midnight.
    if (!before || !data || before.date !== data.date) return;

    for (const item of data.habits) {
      const was = before.habits.find((h) => h.habit.id === item.habit.id);
      if (!was || !item.done || item.streak.unit !== "days") continue;
      const reached = MILESTONES.find((m) => was.streak.current < m && item.streak.current >= m);
      if (reached) {
        launchConfetti();
        toast({ message: `${reached}-day streak on ${item.habit.name}! Keep it going.` });
        return;
      }
    }

    if (!allDone(before) && allDone(data)) {
      launchConfetti();
      toast({ message: "All done for today. Nice work!" });
    }
  }, [data, toast]);
}
