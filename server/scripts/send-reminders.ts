// One reminder run, then exit. For a scheduled job such as a Render Cron Job every 5 minutes:
//   npm run reminders -w server
// (For an always-on process, use `npm run worker -w server` instead.)

import { sendDueReminders } from "../src/jobs/reminders.js";
import { prisma } from "../src/lib/prisma.js";

try {
  const run = await sendDueReminders();
  console.info(`Reminders: ${run.reminded} habits, ${run.users} people, ${run.delivered} devices`);
} finally {
  await prisma.$disconnect();
}
