import clsx from "clsx";
import { Check, Flame, Plus } from "lucide-react";
import { Link } from "react-router";
import type { TodayItem } from "../../api/types";
import { HabitIcon } from "../../components/HabitIcon";
import type { CheckOffAction } from "../../hooks/useCheckOff";

interface Props {
  item: TodayItem;
  onAction: (action: CheckOffAction) => void;
}

export function TodayHabitCard({ item, onAction }: Props) {
  const { habit, done } = item;
  const measured = habit.targetValue !== null;
  const value = item.value ?? 0;

  return (
    <li className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
      <Link
        to={`/habits/${habit.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-control"
        aria-label={`${habit.name}: details`}
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-control"
          style={{ backgroundColor: `${habit.color}26`, color: habit.color }}
        >
          <HabitIcon name={habit.icon} />
        </span>
        <span className="min-w-0">
          <span className={clsx("block truncate text-body font-medium", done && "text-muted line-through decoration-1")}>
            {habit.name}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-caption text-muted">
            <StatusLine item={item} />
          </span>
          {measured && (
            <span
              className="mt-1.5 block h-1.5 w-32 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label={`${habit.name} progress`}
              aria-valuemin={0}
              aria-valuemax={habit.targetValue!}
              aria-valuenow={value}
            >
              <span
                className="block h-full rounded-full transition-[width] duration-300"
                style={{ width: `${Math.min(100, (value / habit.targetValue!) * 100)}%`, backgroundColor: habit.color }}
              />
            </span>
          )}
        </span>
      </Link>

      {measured && !done && (
        <button
          type="button"
          onClick={() => onAction({ kind: "increment" })}
          aria-label={`Add 1 ${habit.unit ?? ""} to ${habit.name}`.replace("  ", " ")}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-2"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        onClick={() => onAction({ kind: "toggle" })}
        aria-pressed={done}
        aria-label={done ? `${habit.name}: done. Tap to undo` : `Mark ${habit.name} done`}
        className={clsx(
          "flex size-14 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done ? "animate-pop border-transparent text-white" : "border-border text-transparent hover:border-muted",
        )}
        style={done ? { backgroundColor: habit.color } : undefined}
      >
        <Check size={28} strokeWidth={3} aria-hidden="true" />
      </button>
    </li>
  );
}

function StatusLine({ item }: { item: TodayItem }) {
  const { habit, streak, weekProgress } = item;
  const parts: React.ReactNode[] = [];

  if (habit.targetValue !== null) {
    parts.push(`${item.value ?? 0} / ${habit.targetValue}${habit.unit ? ` ${habit.unit}` : ""}`);
  }
  if (weekProgress) {
    parts.push(`${weekProgress.done} of ${weekProgress.target} this week`);
  }
  if (streak.current > 0) {
    parts.push(
      <span key="streak" className="inline-flex items-center gap-0.5">
        <Flame size={14} className="text-warning" aria-hidden="true" />
        {streak.current} {streak.unit === "days" ? (streak.current === 1 ? "day" : "days") : streak.current === 1 ? "week" : "weeks"}
        <span className="sr-only"> streak</span>
      </span>,
    );
  }
  if (parts.length === 0) parts.push(item.done ? "Done" : "Not done yet");

  return (
    <>
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-2 whitespace-nowrap">
          {i > 0 && <span aria-hidden="true">·</span>}
          {part}
        </span>
      ))}
    </>
  );
}
