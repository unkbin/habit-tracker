import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../api/client";
import { completionsApi, habitsApi, queryKeys } from "../../api/endpoints";
import type { Completion, Habit } from "../../api/types";
import { useToast } from "../../components/ui/Toast";
import {
  addDays,
  addMonths,
  daysOfMonth,
  formatLongDate,
  formatMonth,
  monthOf,
  WEEKDAY_NAMES,
  weekdayOf,
  weekdayOrder,
} from "../../lib/dates";

/** How far back a check-off can be changed. Mirrors the API's rule. */
const BACKFILL_DAYS = 7;

interface Props {
  habit: Habit;
  /** Today in the user's timezone. */
  today: string;
  weekStartDay: number;
}

type DayState =
  | { kind: "outside" } // before the habit started, or in the future
  | { kind: "done" }
  | { kind: "partial"; value: number } // measured habit, short of the target
  | { kind: "missed" }
  | { kind: "pending" } // today, not done yet
  | { kind: "unscheduled" };

/**
 * A month of the habit's history as a heatmap. The last week's days can be tapped to fix a
 * forgotten (or mistaken) check-off.
 */
export function HabitCalendar({ habit, today, weekStartDay }: Props) {
  const [month, setMonth] = useState(monthOf(today));
  const days = daysOfMonth(month);
  const queryClient = useQueryClient();
  const toast = useToast();
  const monthKey = queryKeys.habitMonth(habit.id, month);

  const completions = useQuery({
    queryKey: monthKey,
    queryFn: () => habitsApi.completions(habit.id, days[0]!, days.at(-1)!),
  });

  const toggle = useMutation({
    mutationFn: async ({ date, done }: { date: string; done: boolean }) => {
      if (done) await completionsApi.remove(habit.id, date);
      else await completionsApi.set(habit.id, { date, value: habit.targetValue });
    },
    onMutate: async ({ date, done }) => {
      await queryClient.cancelQueries({ queryKey: monthKey });
      const previous = queryClient.getQueryData<Completion[]>(monthKey);
      queryClient.setQueryData<Completion[]>(monthKey, (list = []) =>
        done
          ? list.filter((c) => c.date !== date)
          : [...list.filter((c) => c.date !== date), { date, value: habit.targetValue, note: null }],
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(monthKey, context?.previous);
      toast({ message: `Couldn't update that day. ${errorMessage(error)}`, tone: "error" });
    },
    onSettled: () => {
      // Streaks, rates, Today and the overview all depend on this.
      void queryClient.invalidateQueries({ queryKey: queryKeys.habit(habit.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });

  const byDate = new Map((completions.data ?? []).map((c) => [c.date, c]));
  const earliestEditable = addDays(today, -BACKFILL_DAYS);
  const leadingBlanks = (weekdayOf(days[0]!) - weekStartDay + 7) % 7;

  const stateOf = (date: string): DayState => {
    if (date < habit.startDate || date > today) return { kind: "outside" };
    const completion = byDate.get(date);
    if (completion) {
      const target = habit.targetValue;
      if (target === null || (completion.value ?? 0) >= target) return { kind: "done" };
      return { kind: "partial", value: completion.value ?? 0 };
    }
    const scheduled = habit.frequency !== "WEEKDAYS" || habit.targetWeekdays.includes(weekdayOf(date));
    if (!scheduled) return { kind: "unscheduled" };
    return date === today ? { kind: "pending" } : { kind: "missed" };
  };

  const describe = (state: DayState): string => {
    switch (state.kind) {
      case "outside":
        return "no data";
      case "done":
        return "done";
      case "partial":
        return `${state.value} of ${habit.targetValue}${habit.unit ? ` ${habit.unit}` : ""}`;
      case "missed":
        return habit.frequency === "TIMES_PER_WEEK" ? "not done" : "missed";
      case "pending":
        return "not done yet";
      case "unscheduled":
        return "not scheduled";
    }
  };

  return (
    <section aria-labelledby="calendar-heading" className="rounded-card border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="calendar-heading" className="text-subheading font-semibold">
          {formatMonth(month)}
        </h2>
        <div className="flex gap-1">
          <MonthButton label="Previous month" disabled={month <= monthOf(habit.startDate)} onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft size={20} aria-hidden="true" />
          </MonthButton>
          <MonthButton label="Next month" disabled={month >= monthOf(today)} onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight size={20} aria-hidden="true" />
          </MonthButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1" aria-hidden="true">
        {weekdayOrder(weekStartDay).map((d) => (
          <div key={d} className="pb-1 text-center text-caption text-muted">
            {WEEKDAY_NAMES[d]}
          </div>
        ))}
      </div>

      <ol className={clsx("grid grid-cols-7 gap-1", completions.isPending && "animate-pulse opacity-60")} aria-busy={completions.isPending}>
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <li key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((date) => {
          const state = completions.isPending ? ({ kind: "outside" } as const) : stateOf(date);
          const done = state.kind === "done";
          const editable = !habit.archived && !completions.isPending && date >= earliestEditable && date <= today && date >= habit.startDate;
          const label = `${formatLongDate(date)}: ${describe(state)}`;
          const cell = (
            <DayCell date={date} state={state} color={habit.color} target={habit.targetValue} isToday={date === today} />
          );
          return (
            <li key={date}>
              {editable ? (
                <button
                  type="button"
                  aria-label={`${label}. Tap to ${done ? "undo" : "mark done"}`}
                  aria-pressed={done}
                  // A done day clears; anything else (including a partial amount) fills to the goal.
                  onClick={() => toggle.mutate({ date, done })}
                  className="block w-full rounded-control"
                >
                  {cell}
                </button>
              ) : (
                <div role="img" aria-label={label}>
                  {cell}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted">
        <LegendSwatch style={{ backgroundColor: habit.color }} label="Done" />
        {habit.targetValue !== null && <LegendSwatch style={{ backgroundColor: `${habit.color}59` }} label="Partly" />}
        <LegendSwatch className="bg-surface-2" label="Not done" />
      </div>
      {!habit.archived && (
        <p className="mt-2 text-caption text-muted">Forgot to tick a day? Tap any of the last {BACKFILL_DAYS} days to fix it.</p>
      )}
    </section>
  );
}

function DayCell({ date, state, color, target, isToday }: { date: string; state: DayState; color: string; target: number | null; isToday: boolean }) {
  const dayNumber = Number(date.slice(8));
  // Partial amounts shade from light to nearly full, so the heatmap shows how close the day came.
  const partialAlpha = state.kind === "partial" && target ? Math.round(20 + (state.value / target) * 50) : 0;
  return (
    <span
      className={clsx(
        "flex h-11 flex-col items-center justify-center rounded-control text-caption",
        state.kind === "done" && "font-semibold text-white",
        (state.kind === "missed" || state.kind === "pending") && "bg-surface-2",
        (state.kind === "outside" || state.kind === "unscheduled") && "text-muted opacity-60",
        isToday && "ring-2 ring-text ring-offset-1 ring-offset-surface",
      )}
      style={
        state.kind === "done"
          ? { backgroundColor: color }
          : state.kind === "partial"
            ? { backgroundColor: `${color}${Math.round((partialAlpha / 100) * 255).toString(16).padStart(2, "0")}` }
            : undefined
      }
    >
      {dayNumber}
      {state.kind === "done" && <Check size={12} strokeWidth={3} aria-hidden="true" />}
    </span>
  );
}

function MonthButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-control hover:bg-surface-2 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function LegendSwatch({ label, className, style }: { label: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("size-3.5 rounded", className)} style={style} aria-hidden="true" />
      {label}
    </span>
  );
}
