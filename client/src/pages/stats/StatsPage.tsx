import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChartColumn, ChevronRight, Flame, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { errorMessage } from "../../api/client";
import { queryKeys, statsApi } from "../../api/endpoints";
import type { StatsOverview } from "../../api/types";
import { useUser } from "../../auth/useAuth";
import { RateColumnChart, type RatePoint } from "../../components/charts/RateColumnChart";
import { consistencySentence, percent, WeekdayBars } from "../../components/charts/WeekdayBars";
import { HabitIcon } from "../../components/HabitIcon";
import { PageHeader } from "../../components/layout/AppLayout";
import { StaleNotice } from "../../components/ui/StaleNotice";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";

type Period = "weeks" | "months";

export function StatsPage() {
  const overview = useQuery({ queryKey: queryKeys.statsOverview, queryFn: statsApi.overview });
  const header = <PageHeader title="Statistics" />;

  if (overview.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading statistics">
        {header}
        <Skeleton className="mb-4 h-40" />
        <Skeleton className="mb-4 h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (!overview.data) {
    return (
      <>
        {header}
        <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />
      </>
    );
  }

  const data = overview.data;
  if (data.habits.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<ChartColumn size={36} />}
          title="No statistics yet"
          body="Add a habit and check it off for a few days. Your progress will show up here."
          action={
            <Link to="/habits/new" className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover">
              <Plus size={20} aria-hidden="true" /> New habit
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      {overview.isError && <StaleNotice onRetry={() => void overview.refetch()} />}
      {/* Refetches (e.g. after a check-off elsewhere) keep the current render, slightly faded. */}
      <div className={clsx("flex flex-col gap-4 transition-opacity", overview.isFetching && "opacity-70")}>
        <Summary data={data} />
        <CompletionChart data={data} />
        <Weekdays data={data} />
        <HabitRanking data={data} />
      </div>
    </>
  );
}

function Card({ title, subtitle, children, id }: { title: string; subtitle?: string | null; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-border bg-surface p-4">
      <h2 id={id} className="text-subheading font-semibold">
        {title}
      </h2>
      {subtitle && <p className="text-caption text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Summary({ data }: { data: StatsOverview }) {
  const { completionRate, totalCompletions } = data;
  return (
    <section aria-label="Summary" className="rounded-card border border-border bg-surface p-4">
      <p className="text-caption text-muted">Last 30 days</p>
      {/* The one hero figure on this screen. */}
      <p className="text-[3rem] leading-none font-semibold">{percent(completionRate.last30)}</p>
      <p className="mt-1 text-caption text-muted">of scheduled check-ins done, across all active habits</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
        <Tile label="Last 7 days" value={percent(completionRate.last7)} />
        <Tile label="Last 90 days" value={percent(completionRate.last90)} />
        <Tile label="Total done" value={totalCompletions.toLocaleString()} />
      </dl>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="text-subheading font-semibold">{value}</dd>
    </div>
  );
}

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const monthName = (month: string, style: "short" | "long") =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: style,
    ...(style === "long" && { year: "numeric" }),
    timeZone: "UTC",
  });

function CompletionChart({ data }: { data: StatsOverview }) {
  const [period, setPeriod] = useState<Period>("weeks");
  const points: RatePoint[] =
    period === "weeks"
      ? data.weeks.map((w, i) => ({
          key: w.weekStart,
          label: i === data.weeks.length - 1 ? `This week (from ${shortDate(w.weekStart)})` : `Week of ${shortDate(w.weekStart)}`,
          tick: shortDate(w.weekStart),
          ...w,
        }))
      : data.months.map((m) => ({ key: m.month, label: monthName(m.month, "long"), tick: monthName(m.month, "short"), ...m }));

  return (
    <section aria-labelledby="completion-heading" className="rounded-card border border-border bg-surface p-4">
      {/* The period control sits above the chart it scopes, in one row with the title. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 id="completion-heading" className="text-subheading font-semibold">
            Completion rate
          </h2>
          <p className="text-caption text-muted">{period === "weeks" ? "Last 12 weeks" : "Last 6 months"}</p>
        </div>
        <div role="radiogroup" aria-label="Group by" className="grid grid-cols-2 gap-1 rounded-control bg-surface-2 p-1">
          {(["weeks", "months"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={clsx(
                "min-h-9 rounded-[0.6rem] px-3 text-caption font-medium",
                period === p ? "bg-surface text-text shadow-sm" : "text-muted",
              )}
            >
              {p === "weeks" ? "Weeks" : "Months"}
            </button>
          ))}
        </div>
      </div>
      <RateColumnChart
        key={period}
        data={points}
        tickEvery={period === "weeks" ? 3 : 1}
        title={`Completion rate, ${period === "weeks" ? "last 12 weeks" : "last 6 months"}`}
      />
    </section>
  );
}

function Weekdays({ data }: { data: StatsOverview }) {
  const user = useUser();
  if (data.byWeekday.filter((d) => d.rate !== null).length < 2) return null;
  return (
    <Card id="weekday-heading" title="By day of the week" subtitle={consistencySentence(data.byWeekday) ?? "Last 90 days"}>
      <WeekdayBars rows={data.byWeekday} weekStartDay={user.weekStartDay} />
    </Card>
  );
}

function HabitRanking({ data }: { data: StatsOverview }) {
  return (
    <Card id="habits-heading" title="Your habits" subtitle="Ranked by the last 30 days">
      <ol className="-mx-2 flex flex-col">
        {data.habits.map((habit) => (
          <li key={habit.id}>
            <Link to={`/habits/${habit.id}`} className="flex min-h-14 items-center gap-3 rounded-control px-2 py-2 hover:bg-surface-2">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-control"
                style={{ backgroundColor: `${habit.color}26`, color: habit.color }}
              >
                <HabitIcon name={habit.icon} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-body font-medium">{habit.name}</span>
                  <span className="shrink-0 text-body font-semibold tabular-nums">{percent(habit.rate30)}</span>
                </span>
                {/* Meter: the same data colour for every habit; the icon and name carry identity. */}
                <span className="mt-1 block h-1.5 overflow-hidden bg-surface-2" aria-hidden="true">
                  <span className="block h-full rounded-r-[4px] bg-chart" style={{ width: `${(habit.rate30 ?? 0) * 100}%` }} />
                </span>
                {habit.streak.current > 0 && (
                  <span className="mt-1 flex items-center gap-1 text-caption text-muted">
                    <Flame size={13} className="text-warning" aria-hidden="true" />
                    {habit.streak.current} {habit.streak.unit === "days" ? "day" : "week"}
                    {habit.streak.current === 1 ? "" : "s"}
                    <span className="sr-only"> streak</span>
                  </span>
                )}
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
