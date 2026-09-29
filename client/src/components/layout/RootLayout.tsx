import { useEffect, useRef } from "react";
import { Outlet, useLocation, useMatches } from "react-router";

const APP_NAME = "Habits";

/**
 * Wraps every route. After each navigation it names the page in the browser tab and moves focus
 * to the page's heading, which is how screen readers learn that the page changed in a
 * single-page app. Routes name themselves with `handle: { title }`; pages without one (a habit's
 * own page) use their heading text, once it has loaded.
 */
export function RootLayout() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const title = [...matches].reverse().map((m) => (m.handle as { title?: string } | undefined)?.title).find(Boolean);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (title) document.title = `${title} · ${APP_NAME}`;
    const moveFocus = !firstLoad.current; // on first load focus stays at the top, as on any website
    firstLoad.current = false;

    // Pages that load data render their heading a moment later, so poll briefly (up to ~2s).
    // A timer rather than requestAnimationFrame, which browsers pause in hidden tabs.
    let timer = 0;
    let tries = 0;
    const settle = () => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) {
        if (tries++ < 40) timer = window.setTimeout(settle, 50);
        else if (!title) document.title = APP_NAME;
        return;
      }
      if (!title) document.title = `${heading.textContent?.trim()} · ${APP_NAME}`;
      if (moveFocus) {
        heading.tabIndex = -1;
        heading.focus();
      }
    };
    settle();
    return () => window.clearTimeout(timer);
  }, [pathname, title]);

  return <Outlet />;
}
