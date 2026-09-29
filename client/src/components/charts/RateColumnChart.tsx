import clsx from "clsx";
import { useId, useState } from "react";
import { percent } from "./WeekdayBars";

export interface RatePoint {
  key: string;
  /** Full name, for the tooltip and table: "Week of 21 Sep". */
  label: string;
  /** Short axis label: "21 Sep", "Apr". */
  tick: string;
  rate: number | null;
  completed: number;
  expected: number;
}

const PLOT_HEIGHT = 160;
const GRID = [1, 0.5, 0];

/**
 * Completion rate per period as columns on a 0-100% scale. Marks follow the dataviz spec:
 * columns capped at 24px with a 4px rounded top and square baseline, hairline solid grid,
 * the latest value labelled directly, and a tooltip on hover and keyboard focus. Every value
 * is also in the table view, so the tooltip never gates anything.
 */
export function RateColumnChart({ data, tickEvery = 1, title }: { data: RatePoint[]; tickEvery?: number; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const tooltipId = useId();
  const lastRated = data.findLastIndex((d) => d.rate !== null);

  return (
    <figure>
      <div className="relative select-none" style={{ height: PLOT_HEIGHT + 24 }}>
        {/* Gridlines with their y labels. */}
        {GRID.map((g) => (
          <div
            key={g}
            aria-hidden="true"
            className="absolute right-0 left-0 flex items-center gap-2"
            style={{ top: (1 - g) * PLOT_HEIGHT, transform: "translateY(-50%)" }}
          >
            <span className="w-9 text-right text-caption text-muted tabular-nums">{g * 100}%</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        ))}

        <div className="absolute top-0 right-0 left-11 flex" style={{ height: PLOT_HEIGHT }} onPointerLeave={() => setActive(null)}>
          {data.map((point, i) => {
            const isActive = active === i;
            return (
              <button
                key={point.key}
                type="button"
                // The whole column is the hit target, not just the painted bar.
                className="relative flex h-full flex-1 flex-col items-center justify-end outline-none focus-visible:bg-surface-2"
                aria-label={`${point.label}: ${describe(point)}`}
                aria-describedby={isActive ? tooltipId : undefined}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {i === lastRated && point.rate !== null && (
                  <span className="mb-1 text-caption font-semibold text-text" aria-hidden="true">
                    {percent(point.rate)}
                  </span>
                )}
                {point.rate !== null && (
                  <span
                    aria-hidden="true"
                    className={clsx("block rounded-t-[4px] bg-chart transition-opacity", active !== null && !isActive && "opacity-60")}
                    style={{ width: "min(24px, 60%)", height: `${Math.max(point.rate * 100, point.rate > 0 ? 2 : 0)}%` }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* X axis labels, spaced out so they never collide. */}
        <div className="absolute right-0 left-11 flex" style={{ top: PLOT_HEIGHT + 4 }} aria-hidden="true">
          {data.map((point, i) => (
            <span key={point.key} className="flex-1 text-center text-caption whitespace-nowrap text-muted">
              {i % tickEvery === (data.length - 1) % tickEvery ? point.tick : ""}
            </span>
          ))}
        </div>

        {active !== null && data[active] && (
          <div
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none absolute z-10 rounded-control border border-border bg-surface px-3 py-2 shadow-lg"
            style={{
              bottom: PLOT_HEIGHT + 24 - PLOT_HEIGHT * (1 - (data[active].rate ?? 0)) + 8,
              left: `calc(2.75rem + (100% - 2.75rem) * ${(active + 0.5) / data.length})`,
              // Keep the tooltip inside the chart near either edge.
              transform: `translateX(${active < 2 ? "-15%" : active > data.length - 3 ? "-85%" : "-50%"})`,
            }}
          >
            <p className="text-body font-semibold whitespace-nowrap">{percent(data[active].rate)}</p>
            <p className="text-caption whitespace-nowrap text-muted">{data[active].label}</p>
            {data[active].expected > 0 && (
              <p className="text-caption whitespace-nowrap text-muted">{checkIns(data[active])}</p>
            )}
          </div>
        )}
      </div>

      <figcaption className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowTable((s) => !s)}
          aria-expanded={showTable}
          className="min-h-11 px-2 text-caption font-medium text-primary underline-offset-2 hover:underline"
        >
          {showTable ? "Hide table" : "Show as table"}
        </button>
      </figcaption>

      {showTable && (
        <table className="w-full text-caption">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th scope="col" className="py-2 font-medium">Period</th>
              <th scope="col" className="py-2 text-right font-medium">Done</th>
              <th scope="col" className="py-2 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.map((point) => (
              <tr key={point.key} className="border-b border-border last:border-0">
                <th scope="row" className="py-2 text-left font-normal">{point.label}</th>
                <td className="py-2 text-right">
                  {point.expected > 0 ? checkIns(point) : "–"}
                </td>
                <td className="py-2 text-right font-medium">{percent(point.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}

// Weekly habits are expected pro rata (3 a week over 6 days = 2.571 check-ins), so counts can be
// fractional. People read whole check-ins, so round and say "about" when rounding happened.
function checkIns(point: RatePoint): string {
  const exact = Number.isInteger(point.completed) && Number.isInteger(point.expected);
  return `${exact ? "" : "about "}${Math.round(point.completed)} of ${Math.round(point.expected)} check-ins`;
}

function describe(point: RatePoint): string {
  if (point.rate === null) return "nothing scheduled";
  return `${percent(point.rate)}, ${checkIns(point)}`;
}
