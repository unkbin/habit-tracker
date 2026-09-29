import type { Habit } from "../api/types";
import { WEEKDAY_NAMES, weekdayOrder } from "./dates";

/** A habit's schedule in words: "Every day", "Weekdays", "Mon, Wed, Fri", "3 times a week". */
export function describeSchedule(habit: Habit, weekStartDay: number): string {
  if (habit.frequency === "DAILY") return "Every day";
  if (habit.frequency === "TIMES_PER_WEEK") {
    return habit.timesPerWeek === 1 ? "Once a week" : `${habit.timesPerWeek} times a week`;
  }
  const days = [...habit.targetWeekdays].sort((a, b) => a - b).join();
  if (days === "1,2,3,4,5") return "Weekdays";
  if (days === "0,6") return "Weekends";
  if (days === "0,1,2,3,4,5,6") return "Every day";
  return weekdayOrder(weekStartDay)
    .filter((d) => habit.targetWeekdays.includes(d))
    .map((d) => WEEKDAY_NAMES[d])
    .join(", ");
}

/** "8 glasses a day", or null for yes/no habits. */
export function describeTarget(habit: Habit): string | null {
  if (habit.targetValue === null) return null;
  return `${habit.targetValue}${habit.unit ? ` ${habit.unit}` : ""} a day`;
}
