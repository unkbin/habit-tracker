import { Construction, LogOut } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth, useUser } from "../auth/AuthProvider";
import { PageHeader } from "../components/layout/AppLayout";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/States";

// Screens still to be built in later sub-steps of step 5. Each says what it will hold.

function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<Construction size={36} />} title="Coming soon" body={body} />
    </>
  );
}

export const HabitsPage = () => (
  <ComingSoon title="Habits" body="All your habits, including ones not due today, with reordering and archived habits." />
);
export function HabitDetailPage() {
  const { id } = useParams();
  return (
    <>
      <ComingSoon title="Habit" body="Calendar heatmap, streaks and completion rate for this habit." />
      <Link to={`/habits/${id}/edit`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary">
        Edit habit
      </Link>
    </>
  );
}
export const StatsPage = () => (
  <ComingSoon title="Statistics" body="Weekly and monthly charts, best and worst weekdays and top habits." />
);

export function SettingsPage() {
  const user = useUser();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  return (
    <>
      <PageHeader title="Settings" />
      <section className="mb-6 rounded-card border border-border bg-surface p-4">
        <p className="text-caption text-muted">Logged in as</p>
        <p className="text-body font-medium">{user.email}</p>
        <p className="mt-2 text-caption text-muted">
          Timezone {user.timezone}. Profile, theme, week start, notifications, export and account deletion are coming next.
        </p>
      </section>
      <Button
        variant="secondary"
        fullWidth
        loading={loggingOut}
        onClick={() => {
          setLoggingOut(true);
          void logout();
        }}
      >
        <LogOut size={18} aria-hidden="true" /> Log out
      </Button>
    </>
  );
}

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-heading font-semibold">Page not found</h1>
      <Link to="/" className="font-semibold text-primary">
        Go to Today
      </Link>
    </main>
  );
}
