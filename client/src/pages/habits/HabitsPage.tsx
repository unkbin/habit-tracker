import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Archive, ArrowDown, ArrowUp, ChevronRight, Plus, Sprout } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "../../api/client";
import { habitsApi, queryKeys } from "../../api/endpoints";
import type { Habit } from "../../api/types";
import { useUser } from "../../auth/AuthProvider";
import { HabitIcon } from "../../components/HabitIcon";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { describeSchedule, describeTarget } from "../../lib/habits";

const newHabitButton =
  "flex size-11 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary-hover";

export function HabitsPage() {
  const [params] = useSearchParams();
  const view = params.get("view") === "archived" ? "archived" : "active";
  const habits = useQuery({ queryKey: queryKeys.allHabits, queryFn: () => habitsApi.list("all") });
  // Non-null while reordering: the working order, saved only when the user taps Done.
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);

  const header = (
    <PageHeader
      title="Habits"
      action={
        !draftOrder && (
          <Link to="/habits/new" aria-label="New habit" className={newHabitButton}>
            <Plus size={22} aria-hidden="true" />
          </Link>
        )
      }
    />
  );

  if (habits.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading habits">
        {header}
        <Skeleton className="mb-4 h-12" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-18" />
          ))}
        </div>
      </div>
    );
  }
  if (habits.isError) {
    return (
      <>
        {header}
        <ErrorState message={errorMessage(habits.error)} onRetry={() => void habits.refetch()} />
      </>
    );
  }

  const active = habits.data.filter((h) => !h.archived);
  const archived = habits.data.filter((h) => h.archived);

  return (
    <>
      {header}
      {!draftOrder && <ViewSwitch view={view} activeCount={active.length} archivedCount={archived.length} />}
      {view === "active" ? (
        <ActiveList habits={active} draftOrder={draftOrder} setDraftOrder={setDraftOrder} />
      ) : (
        <ArchivedList habits={archived} />
      )}
    </>
  );
}

function ViewSwitch({ view, activeCount, archivedCount }: { view: string; activeCount: number; archivedCount: number }) {
  const tab = (to: string, label: string, count: number, current: boolean) => (
    <Link
      to={to}
      replace
      aria-current={current ? "page" : undefined}
      className={clsx(
        "flex min-h-11 items-center justify-center gap-1.5 rounded-[0.6rem] text-body font-medium",
        current ? "bg-surface text-text shadow-sm" : "text-muted",
      )}
    >
      {label}
      <span className="text-caption text-muted">{count}</span>
    </Link>
  );
  return (
    <nav aria-label="Habit lists" className="mb-4 grid grid-cols-2 gap-1 rounded-control bg-surface-2 p-1">
      {tab("/habits", "Active", activeCount, view === "active")}
      {tab("/habits?view=archived", "Archived", archivedCount, view === "archived")}
    </nav>
  );
}

