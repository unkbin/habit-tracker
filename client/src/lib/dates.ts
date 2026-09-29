// Dates from the API are "YYYY-MM-DD" calendar dates already in the user's timezone. Format them
// as UTC so the browser's own timezone can't shift them by a day.

/** Today's date ("YYYY-MM-DD") in the given timezone, e.g. the user's saved one. */
export function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Short weekday names (Sun, Mon, ...) in the browser's language, indexed 0 = Sunday. */
export const WEEKDAY_NAMES = Array.from({ length: 7 }, (_, day) =>
  // 4 January 1970 was a Sunday.
  new Date(Date.UTC(1970, 0, 4 + day)).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
);

/** 0-6 starting from the user's week start day, e.g. [1, 2, 3, 4, 5, 6, 0] for Monday. */
export function weekdayOrder(weekStartDay: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7);
}

export function formatLongDate(date: string): string {
  return toUtc(date).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const toDateString = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  return toUtc(date).getUTCDay();
}

// Months are "YYYY-MM" strings.

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(month: string, count: number): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return toDateString(new Date(Date.UTC(year, m - 1 + count, 1))).slice(0, 7);
}

/** Every date in the month, in order. */
export function daysOfMonth(month: string): string[] {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function formatMonth(month: string): string {
  return toUtc(`${month}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}
