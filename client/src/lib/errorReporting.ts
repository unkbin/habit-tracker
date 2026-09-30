// Optional error tracking. Set VITE_SENTRY_DSN at build time to turn it on; without it, Sentry's
// code is never downloaded (it's a separate chunk loaded on demand). Nothing personal is sent:
// no user info, cookies, request bodies, query strings or local variable values.

type Sentry = typeof import("@sentry/react");

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
let sentry: Sentry | null = null;

export async function initErrorReporting(): Promise<void> {
  if (!dsn) return;
  try {
    sentry = await import("@sentry/react");
    sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
      },
    });
  } catch {
    // Blocked by an ad blocker or offline: carry on without error tracking.
    sentry = null;
  }
}

export function reportError(error: unknown): void {
  if (sentry) sentry.captureException(error);
  else console.error(error);
}
