import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowLeft, Flame, Pencil, SearchX, Trash2, Trophy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ApiError, errorMessage } from "../../api/client";
import { habitsApi, queryKeys } from "../../api/endpoints";
import type { Habit, HabitStats, Streak } from "../../api/types";
import { useUser } from "../../auth/useAuth";
import { consistencySentence, percent, WeekdayBars } from "../../components/charts/WeekdayBars";
import { HabitIcon } from "../../components/HabitIcon";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { StaleNotice } from "../../components/ui/StaleNotice";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { todayIn } from "../../lib/dates";
import { describeSchedule, describeTarget } from "../../lib/habits";
import { HabitCalendar } from "./HabitCalendar";

export function HabitDetailPage() {
  const { id = "" } = useParams();
  const user = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const habit = useQuery({ queryKey: queryKeys.habit(id), queryFn: () => habitsApi.get(id) });
  const stats = useQuery({ queryKey: queryKeys.habitStats(id), queryFn: () => habitsApi.stats(id) });

  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/habits"));
  const backButton = (
    <button
      type="button"
      onClick={back}
      aria-label="Back"
      className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-control hover:bg-surface-2"
    >
      <ArrowLeft size={22} aria-hidden="true" />
    </button>
  );

  if (habit.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading habit">
        <div className="mb-6 flex items-center gap-2">{backButton}</div>
        <Skeleton className="mb-4 h-16" />
        <div className="mb-4 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }
  if (!habit.data) {
    const notFound = habit.error instanceof ApiError && habit.error.status === 404;
    return (
      <>
        <div className="mb-6 flex items-center gap-2">{backButton}</div>
        {notFound ? (
          <EmptyState
            icon={<SearchX size={36} />}
            title="Habit not found"
            body="It may have been deleted."
            action={<Link to="/habits" className="font-semibold text-primary">See all habits</Link>}
          />
        ) : (
          <ErrorState message={errorMessage(habit.error)} onRetry={() => void habit.refetch()} />
        )}
      </>
    );
  }

  const h = habit.data;
  const target = describeTarget(h);
  return (
    <>
      <header className="mb-4 flex items-start gap-2">
        {backButton}
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-control"
          style={{ backgroundColor: `${h.color}26`, color: h.color }}
        >
          <HabitIcon name={h.icon} />
        </span>
        <div className="min-w-0">
          <h1 className="text-heading font-semibold break-words">{h.name}</h1>
          <p className="text-caption text-muted">
            {describeSchedule(h, user.weekStartDay)}
            {target && ` · ${target}`}
            {h.reminderTime && ` · Reminder at ${h.reminderTime}`}
          </p>
        </div>
      </header>

      {h.description && <p className="mb-4 text-body text-muted">{h.description}</p>}

      {(habit.isError || stats.isError) && (
        <StaleNotice
          onRetry={() => {
            void habit.refetch();
            void stats.refetch();
          }}
        />
      )}

      <Actions habit={h} onDeleted={() => navigate("/habits", { replace: true })} />

      {h.archived && (
        <p role="status" className="mb-4 rounded-control bg-surface-2 px-4 py-3 text-body">
          This habit is archived. It's hidden from Today and its streak is paused until you restore it.
        </p>
      )}

      {stats.isPending ? (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !stats.data ? (
        <div className="mb-4">
          <ErrorState message={errorMessage(stats.error)} onRetry={() => void stats.refetch()} />
        </div>
      ) : (
        <StatsSummary stats={stats.data} />
      )}

      <HabitCalendar habit={h} today={todayIn(user.timezone)} weekStartDay={user.weekStartDay} />

      {stats.data && <WeekdayChart stats={stats.data} habit={h} weekStartDay={user.weekStartDay} />}
    </>
  );
}

function Actions({ habit, onDeleted }: { habit: Habit; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.habits }),
      queryClient.invalidateQueries({ queryKey: queryKeys.today }),
      queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
    ]);

  const setArchived = useMutation({
    mutationFn: (archived: boolean) => habitsApi.update(habit.id, { archived }),
    onSuccess: (updated) => {
      void refreshAll();
      toast(
        updated.archived
          ? { message: `Archived ${habit.name}`, action: { label: "Undo", onClick: () => setArchived.mutate(false) } }
          : { message: `Restored ${habit.name}` },
      );
    },
    onError: (error) => toast({ message: errorMessage(error), tone: "error" }),
  });

  const remove = useMutation({
    mutationFn: () => habitsApi.remove(habit.id),
    onSuccess: () => {
      setConfirmingDelete(false);
      onDeleted();
      // After leaving the page, so its queries don't refetch a habit that no longer exists.
      queryClient.removeQueries({ queryKey: queryKeys.habit(habit.id) });
      void refreshAll();
      toast({ message: `Deleted ${habit.name}` });
    },
    onError: (error) => toast({ message: `Couldn't delete. ${errorMessage(error)}`, tone: "error" }),
  });

  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      <Link
        to={`/habits/${habit.id}/edit`}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-border bg-surface px-3 font-medium hover:bg-surface-2"
      >
        <Pencil size={18} aria-hidden="true" /> Edit
      </Link>
      <Button variant="secondary" loading={setArchived.isPending} onClick={() => setArchived.mutate(!habit.archived)}>
        {habit.archived ? <ArchiveRestore size={18} aria-hidden="true" /> : <Archive size={18} aria-hidden="true" />}
        {habit.archived ? "Restore" : "Archive"}
      </Button>
      <Button variant="secondary" className="text-danger" onClick={() => setConfirmingDelete(true)}>
        <Trash2 size={18} aria-hidden="true" /> Delete
      </Button>

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete ${habit.name}?`}
        confirmLabel="Delete habit"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmingDelete(false)}
      >
        This permanently deletes the habit and its whole history. It can't be undone.
        {!habit.archived && " To hide it but keep the history, archive it instead."}
      </ConfirmDialog>
    </div>
  );
}


function streakText(streak: Streak, value: number) {
  const unit = streak.unit === "days" ? "day" : "week";
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function StatsSummary({ stats }: { stats: HabitStats }) {
  const { streak, completionRate, totalCompletions, weekProgress } = stats;
  return (
    <section aria-label="Progress" className="mb-4 flex flex-col gap-3">
      {weekProgress && (
        <div className="rounded-card border border-border bg-surface p-4">
          <p className="text-caption text-muted">This week</p>
          <p className="text-subheading font-semibold">
            {weekProgress.done} of {weekProgress.target} done
          </p>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="This week's progress"
            aria-valuemin={0}
            aria-valuemax={weekProgress.target}
            aria-valuenow={weekProgress.done}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${weekProgress.target ? Math.min(100, (weekProgress.done / weekProgress.target) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Flame size={18} className="text-warning" aria-hidden="true" />} label="Current streak" value={streakText(streak, streak.current)} />
        <StatCard icon={<Trophy size={18} className="text-warning" aria-hidden="true" />} label="Longest streak" value={streakText(streak, streak.longest)} />
        <StatCard
          label="Last 30 days"
          value={percent(completionRate.last30)}
          detail={`7 days ${percent(completionRate.last7)} · 90 days ${percent(completionRate.last90)}`}
        />
        <StatCard label="Total completions" value={String(totalCompletions)} />
      </div>
    </section>
  );
}

function StatCard({ icon, label, value, detail }: { icon?: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="flex items-center gap-1.5 text-caption text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-heading font-semibold">{value}</p>
      {detail && <p className="text-caption text-muted">{detail}</p>}
    </div>
  );
}

function WeekdayChart({ stats, habit, weekStartDay }: { stats: HabitStats; habit: Habit; weekStartDay: number }) {
  if (stats.byWeekday.filter((d) => d.rate !== null).length < 2) return null;
  const sentence = consistencySentence(stats.byWeekday);
  return (
    <section aria-labelledby="weekday-heading" className="mt-4 rounded-card border border-border bg-surface p-4">
      <h2 id="weekday-heading" className="text-subheading font-semibold">
        By day of the week
      </h2>
      {sentence && <p className="mb-3 text-caption text-muted">{sentence}</p>}
      {/* The habit's own colour: on this page it is the only thing being plotted. */}
      <WeekdayBars rows={stats.byWeekday} weekStartDay={weekStartDay} color={habit.color} />
    </section>
  );
}
