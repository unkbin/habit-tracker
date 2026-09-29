import type { Tally } from "../../api/types";
import { WEEKDAY_NAMES, weekdayOrder } from "../../lib/dates";

type WeekdayTally = Tally & { weekday: number };

export const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

const longWeekday = (d: number) =>
  new Date(Date.UTC(1970, 0, 4 + d)).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });

/** Best and worst rated weekdays, or null when fewer than two have data or all rates are equal. */
export function bestAndWorst(rows: WeekdayTally[]): { best: WeekdayTally; worst: WeekdayTally } | null {
  const rated = rows.filter((r) => r.rate !== null);
  if (rated.length < 2) return null;
  const best = rated.reduce((a, b) => (b.rate! > a.rate! ? b : a));
  const worst = rated.reduce((a, b) => (b.rate! < a.rate! ? b : a));
  return best.rate === worst.rate ? null : { best, worst };
}

export function consistencySentence(rows: WeekdayTally[]): string | null {
  const extremes = bestAndWorst(rows);
  return extremes
    ? `Most consistent on ${longWeekday(extremes.best.weekday)}s, least on ${longWeekday(extremes.worst.weekday)}s.`
    : null;
}

/**
 * Completion rate per weekday as a bar list: a label, a thin bar and the value at its tip.
 * It reads like a table, so every value is visible without hovering. Weekdays with nothing
 * scheduled are left out.
 */
export function WeekdayBars({ rows, weekStartDay, color = "var(--c-chart)" }: { rows: WeekdayTally[]; weekStartDay: number; color?: string }) {
  const byDay = new Map(rows.map((r) => [r.weekday, r]));
  const ordered = weekdayOrder(weekStartDay)
    .map((d) => byDay.get(d))
    .filter((r): r is WeekdayTally => r !== undefined && r.rate !== null);

  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((row) => (
        <li key={row.weekday} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-caption">
          <span className="text-muted">{WEEKDAY_NAMES[row.weekday]}</span>
          <span className="h-2.5 overflow-hidden bg-surface-2" aria-hidden="true">
            {/* Square at the baseline, 4px rounded at the data end. */}
            <span className="block h-full rounded-r-[4px]" style={{ width: `${row.rate! * 100}%`, backgroundColor: color }} />
          </span>
          <span className="text-right font-medium tabular-nums">
            {percent(row.rate)}
            <span className="sr-only">
              {" "}
              ({row.completed} of {row.expected})
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
