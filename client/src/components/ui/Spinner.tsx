import { LoaderCircle } from "lucide-react";

export function Spinner({ size = 20 }: { size?: number }) {
  return <LoaderCircle size={size} className="animate-spin" aria-hidden="true" />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-muted" role="status">
      <Spinner size={28} />
      <span className="sr-only">Loading</span>
    </div>
  );
}
