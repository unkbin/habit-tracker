import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, Download, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ApiError, errorMessage } from "../../api/client";
import { meApi } from "../../api/endpoints";
import type { Theme, User } from "../../api/types";
import { useAuth, useUser } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/AppLayout";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { TextField } from "../../components/ui/TextField";
import { useToast } from "../../components/ui/Toast";
import { todayIn } from "../../lib/dates";
import { NotificationSettings } from "./NotificationSettings";

type Preferences = Partial<Pick<User, "name" | "timezone" | "weekStartDay" | "theme">>;

const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const tzLabel = (tz: string) => tz.replaceAll("_", " ");
const weekdayLong = (d: number) =>
  new Date(Date.UTC(1970, 0, 4 + d)).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });

/**
 * Saves a settings change. The screen (and theme) updates at once; if the server refuses, the
 * old value comes back with an error. Timezone and week start change what "today" and "this
 * week" mean, so everything cached is refetched.
 */
function useSavePreferences() {
  const user = useUser();
  const { setUser } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (changes: Preferences) => meApi.update(changes),
    onMutate: (changes) => {
      const previous = user;
      setUser({ ...user, ...changes });
      return { previous };
    },
    onError: (error, _changes, context) => {
      if (context) setUser(context.previous);
      toast({ message: `Couldn't save. ${errorMessage(error)}`, tone: "error" });
    },
    onSuccess: (updated, changes) => {
      setUser(updated);
      if (changes.timezone !== undefined || changes.weekStartDay !== undefined) {
        void queryClient.invalidateQueries();
        toast({ message: changes.timezone !== undefined ? "Timezone updated" : "Week start updated" });
      }
      if (changes.name !== undefined) toast({ message: "Name saved" });
    },
  });
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-4">
        <ProfileSection />
        <PreferencesSection />
        <Section title="Reminders" icon={<Bell size={18} aria-hidden="true" />}>
          <NotificationSettings />
        </Section>
        <DataSection />
        <AccountSection />
      </div>
    </>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-card border border-border bg-surface p-4">
      <h2 id={id} className="mb-3 flex items-center gap-2 text-subheading font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function ProfileSection() {
  const user = useUser();
  const save = useSavePreferences();
  const [name, setName] = useState(user.name ?? "");
  const trimmed = name.trim();
  const changed = trimmed !== (user.name ?? "");
  const tooLong = trimmed.length > 100;

  return (
    <Section title="Profile">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed && !tooLong) save.mutate({ name: trimmed || null });
        }}
      >
        <TextField
          label="Name"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint="Shown in the greeting on Today"
          error={tooLong ? "Keep it under 100 characters" : undefined}
        />
        <div>
          <p className="text-caption font-medium">Email</p>
          <p className="text-body text-muted">{user.email}</p>
        </div>
        <Button type="submit" variant="secondary" disabled={!changed || tooLong} loading={save.isPending && save.variables?.name !== undefined} className="self-start">
          Save name
        </Button>
      </form>
    </Section>
  );
}

