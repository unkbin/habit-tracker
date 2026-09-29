import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChartColumn, Check, Flame, Sprout, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { errorMessage } from "../../api/client";
import { habitsApi, queryKeys } from "../../api/endpoints";
import { useUser } from "../../auth/useAuth";
import { HabitIcon } from "../../components/HabitIcon";
import { Button } from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { todayIn } from "../../lib/dates";
import { HABIT_SUGGESTIONS } from "../../lib/habitSuggestions";

const SLIDES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Sprout,
    title: "Small steps, every day",
    body: "Pick a few habits and tick them off as you go. Tiny wins add up faster than you'd think.",
  },
  {
    icon: Flame,
    title: "Keep your streak alive",
    body: "Streaks count the days you show up. Rest days and weekly goals are built in, so an off day on your schedule never breaks them.",
  },
  {
    icon: ChartColumn,
    title: "See what's working",
    body: "Calendars and charts show your progress, your strongest days and the ones that need a little help.",
  },
];

/**
 * First-run introduction, shown once right after signup: three short slides, then a chance to
 * pick starter habits. Skipping is always safe; Today's empty state also leads to a first habit.
 */
export function WelcomePage() {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const isLast = step === SLIDES.length;

  // Move focus to each new step's heading so screen readers announce it (not on first load,
  // where focus starts at the top of the page as usual).
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="flex min-h-11 items-center justify-between">
        <p className="text-caption text-muted" aria-live="polite">
          Step {step + 1} of {SLIDES.length + 1}
        </p>
        {!isLast && (
          <button
            type="button"
            onClick={() => setStep(SLIDES.length)}
            className="min-h-11 px-2 text-body font-medium text-muted hover:text-text"
          >
            Skip
          </button>
        )}
      </div>

      {isLast ? (
        <PickHabits headingRef={heading} onDone={() => navigate("/", { replace: true })} />
      ) : (
        <Slide key={step} slide={SLIDES[step]!} headingRef={heading} />
      )}

      <div className="mt-6 flex flex-col gap-4">
        <div className="flex justify-center gap-2" aria-hidden="true">
          {Array.from({ length: SLIDES.length + 1 }, (_, i) => (
            <span key={i} className={clsx("h-2 rounded-full transition-all", i === step ? "w-6 bg-primary" : "w-2 bg-border")} />
          ))}
        </div>
        {!isLast && (
          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="secondary" className="flex-1" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button className="flex-1" onClick={() => setStep(step + 1)}>
              {step === SLIDES.length - 1 ? "Get started" : "Next"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

function Slide({ slide, headingRef }: { slide: (typeof SLIDES)[number]; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const Icon = slide.icon;
  return (
    <section className="flex flex-1 flex-col items-center justify-center text-center motion-safe:animate-[fade-in_300ms_ease-out]">
      <span className="mb-8 flex size-28 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon size={56} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h1 ref={headingRef} tabIndex={-1} className="text-title font-semibold outline-none">
        {slide.title}
      </h1>
      <p className="mt-3 max-w-xs text-body text-muted">{slide.body}</p>
    </section>
  );
}

function PickHabits({ headingRef, onDone }: { headingRef: React.RefObject<HTMLHeadingElement | null>; onDone: () => void }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (name: string) => setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name]));

  const create = async () => {
    setSaving(true);
    const startDate = todayIn(user.timezone);
    const chosen = HABIT_SUGGESTIONS.filter((s) => picked.includes(s.name));
    let created = 0;
    try {
      // One at a time, so they keep the order they're listed in.
      for (const s of chosen) {
        await habitsApi.create({
          name: s.name,
          description: null,
          icon: s.icon,
          color: s.color,
          frequency: "DAILY",
          targetWeekdays: [],
          timesPerWeek: null,
          targetValue: null,
          unit: null,
          reminderTime: null,
          startDate,
        });
        created++;
      }
      toast({ message: created === 1 ? "Added 1 habit. Tick it off when it's done." : `Added ${created} habits. Tick them off as you go.` });
      onDone();
    } catch (error) {
      toast({
        message: `${created > 0 ? `Added ${created}, but couldn't add the rest.` : "Couldn't add those habits."} ${errorMessage(error)}`,
        tone: "error",
      });
      if (created > 0) onDone();
    } finally {
      setSaving(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.habits });
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    }
  };

  return (
    <section className="flex flex-1 flex-col pt-6 motion-safe:animate-[fade-in_300ms_ease-out]">
      <h1 ref={headingRef} tabIndex={-1} className="text-title font-semibold outline-none">
        Pick your first habits
      </h1>
      <p className="mt-2 text-body text-muted">
        Start small: one or two is plenty. They're set to every day; you can change that any time.
      </p>

      <fieldset className="mt-6">
        <legend className="sr-only">Starter habits</legend>
        <div className="grid grid-cols-2 gap-3">
          {HABIT_SUGGESTIONS.map((s) => {
            const selected = picked.includes(s.name);
            return (
              <label
                key={s.name}
                className={clsx(
                  "relative flex min-h-24 cursor-pointer flex-col justify-between gap-3 rounded-card border-2 bg-surface p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
                  selected ? "border-primary" : "border-border",
                )}
              >
                <input type="checkbox" className="sr-only" checked={selected} onChange={() => toggle(s.name)} />
                <span
                  className="flex size-10 items-center justify-center rounded-control"
                  style={{ backgroundColor: `${s.color}26`, color: s.color }}
                >
                  <HabitIcon name={s.icon} size={20} />
                </span>
                <span className="text-body font-medium">{s.name}</span>
                {selected && (
                  <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-on-primary" aria-hidden="true">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <Button onClick={() => void create()} disabled={picked.length === 0} loading={saving} fullWidth>
          {picked.length === 0 ? "Pick at least one" : `Start with ${picked.length} habit${picked.length === 1 ? "" : "s"}`}
        </Button>
        <Link
          to="/habits/new"
          replace
          state={{ returnTo: "/" }}
          className="inline-flex min-h-11 items-center justify-center rounded-control text-body font-medium text-primary hover:bg-surface-2"
        >
          Create my own instead
        </Link>
        <Link to="/" replace className="inline-flex min-h-11 items-center justify-center text-caption text-muted hover:text-text">
          I'll do this later
        </Link>
      </div>
    </section>
  );
}
