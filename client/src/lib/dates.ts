// Dates from the API are "YYYY-MM-DD" calendar dates already in the user's timezone. Format them
// as UTC so the browser's own timezone can't shift them by a day.

export function formatLongDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
