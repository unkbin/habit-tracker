// Long-running reminder worker: checks for due reminders at the start of every minute.
// Run it as an always-on background worker (e.g. a Render Background Worker). For a scheduled
// job instead (e.g. a Render Cron Job every few minutes), use src/remindersOnce.ts.

import { config } from "./config.js";
import { sendDueReminders } from "./jobs/reminders.js";
import { initErrorReporting, reportError } from "./lib/errorReporting.js";
import { prisma } from "./lib/prisma.js";

initErrorReporting("worker");

if (!config.pushEnabled) {
  console.warn("VAPID keys are not set, so reminders can't be sent. See .env.example.");
}

let stopping = false;
let timer: NodeJS.Timeout | undefined;

async function tick() {
  try {
    const run = await sendDueReminders();
    if (run.reminded > 0) console.info(`Reminders: ${run.reminded} habits, ${run.users} people, ${run.delivered} devices`);
  } catch (error) {
    // Keep running; the next minute tries again.
    reportError(error, { context: "reminder run" });
  }
  if (!stopping) timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 1_000);
}

async function stop() {
  stopping = true;
  clearTimeout(timer);
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.info("Reminder worker started");
void tick();
