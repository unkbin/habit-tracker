import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "./Button";

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-10 text-center">
      <div className="text-primary">{icon}</div>
      <h2 className="text-subheading font-semibold">{title}</h2>
      <p className="max-w-xs text-body text-muted">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-10 text-center">
      <CircleAlert className="text-danger" size={32} aria-hidden="true" />
      <p className="text-body">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