function ActiveList({
  habits,
  draftOrder,
  setDraftOrder,
}: {
  habits: Habit[];
  draftOrder: string[] | null;
  setDraftOrder: (order: string[] | null) => void;
}) {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [announcement, setAnnouncement] = useState("");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focusAfterMove, setFocusAfterMove] = useState<string | null>(null);

  // Moving a row re-inserts its DOM node, which drops focus; put it back on the same button
  // (or its partner, if the row reached the end and that button is now disabled).
  useEffect(() => {
    if (!focusAfterMove) return;
    const button = buttons.current.get(focusAfterMove);
    const [id, direction] = focusAfterMove.split(":");
    const target = button && !button.disabled ? button : buttons.current.get(`${id}:${direction === "up" ? "down" : "up"}`);
    target?.focus();
    setFocusAfterMove(null);
  }, [focusAfterMove]);

  const saveOrder = useMutation({
    mutationFn: (ids: string[]) => habitsApi.reorder(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.allHabits });
      const previous = queryClient.getQueryData<Habit[]>(queryKeys.allHabits);
      if (previous) {
        const position = new Map(ids.map((id, i) => [id, i]));
        queryClient.setQueryData(
          queryKeys.allHabits,
          [...previous].sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity)),
        );
      }
      return { previous };
    },
    onError: (error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.allHabits, context.previous);
      toast({ message: `Couldn't save the new order. ${errorMessage(error)}`, tone: "error" });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.habits });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });

  if (habits.length === 0) {
    return (
      <EmptyState
        icon={<Sprout size={36} />}
        title="No habits yet"
        body="Create a habit to start tracking it here and on your Today screen."
        action={
          <Link to="/habits/new" className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 font-medium text-on-primary hover:bg-primary-hover">
            <Plus size={20} aria-hidden="true" /> New habit
          </Link>
        }
      />
    );
  }

  const byId = new Map(habits.map((h) => [h.id, h]));
  // Drop ids of habits deleted or archived elsewhere mid-reorder; add any created meanwhile.
  const order = draftOrder
    ? [...draftOrder.filter((id) => byId.has(id)), ...habits.map((h) => h.id).filter((id) => !draftOrder.includes(id))]
    : habits.map((h) => h.id);
  const reordering = draftOrder !== null;

  const move = (index: number, direction: "up" | "down") => {
    const to = direction === "up" ? index - 1 : index + 1;
    const next = [...order];
    [next[index], next[to]] = [next[to]!, next[index]!];
    setDraftOrder(next);
    setAnnouncement(`${byId.get(order[index]!)!.name} moved to position ${to + 1} of ${order.length}`);
    setFocusAfterMove(`${order[index]}:${direction}`);
  };

  const finish = () => {
    const changed = order.some((id, i) => id !== habits[i]?.id);
    setDraftOrder(null);
    setAnnouncement("");
    if (changed) saveOrder.mutate(order);
  };

  return (
    <>
      {habits.length > 1 && (
        <div className="mb-3 flex items-center justify-end gap-2">
          {reordering ? (
            <>
              <p className="mr-auto text-caption text-muted">Use the arrows to change the order.</p>
              <Button variant="ghost" onClick={() => setDraftOrder(null)}>
                Cancel
              </Button>
              <Button onClick={finish}>Done</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setDraftOrder(habits.map((h) => h.id))}>
              Reorder
            </Button>
          )}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ul className="flex flex-col gap-3" aria-label={reordering ? "Habits, reordering" : "Active habits"}>
        {order.map((id, index) => {
          const habit = byId.get(id)!;
          return (
            <li key={id} className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
              {reordering ? (
                <>
                  <HabitSummary habit={habit} weekStartDay={user.weekStartDay} />
                  <div className="flex gap-1">
                    {(["up", "down"] as const).map((direction) => (
                      <button
                        key={direction}
                        ref={(el) => {
                          if (el) buttons.current.set(`${id}:${direction}`, el);
                          else buttons.current.delete(`${id}:${direction}`);
                        }}
                        type="button"
                        onClick={() => move(index, direction)}
                        disabled={direction === "up" ? index === 0 : index === order.length - 1}
                        aria-label={`Move ${habit.name} ${direction}`}
                        className="flex size-11 items-center justify-center rounded-control border border-border hover:bg-surface-2 disabled:opacity-30"
                      >
                        {direction === "up" ? <ArrowUp size={20} aria-hidden="true" /> : <ArrowDown size={20} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <Link to={`/habits/${id}`} className="-m-3 flex flex-1 items-center gap-3 rounded-card p-3 hover:bg-surface-2">
                  <HabitSummary habit={habit} weekStartDay={user.weekStartDay} />
                  <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ArchivedList({ habits }: { habits: Habit[] }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();

  const restore = useMutation({
    mutationFn: (habit: Habit) => habitsApi.update(habit.id, { archived: false }),
    onSuccess: (habit) => {
      toast({ message: `Restored ${habit.name}` });
      void queryClient.invalidateQueries({ queryKey: queryKeys.habits });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
    onError: (error) => toast({ message: `Couldn't restore. ${errorMessage(error)}`, tone: "error" }),
  });

  if (habits.length === 0) {
    return (
      <EmptyState
        icon={<Archive size={36} />}
        title="Nothing archived"
        body="Archive a habit from its page to hide it from Today without losing its history."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="Archived habits">
      {habits.map((habit) => (
        <li key={habit.id} className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
          <Link to={`/habits/${habit.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-control">
            <HabitSummary habit={habit} weekStartDay={user.weekStartDay} />
          </Link>
          <Button
            variant="secondary"
            loading={restore.isPending && restore.variables.id === habit.id}
            onClick={() => restore.mutate(habit)}
            aria-label={`Restore ${habit.name}`}
          >
            Restore
          </Button>
        </li>
      ))}
    </ul>
  );
}

function HabitSummary({ habit, weekStartDay }: { habit: Habit; weekStartDay: number }) {
  const target = describeTarget(habit);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-control"
        style={{ backgroundColor: `${habit.color}26`, color: habit.color }}
      >
        <HabitIcon name={habit.icon} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body font-medium">{habit.name}</span>
        <span className="block truncate text-caption text-muted">
          {describeSchedule(habit, weekStartDay)}
          {target && ` · ${target}`}
        </span>
      </span>
    </span>
  );
}
