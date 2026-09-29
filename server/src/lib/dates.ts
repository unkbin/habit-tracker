// Calendar dates are passed around as "YYYY-MM-DD" strings (called LocalDate here), which sort
// and compare correctly as plain strings. Postgres DATE columns come back from Prisma as JS Dates
// at UTC midnight; convert at the database boundary with toDbDate / fromDbDate.

import { z } from "zod";

export type LocalDate = string;

export const localDateSchema = z.iso.date("Use the format YYYY-MM-DD");

/** The calendar date it is in `timeZone` at the instant `at`. */
export function localDate(timeZone: string, at: Date = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = toDbDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / 86_400_000);
}

// Day numbers (days since 1970-01-01) make day-by-day loops cheap: tomorrow is just n + 1.
const MS_PER_DAY = 86_400_000;

export function toDayNumber(date: LocalDate): number {
  return toDbDate(date).getTime() / MS_PER_DAY;
}

export function fromDayNumber(day: number): LocalDate {
  return fromDbDate(new Date(day * MS_PER_DAY));
}

/** 0 = Sunday ... 6 = Saturday. Day 0 (1970-01-01) was a Thursday. */
export function weekdayOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

/** The day number of the first day of the week containing `day`. */
export function weekStartOf(day: number, weekStartDay: number): number {
  return day - ((weekdayOf(day) - weekStartDay + 7) % 7);
}

export function toDbDate(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}
