// Creates a demo account with a few habits and a month of history, for trying the app locally.
// Safe to re-run: the demo account is deleted and recreated. Never run against production.
//
//   npm run db:seed -w server
//
// Then log in with the DEMO_EMAIL and DEMO_PASSWORD below.

import { config } from "../src/config.js";
import { addDays, localDate, toDayNumber, toDbDate, weekdayOf } from "../src/lib/dates.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";

export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "demo-password-123";

if (config.isProduction) throw new Error("Refusing to seed demo data in production");

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const today = localDate(timezone);
const start = addDays(today, -35);

await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
const user = await prisma.user.create({
  data: { email: DEMO_EMAIL, passwordHash: await hashPassword(DEMO_PASSWORD), name: "Demo", timezone },
});

// Each habit's `doneOn` decides, for a day `n` days before today, whether it was done: a fixed
// pattern rather than random numbers, so the demo looks the same every time.
const habits = [
  {
    name: "Drink water",
    icon: "droplet",
    color: "#0284c7",
    frequency: "DAILY" as const,
    targetValue: 8,
    unit: "glasses",
    doneOn: (n: number) => (n % 9 === 4 ? 5 : 8),
  },
  { name: "Read 20 minutes", icon: "book", color: "#7c3aed", frequency: "DAILY" as const, doneOn: (n: number) => n % 6 !== 5 },
  {
    name: "Gym",
    icon: "dumbbell",
    color: "#ea580c",
    frequency: "WEEKDAYS" as const,
    targetWeekdays: [1, 3, 5],
    doneOn: (n: number) => n !== 12,
  },
  {
    name: "Run",
    icon: "footprints",
    color: "#16a34a",
    frequency: "TIMES_PER_WEEK" as const,
    timesPerWeek: 3,
    doneOn: (n: number) => n % 2 === 1,
  },
  { name: "Meditate", icon: "leaf", color: "#0d9488", frequency: "DAILY" as const, doneOn: (n: number) => n >= 1 && n <= 9 },
];

for (const [sortOrder, { doneOn, ...habit }] of habits.entries()) {
  const created = await prisma.habit.create({
    data: { ...habit, userId: user.id, startDate: toDbDate(start), sortOrder },
  });
  const completions = [];
  // Days before today only: today is left for you to check off.
  for (let n = 1; n <= 35; n++) {
    const date = addDays(today, -n);
    const scheduled = habit.frequency !== "WEEKDAYS" || habit.targetWeekdays!.includes(weekdayOf(toDayNumber(date)));
    const result = doneOn(n);
    if (!scheduled || result === false) continue;
    completions.push({ habitId: created.id, date: toDbDate(date), value: typeof result === "number" ? result : null });
  }
  await prisma.completion.createMany({ data: completions });
}

console.info(`Seeded ${habits.length} habits for ${DEMO_EMAIL} (timezone ${timezone}).`);
await prisma.$disconnect();
