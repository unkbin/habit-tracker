import { WifiOff } from "lucide-react";

/**
 * Shown above data that's still on screen after a refresh failed (for example the connection
 * dropped). Pages keep showing what they last loaded instead of replacing it with an error;
 * the full error screen is only for when there's nothing to show yet.
 */
export function StaleNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="status" className="mb-4 flex items-center gap-3 rounded-control bg-surface-2 px-3 py-2 text-caption">
      <WifiOff size={16} className="shrink-0 text-muted" aria-hidden="true" />
      <p className="flex-1">Couldn't refresh. Showing what was last loaded.</p>
      <button type="button" onClick={onRetry} className="min-h-11 px-2 font-semibold text-primary">
        Retry
      </button>
    </div>
  );
}
