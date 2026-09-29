import { useMutation, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "../api/client";
import { completionsApi, queryKeys } from "../api/endpoints";
import type { TodayItem, TodayResponse } from "../api/types";
import { useToast } from "../components/ui/Toast";

/** What a tap asks for. Resolved against the latest data, not what the tapped card last rendered. */
export type CheckOffAction = { kind: "toggle" } | { kind: "increment" };

/** What gets saved: an amount (null for yes/no habits), or no check-off. */
type Change = { kind: "set"; value: number | null } | { kind: "clear" };

interface Variables {
  habitId: string;
  date: string;
  change: Change;
  /** Today's data before this change, to restore if the server refuses it. */
  previous: TodayResponse;
}

const MUTATION_KEY = ["check-off"];

/**
 * Checks habits off on the Today screen. The screen updates instantly (optimistic update) and
 * rolls back with an error toast if the server refuses. Unchecking offers Undo.
 */
export function useCheckOff() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: async ({ habitId, date, change }: Variables): Promise<void> => {
      if (change.kind === "set") await completionsApi.set(habitId, { date, value: change.value });
      else await completionsApi.remove(habitId, date);
    },

    onError: (error, { habitId, previous }) => {
      queryClient.setQueryData(queryKeys.today, previous);
      const name = previous.habits.find((h) => h.habit.id === habitId)?.habit.name ?? "that habit";
      toast({ message: `Couldn't update ${name}. ${errorMessage(error)}`, tone: "error" });
    },

    onSettled: () => {
      // Refetch for the server's streaks once the last of a burst of taps has landed, so an
      // early response can't briefly undo a later tap.
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) === 1) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.today });
        void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      }
    },
  });

  const apply = (habitId: string, date: string, change: Change) => {
    const previous = queryClient.getQueryData<TodayResponse>(queryKeys.today);
    if (!previous) return;
    // Applied synchronously, so a second quick tap already sees this one's result. Cancelling
    // stops an in-flight refetch from overwriting it with older data.
    void queryClient.cancelQueries({ queryKey: queryKeys.today });
    queryClient.setQueryData(queryKeys.today, applyChange(previous, habitId, change));
    mutation.mutate({ habitId, date, change, previous });
  };

  return (habitId: string, date: string, action: CheckOffAction) => {
    const item = queryClient.getQueryData<TodayResponse>(queryKeys.today)?.habits.find((h) => h.habit.id === habitId);
    if (!item) return;
    const target = item.habit.targetValue;

    if (action.kind === "increment") {
      apply(habitId, date, { kind: "set", value: (item.value ?? 0) + 1 });
      return;
    }
    if (!item.done) {
      navigator.vibrate?.(10);
      apply(habitId, date, { kind: "set", value: target });
      return;
    }

    apply(habitId, date, { kind: "clear" });
    const restore: Change = { kind: "set", value: item.value };
    toast({
      message: `Unchecked ${item.habit.name}`,
      action: { label: "Undo", onClick: () => apply(habitId, date, restore) },
    });
  };
}

/** Today's data as it will look once the change is saved. Streaks are adjusted approximately; the refetch corrects them. */
function applyChange(data: TodayResponse, habitId: string, change: Change): TodayResponse {
  const habits = data.habits.map((item): TodayItem => {
    if (item.habit.id !== habitId) return item;
    const target = item.habit.targetValue;
    const value = change.kind === "set" ? change.value : null;
    const done = change.kind === "set" && (target === null || (value ?? 0) >= target);
    const delta = Number(done) - Number(item.done);
    const weekProgress = item.weekProgress && { ...item.weekProgress, done: item.weekProgress.done + delta };
    return {
      ...item,
      done,
      value,
      weekProgress,
      streak:
        item.streak.unit === "days"
          ? { ...item.streak, current: Math.max(0, item.streak.current + delta) }
          : item.streak,
      satisfied: done || (weekProgress !== null && weekProgress.done >= weekProgress.target),
    };
  });
  return { ...data, habits, summary: { ...data.summary, completed: habits.filter((h) => h.satisfied).length } };
}
