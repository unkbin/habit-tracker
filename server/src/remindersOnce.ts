// One reminder run, then exit. For a scheduled job such as a Render Cron Job every 5 minutes
//   npm run reminders -w server        (development, via tsx)
//   npm run reminders:prod -w server   (production, compiled)
// (For an always-on process, use `npm run worker -w server` instead.)

import { sendDueReminders } from "./jobs/reminders.js";
import { flushErrorReports, initErrorReporting, reportError } from "./lib/errorReporting.js";
import { prisma } from "./lib/prisma.js";

initErrorReporting("reminders");
try {
  const run = await sendDueReminders();
  console.info(`Reminders: ${run.reminded} habits, ${run.users} people, ${run.delivered} devices`);
} catch (error) {
  reportError(error, { context: "reminder run" });
  process.exitCode = 1; // shows as a failed run in the cron dashboard
} finally {
  await prisma.$disconnect();
  await flushErrorReports();
}
