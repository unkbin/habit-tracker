import type { ReactNode } from "react";
import { Link } from "react-router";

/** Centred card used by the login, signup and password pages. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <img src="/icon.svg" alt="" className="mx-auto mb-6 size-12" />
        <h1 className="text-center text-heading font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-body text-muted">{subtitle}</p>}
        <div className="mt-8 rounded-card border border-border bg-surface p-6">{children}</div>
        {footer && <div className="mt-6 text-center text-body text-muted">{footer}</div>}
        <p className="mt-4 text-center">
          <Link to="/privacy" className="text-caption text-muted underline-offset-2 hover:underline">
            Privacy
          </Link>
        </p>
      </div>
    </main>
  );
}