function PreferencesSection() {
  const user = useUser();
  const save = useSavePreferences();
  const timezoneId = useId();
  const weekStartId = useId();

  // Every IANA zone the browser knows, plus the saved one in case this browser's list lacks it.
  const zones = Intl.supportedValuesOf("timeZone");
  if (!zones.includes(user.timezone)) zones.unshift(user.timezone);

  return (
    <Section title="Preferences">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={timezoneId} className="text-caption font-medium">
            Timezone
          </label>
          <select
            id={timezoneId}
            value={user.timezone}
            onChange={(e) => save.mutate({ timezone: e.target.value })}
            className="min-h-11 rounded-control border border-border bg-surface px-3 text-body"
          >
            {zones.map((tz) => (
              <option key={tz} value={tz}>
                {tzLabel(tz)}
              </option>
            ))}
          </select>
          <p className="text-caption text-muted">Decides when your day starts and ends.</p>
          {deviceTimeZone !== user.timezone && (
            <p className="flex flex-wrap items-center gap-x-2 text-caption">
              <span className="text-muted">This device is set to {tzLabel(deviceTimeZone)}.</span>
              <button
                type="button"
                onClick={() => save.mutate({ timezone: deviceTimeZone })}
                className="min-h-11 font-semibold text-primary underline-offset-2 hover:underline"
              >
                Use it
              </button>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={weekStartId} className="text-caption font-medium">
            Week starts on
          </label>
          <select
            id={weekStartId}
            value={user.weekStartDay}
            onChange={(e) => save.mutate({ weekStartDay: Number(e.target.value) })}
            className="min-h-11 rounded-control border border-border bg-surface px-3 text-body"
          >
            {[1, 0, 6, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {weekdayLong(d)}
              </option>
            ))}
          </select>
          <p className="text-caption text-muted">Used for weekly goals, streaks and charts.</p>
        </div>

        <fieldset>
          <legend className="mb-1 text-caption font-medium">Theme</legend>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-control bg-surface-2 p-1">
            {(
              [
                { value: "LIGHT", label: "Light", icon: Sun },
                { value: "DARK", label: "Dark", icon: Moon },
                { value: "SYSTEM", label: "System", icon: Monitor },
              ] as { value: Theme; label: string; icon: typeof Sun }[]
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={user.theme === value}
                onClick={() => user.theme !== value && save.mutate({ theme: value })}
                className={clsx(
                  "flex min-h-11 items-center justify-center gap-2 rounded-[0.6rem] text-caption font-medium",
                  user.theme === value ? "bg-surface text-text shadow-sm" : "text-muted",
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Section>
  );
}

function DataSection() {
  const user = useUser();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const data = await meApi.export();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `habits-export-${todayIn(user.timezone)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast({ message: `Couldn't export. ${errorMessage(error)}`, tone: "error" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Section title="Your data">
      <p className="mb-3 text-body text-muted">
        Download everything: your profile, habits, archived periods and every check-off, as a JSON file. See how
        your data is handled in the{" "}
        <Link to="/privacy" className="font-medium text-primary">
          privacy page
        </Link>
        .
      </p>
      <Button variant="secondary" loading={exporting} onClick={() => void download()}>
        <Download size={18} aria-hidden="true" /> Export data
      </Button>
    </Section>
  );
}

function AccountSection() {
  const { logout } = useAuth();
  const toast = useToast();
  const passwordId = useId();
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => meApi.remove(password),
    onSuccess: async () => {
      setDeleting(false);
      toast({ message: "Your account and all its data have been deleted." });
      // The server already ended the session; this clears it here and returns to the login page.
      await logout();
    },
    onError: (err) =>
      setError(err instanceof ApiError && err.code === "incorrect_password" ? "That password isn't right." : errorMessage(err)),
  });

  const closeDialog = () => {
    setDeleting(false);
    setPassword("");
    setError(null);
  };
  const confirm = () => {
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setError(null);
    remove.mutate();
  };

  return (
    <Section title="Account">
      <div className="flex flex-col gap-3">
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
        <Button variant="secondary" fullWidth className="text-danger" onClick={() => setDeleting(true)}>
          <Trash2 size={18} aria-hidden="true" /> Delete account
        </Button>
      </div>

      <ConfirmDialog
        open={deleting}
        title="Delete your account?"
        confirmLabel="Delete account"
        destructive
        loading={remove.isPending}
        onConfirm={confirm}
        onClose={closeDialog}
      >
        <p className="mb-3">
          This permanently deletes your account, every habit and all your history. It can't be undone. You may want to
          export your data first.
        </p>
        <label htmlFor={passwordId} className="mb-1 block text-caption font-medium text-text">
          Enter your password to confirm
        </label>
        <input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${passwordId}-error` : undefined}
          className={clsx(
            "min-h-11 w-full rounded-control border bg-surface px-3 text-body text-text",
            error ? "border-danger" : "border-border",
          )}
        />
        {error && (
          <p id={`${passwordId}-error`} role="alert" className="mt-1 text-caption text-danger">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </Section>
  );
}
