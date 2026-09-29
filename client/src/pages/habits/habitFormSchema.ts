import { z } from "zod";
import type { HabitInput } from "../../api/endpoints";
import type { Habit } from "../../api/types";
import { HABIT_COLORS } from "../../lib/habitColors";

// The form's own shape. It keeps settings for every frequency (so switching back and forth doesn't
// lose what was typed) and turns into an API payload only on submit.
export const habitFormSchema = z
  .object({
    name: z.string().trim().min(1, "Give the habit a name").max(60, "Keep the name under 60 characters"),
    description: z.string().trim().max(500, "Keep the description under 500 characters"),
    icon: z.string().min(1),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    frequency: z.enum(["DAILY", "WEEKDAYS", "TIMES_PER_WEEK"]),
    targetWeekdays: z.array(z.int().min(0).max(6)),
    timesPerWeek: z.int().min(1).max(7),
    measured: z.boolean(),
    // Text inputs: an empty box is "" rather than NaN, and it's only checked when measured.
    targetValue: z.string(),
    unit: z.string().trim().max(20, "Keep the unit under 20 characters"),
    reminder: z.boolean(),
    reminderTime: z.string(),
    startDate: z.iso.date("Pick a start date"),
  })
  .superRefine((values, ctx) => {
    if (values.frequency === "WEEKDAYS" && values.targetWeekdays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["targetWeekdays"], message: "Pick at least one day" });
    }
    if (values.measured) {
      const target = Number(values.targetValue);
      if (!/^\d+$/.test(values.targetValue.trim()) || target < 1 || target > 100_000) {
        ctx.addIssue({ code: "custom", path: ["targetValue"], message: "Enter a whole number from 1 to 100,000" });
      }
    }
    if (values.reminder && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.reminderTime)) {
      ctx.addIssue({ code: "custom", path: ["reminderTime"], message: "Pick a time" });
    }
  });

export type HabitFormValues = z.infer<typeof habitFormSchema>;

export function emptyHabitForm(startDate: string): HabitFormValues {
  return {
    name: "",
    description: "",
    icon: "check",
    color: HABIT_COLORS[0]!.value,
    frequency: "DAILY",
    targetWeekdays: [],
    timesPerWeek: 3,
    measured: false,
    targetValue: "",
    unit: "",
    reminder: false,
    reminderTime: "08:00",
    startDate,
  };
}

export function habitToForm(habit: Habit): HabitFormValues {
  return {
    name: habit.name,
    description: habit.description ?? "",
    icon: habit.icon,
    color: habit.color,
    frequency: habit.frequency,
    targetWeekdays: habit.targetWeekdays,
    timesPerWeek: habit.timesPerWeek ?? 3,
    measured: habit.targetValue !== null,
    targetValue: habit.targetValue?.toString() ?? "",
    unit: habit.unit ?? "",
    reminder: habit.reminderTime !== null,
    reminderTime: habit.reminderTime ?? "08:00",
    startDate: habit.startDate,
  };
}

/** Only the settings that apply to the chosen frequency and kind are sent. */
export function formToInput(values: HabitFormValues): HabitInput {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    icon: values.icon,
    color: values.color,
    frequency: values.frequency,
    targetWeekdays: values.frequency === "WEEKDAYS" ? values.targetWeekdays : [],
    timesPerWeek: values.frequency === "TIMES_PER_WEEK" ? values.timesPerWeek : null,
    targetValue: values.measured ? Number(values.targetValue) : null,
    unit: values.measured ? values.unit.trim() || null : null,
    reminderTime: values.reminder ? values.reminderTime : null,
    startDate: values.startDate,
  };
}
