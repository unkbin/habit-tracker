import { CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { Link, useRouteError } from "react-router";
import { reportError } from "../../lib/errorReporting";
import { Button } from "../ui/Button";

const RELOADED_KEY = "habits-reloaded-for-update";

/** A page's code can't be downloaded because a newer version has been deployed since it loaded. */
function isStaleChunk(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
}

/**
 * Shown instead of a crashed screen. After a new deploy, a tab that was already open can ask for
 * a page file that no longer exists; that case reloads once to pick up the new version. Anything
 * else is reported (when error tracking is on) and offers a way back.
 */
export function RouteError() {
  const error = useRouteError();
  const staleChunk = isStaleChunk(error);

  useEffect(() => {
    if (staleChunk) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOADED_KEY) === "1";
        sessionStorage.setItem(RELOADED_KEY, "1");
      } catch {
        // Storage blocked: fall through and show the page rather than risk a reload loop.
        alreadyReloaded = true;
      }
      if (!alreadyReloaded) {
        window.location.reload();
        return;
      }
    }
    reportError(error);
  }, [error, staleChunk]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <CircleAlert size={40} className="text-danger" aria-hidden="true" />
      <h1 className="text-heading font-semibold">
        {staleChunk ? "There's a new version of Habits" : "Something went wrong"}
      </h1>
      <p className="max-w-sm text-body text-muted">
        {staleChunk
          ? "Reload to get the latest version. Your habits and check-offs are safe."
          : "Sorry, this screen hit an error. Your habits and check-offs are safe. Reloading usually fixes it."}
      </p>
      <div className="flex gap-3">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Link
          to="/"
          reloadDocument
          className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-4 font-medium hover:bg-surface-2"
        >
          Go to Today
        </Link>
      </div>
    </main>
  );
}
