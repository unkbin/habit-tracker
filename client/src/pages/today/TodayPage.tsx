import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, PartyPopper, Plus, Sprout } from "lucide-react";
import { Link } from "react-router";
import { errorMessage } from "../../api/client";
import { habitsApi, queryKeys, todayApi } from "../../api/endpoints";
import { useUser } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/AppLayout";
import { ProgressRing } from "../../components/ui/ProgressRing";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useCelebrations } from "../../hooks/useCelebrations";
import { useCheckOff } from "../../hooks/useCheckOff";
import { formatLongDate } from "../../lib/dates";
import { TodayHabitCard } from "./TodayHabitCard";

const newHabitLink =
  "inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover";

export function TodayPage() {
  const user = useUser();
  // "Today" comes from the server in the user's timezone. Refetching every few minutes (and on
  // focus, TanStack's default) rolls the screen over after midnight.
  const today = useQuery({ queryKey: queryKeys.today, queryFn: todayApi.get, refetchInterval: 5 * 60_000 });
  const checkOff = useCheckOff();
  useCelebrations(today.data);

  const greeting = user.name ? `Hi, ${user.name}` : "Today";

  if (today.isPending) return <TodaySkeleton title={greeting} />;
  if (today.isError) {
    return (
      <>
        <PageHeader title={greeting} />
        <ErrorState message={errorMessage(today.error)} onRetry={() => void today.refetch()} />
      </>
    );
  }

  const { date, summary, habits } = today.data;
  const allDone = summary.total > 0 && summary.completed === summary.total;

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={formatLongDate(date)}
        action={
          <Link
            to="/habits/new"
            aria-label="New habit"
            className="flex size-11 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary-hover"
          >
            <Plus size={22} aria-hidden="true" />
          </Link>
        }
      />

      {habits.length === 0 ? (
        <NothingDue />
      ) : (
        <>
          <section aria-label="Today's progress" className="mb-6 flex items-center gap-4 rounded-card bg-surface p-4">
            <ProgressRing completed={summary.completed} total={summary.total} />
            <div>
              {allDone ? (
                <>
                  <p className="flex items-center gap-2 text-subheading font-semibold">
                    <PartyPopper size={20} className="text-primary" aria-hidden="true" /> All done for today
                  </p>
                  <p className="text-body text-muted">Nice work. See you tomorrow.</p>
                </>
              ) : (
                <>
                  <p className="text-subheading font-semibold">
                    {summary.completed === 0 ? "Let's get started" : `${summary.total - summary.completed} to go`}
                  </p>
                  <p className="text-body text-muted">Tap a circle when you've done a habit.</p>
                </>
              )}
            </div>
          </section>

          <ul className="flex flex-col gap-3" aria-label="Habits due today">
            {habits.map((item) => (
              <TodayHabitCard key={item.habit.id} item={item} onAction={(action) => checkOff(item.habit.id, date, action)} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** Nothing on today's list: either no habits at all, or none scheduled today. */
function NothingDue() {
  const habits = useQuery({ queryKey: queryKeys.allHabits, queryFn: () => habitsApi.list("all") });
  if (habits.isPending) return <Skeleton className="h-48" />;

  if (habits.data?.some((h) => !h.archived)) {
    return (
      <EmptyState
        icon={<CalendarCheck size={36} />}
        title="Nothing due today"
        body="None of your habits are scheduled for today. Enjoy the rest day."
        action={<Link to="/habits" className="font-semibold text-primary">See all habits</Link>}
      />
    );
  }
  return (
    <EmptyState
      icon={<Sprout size={36} />}
      title="Start your first habit"
      body="Small things done every day add up. Try something easy, like drinking a glass of water."
      action={
        <Link to="/habits/new" className={newHabitLink}>
          <Plus size={20} aria-hidden="true" /> New habit
        </Link>
      }
    />
  );
}

function TodaySkeleton({ title }: { title: string }) {
  return (
    <div aria-busy="true" aria-label="Loading today's habits">
      <PageHeader title={title} />
      <Skeleton className="mb-6 h-28" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}
