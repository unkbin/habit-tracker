import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-heading font-semibold">Page not found</h1>
      <Link to="/" className="font-semibold text-primary">
        Go to Today
      </Link>
    </main>
  );
}
