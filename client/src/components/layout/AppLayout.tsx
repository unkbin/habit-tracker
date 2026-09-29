import clsx from "clsx";
import { ChartColumn, House, ListChecks, Settings, type LucideIcon } from "lucide-react";
import { NavLink, Outlet } from "react-router";

const TABS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Today", icon: House },
  { to: "/habits", label: "Habits", icon: ListChecks },
  { to: "/stats", label: "Stats", icon: ChartColumn },
  { to: "/settings", label: "Settings", icon: Settings },
];

/**
 * Logged-in shell. Phones get a bottom tab bar (thumb reach); tablets and desktops get a
 * sidebar. Both render the same links.
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh md:flex">
      <nav
        aria-label="Main"
        className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-border md:bg-surface md:p-4"
      >
        <p className="mb-4 flex items-center gap-2 px-3 text-subheading font-semibold">
          <img src="/icon.svg" alt="" className="size-7" /> Habits
        </p>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className={({ isActive }) =>
              clsx(
                "flex min-h-11 items-center gap-3 rounded-control px-3 text-body",
                isActive ? "bg-surface-2 font-semibold text-text" : "text-muted hover:bg-surface-2",
              )
            }
          >
            <tab.icon size={20} aria-hidden="true" />
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:pt-10 md:pb-10">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-4">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.to === "/"}
                className={({ isActive }) =>
                  clsx(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-caption",
                    isActive ? "font-semibold text-primary" : "text-muted",
                  )
                }
              >
                <tab.icon size={22} aria-hidden="true" />
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Header used at the top of each page. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div>
        {subtitle && <p className="text-caption font-medium tracking-wide text-muted uppercase">{subtitle}</p>}
        <h1 className="text-heading font-semibold">{title}</h1>
      </div>
      {action}
    </header>
  );
}
