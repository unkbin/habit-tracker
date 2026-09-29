import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, SearchX } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ApiError, errorMessage } from "../../api/client";
import { habitsApi, queryKeys } from "../../api/endpoints";
import { useUser } from "../../auth/useAuth";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { todayIn } from "../../lib/dates";
import { HabitForm } from "./HabitForm";
import { emptyHabitForm, formToInput, habitToForm } from "./habitFormSchema";

/**
 * Leaves the form: to `returnTo` if the link that opened it said where (onboarding does, since
 * going back would land on signup), otherwise back to wherever the user came from, or to
 * `fallback` on a fresh page load.
 */
function useLeave(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  return () => {
    if (returnTo?.startsWith("/")) navigate(returnTo, { replace: true });
    else if (location.key !== "default") navigate(-1);
    else navigate(fallback, { replace: true });
  };
}

/** After any habit change, Today, lists and stats may all be out of date. */
function useInvalidateHabitData() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.habits }),
      queryClient.invalidateQueries({ queryKey: queryKeys.today }),
      queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
    ]);
}

function FormHeader({ title, backLabel, onBack }: { title: string; backLabel: string; onBack: () => void }) {
  return (
    <header className="mb-6 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        className="-ml-2 flex size-11 items-center justify-center rounded-control hover:bg-surface-2"
      >
        <ArrowLeft size={22} aria-hidden="true" />
      </button>
      <h1 className="text-heading font-semibold">{title}</h1>
    </header>
  );
}

export function NewHabitPage() {
  const user = useUser();
  const leave = useLeave("/");
  const invalidate = useInvalidateHabitData();
  const toast = useToast();

  return (
    <>
      <FormHeader title="New habit" backLabel="Cancel" onBack={leave} />
      <HabitForm
        defaultValues={emptyHabitForm(todayIn(user.timezone))}
        weekStartDay={user.weekStartDay}
        submitLabel="Create habit"
        onSubmit={async (values) => {
          const habit = await habitsApi.create(formToInput(values));
          await invalidate();
          toast({ message: `Added ${habit.name}` });
          leave();
        }}
      />
    </>
  );
}

export function EditHabitPage() {
  const { id = "" } = useParams();
  const user = useUser();
  const leave = useLeave(`/habits/${id}`);
  const invalidate = useInvalidateHabitData();
  const toast = useToast();
  const habit = useQuery({ queryKey: queryKeys.habit(id), queryFn: () => habitsApi.get(id) });

  const header = <FormHeader title="Edit habit" backLabel="Cancel" onBack={leave} />;

  if (habit.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading habit">
        {header}
        <Skeleton className="mb-4 h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (habit.isError) {
    return (
      <>
        {header}
        {habit.error instanceof ApiError && habit.error.status === 404 ? (
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

  return (
    <>
      {header}
      <HabitForm
        // A fresh form per habit, so defaults never leak between habits.
        key={habit.data.id}
        isEdit
        defaultValues={habitToForm(habit.data)}
        weekStartDay={user.weekStartDay}
        submitLabel="Save changes"
        onSubmit={async (values) => {
          await habitsApi.update(id, formToInput(values));
          await invalidate();
          toast({ message: "Changes saved" });
          leave();
        }}
      />
    </>
  );
}
