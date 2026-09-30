import * as Sentry from "@sentry/node";
import { config } from "../config.js";

// Optional error tracking. With SENTRY_DSN set, unexpected errors go to Sentry; without it, they're
// only logged. Nothing personal is sent: no request bodies (which can hold passwords), cookies,
// auth headers, user info, query strings or local variable values. `beforeSend` strips the request
// data again as a second line of defence.

let enabled = false;

/** Call once at startup. `service` tags events so API, worker and cron errors can be told apart. */
export function initErrorReporting(service: "api" | "worker" | "reminders"): void {
  if (!config.SENTRY_DSN) return;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    // Sentry 11's per-category data controls: nothing about the person or their request.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: ["authorization", "cookie"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    initialScope: { tags: { service } },
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
        if (event.request.headers) {
          for (const header of Object.keys(event.request.headers)) {
            if (/^(authorization|cookie)$/i.test(header)) delete event.request.headers[header];
          }
        }
      }
      return event;
    },
  });
  enabled = true;
}

/** Logs the error and, when error tracking is on, reports it. */
export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  console.error(error, Object.keys(context).length ? context : "");
  if (enabled) Sentry.captureException(error, { extra: context });
}

/** Short-lived processes (the cron job) call this before exiting so reports aren't lost. */
export async function flushErrorReports(): Promise<void> {
  if (enabled) await Sentry.flush(2000);
}
