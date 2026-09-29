import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { Check, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { HABIT_ICONS, HabitIcon } from "../../components/HabitIcon";
import { Button } from "../../components/ui/Button";
import { Switch } from "../../components/ui/Switch";
import { TextField } from "../../components/ui/TextField";
import { WEEKDAY_NAMES, weekdayOrder } from "../../lib/dates";
import { applyApiError } from "../../lib/forms";
import { HABIT_COLORS } from "../../lib/habitColors";
import { HABIT_SUGGESTIONS } from "../../lib/habitSuggestions";
import { habitFormSchema, type HabitFormValues } from "./habitFormSchema";


const FREQUENCIES = [
  { value: "DAILY", label: "Every day" },
  { value: "WEEKDAYS", label: "Some days" },
  { value: "TIMES_PER_WEEK", label: "X a week" },
] as const;

interface HabitFormProps {
  defaultValues: HabitFormValues;
  /** Editing an existing habit: it can't switch between yes/no and measured. */
  isEdit?: boolean;
  weekStartDay: number;
  submitLabel: string;
  onSubmit: (values: HabitFormValues) => Promise<void>;
}

export function HabitForm({ defaultValues, isEdit = false, weekStartDay, submitLabel, onSubmit }: HabitFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<HabitFormValues>({ resolver: zodResolver(habitFormSchema), defaultValues });

  const [name, icon, color, frequency, measured, reminder] = useWatch({
    control,
    name: ["name", "icon", "color", "frequency", "measured", "reminder"],
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (error) {
      applyApiError(error, setError);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {!isEdit && !name && (
        <div>
          <p className="mb-2 text-caption text-muted">Need an idea?</p>
          <div className="flex flex-wrap gap-2">
            {/* Tapping an idea fills in the name, icon and colour. */}
            {HABIT_SUGGESTIONS.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setValue("name", s.name, { shouldValidate: true });
                  setValue("icon", s.icon);
                  setValue("color", s.color);
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-3 text-body hover:bg-surface-2"
              >
                <span style={{ color: s.color }}>
                  <HabitIcon name={s.icon} size={18} />
                </span>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Section>
        <TextField label="Name" autoComplete="off" maxLength={60} error={errors.name?.message} {...register("name")} />
        <TextField
          label="Description (optional)"
          autoComplete="off"
          maxLength={500}
          placeholder="Why it matters, or how you'll do it"
          error={errors.description?.message}
          {...register("description")}
        />
      </Section>

      <Section>
        <fieldset>
          <legend className="mb-2 text-caption font-medium">Icon</legend>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {Object.entries(HABIT_ICONS).map(([key, { label }]) => (
              <label key={key}>
                <input type="radio" value={key} {...register("icon")} className="peer sr-only" />
                <span
                  title={label}
                  className="flex aspect-square min-h-11 cursor-pointer items-center justify-center rounded-control border border-border text-muted peer-checked:border-transparent peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
                  // The picked icon takes the picked colour, previewing the habit.
                  style={key === icon ? { backgroundColor: color } : undefined}
                >
                  <span className="sr-only">{label}</span>
                  <HabitIcon name={key} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-caption font-medium">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {HABIT_COLORS.map((c) => (
              <label key={c.value}>
                <input type="radio" value={c.value} {...register("color")} className="peer sr-only" />
                <span
                  className="flex size-11 cursor-pointer items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-text peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-focus [&>svg]:hidden peer-checked:[&>svg]:block"
                  style={{ backgroundColor: c.value }}
                >
                  <span className="sr-only">{c.label}</span>
                  <Check size={20} strokeWidth={3} aria-hidden="true" />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section>
        <fieldset>
          <legend className="mb-2 text-caption font-medium">How often</legend>
          <div className="grid grid-cols-3 gap-1 rounded-control bg-surface-2 p-1">
            {FREQUENCIES.map((f) => (
              <label key={f.value}>
                <input
                  type="radio"
                  value={f.value}
                  {...register("frequency", {
                    // Start "some days" on weekdays rather than an empty selection.
                    onChange: (e) => {
                      if (e.target.value === "WEEKDAYS") setValue("targetWeekdays", defaultWeekdays(defaultValues.targetWeekdays));
                    },
                  })}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-[0.6rem] px-2 text-center text-caption font-medium text-muted peer-checked:bg-surface peer-checked:text-text peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-focus sm:text-body">
                  {f.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {frequency === "WEEKDAYS" && (
          <WeekdayPicker control={control} weekStartDay={weekStartDay} error={errors.targetWeekdays?.message} />
        )}
        {frequency === "TIMES_PER_WEEK" && <TimesPerWeekStepper control={control} />}
      </Section>

      <Section>
        <Switch
          label="Track an amount"
          description={
            isEdit
              ? "Can't be changed after a habit is created"
              : "For goals like 8 glasses of water or 30 minutes of reading"
          }
          disabled={isEdit}
          {...register("measured")}
        />
        {measured && (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Daily goal"
              inputMode="numeric"
              autoComplete="off"
              error={errors.targetValue?.message}
              {...register("targetValue")}
            />
            <TextField
              label="Unit (optional)"
              placeholder="glasses"
              autoComplete="off"
              maxLength={20}
              error={errors.unit?.message}
              {...register("unit")}
            />
          </div>
        )}
      </Section>

      <Section>
        <Switch label="Daily reminder" description="A notification at a time you choose" {...register("reminder")} />
        {reminder && (
          <TextField label="Reminder time" type="time" error={errors.reminderTime?.message} {...register("reminderTime")} />
        )}
        <TextField
          label="Start date"
          type="date"
          hint="Days before this never count as missed"
          error={errors.startDate?.message}
          {...register("startDate")}
        />
      </Section>

      {errors.root && (
        <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-caption text-danger">
          {errors.root.message}
        </p>
      )}
      <Button type="submit" loading={isSubmitting} fullWidth>
        {submitLabel}
      </Button>
    </form>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">{children}</div>;
}

function defaultWeekdays(current: number[]): number[] {
  return current.length > 0 ? current : [1, 2, 3, 4, 5];
}

function WeekdayPicker({ control, weekStartDay, error }: { control: Control<HabitFormValues>; weekStartDay: number; error?: string }) {
  return (
    <Controller
      control={control}
      name="targetWeekdays"
      render={({ field }) => (
        <fieldset>
          <legend className="mb-2 text-caption font-medium">On these days</legend>
          {/* Slightly wider than the card content so each day stays a 44px touch target on a 375px phone. */}
          <div className="-mx-3 grid grid-cols-7 gap-1">
            {weekdayOrder(weekStartDay).map((day) => {
              const selected = field.value.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    field.onChange(selected ? field.value.filter((d) => d !== day) : [...field.value, day].sort((a, b) => a - b))
                  }
                  className={clsx(
                    "min-h-11 rounded-control border text-caption font-medium",
                    selected ? "border-primary bg-primary text-on-primary" : "border-border text-muted hover:bg-surface-2",
                  )}
                >
                  {WEEKDAY_NAMES[day]}
                </button>
              );
            })}
          </div>
          {error && (
            <p role="alert" className="mt-1 text-caption text-danger">
              {error}
            </p>
          )}
        </fieldset>
      )}
    />
  );
}

function TimesPerWeekStepper({ control }: { control: Control<HabitFormValues> }) {
  return (
    <Controller
      control={control}
      name="timesPerWeek"
      render={({ field }) => (
        <div className="flex items-center justify-between gap-4">
          <span className="text-body font-medium" id="times-per-week-label">
            Times per week
          </span>
          <div className="flex items-center gap-3" role="group" aria-labelledby="times-per-week-label">
            <StepButton label="Fewer" disabled={field.value <= 1} onClick={() => field.onChange(field.value - 1)}>
              <Minus size={18} aria-hidden="true" />
            </StepButton>
            <output aria-live="polite" className="w-6 text-center text-subheading font-semibold">
              {field.value}
            </output>
            <StepButton label="More" disabled={field.value >= 7} onClick={() => field.onChange(field.value + 1)}>
              <Plus size={18} aria-hidden="true" />
            </StepButton>
          </div>
        </div>
      )}
    />
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full border border-border hover:bg-surface-2 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
