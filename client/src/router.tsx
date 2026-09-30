import type { ComponentType } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { RequireAnonymous, RequireAuth } from "./auth/guards";
import { AppLayout } from "./components/layout/AppLayout";
import { RootLayout } from "./components/layout/RootLayout";
import { RouteError } from "./components/layout/RouteError";
import { FullPageSpinner } from "./components/ui/Spinner";
import { LoginPage } from "./pages/auth/LoginPage";
import { TodayPage } from "./pages/today/TodayPage";

// Login and Today are where almost every visit starts, so they ship in the main bundle. Every
// other screen is its own chunk, downloaded the first time it's opened; while it loads, the
// current screen stays up (a first page load shows the spinner).
// `handle.title` names the page in the browser tab (see RootLayout).

/** A route whose component is downloaded on first visit. */
function lazyPage<M>(load: () => Promise<M>, pick: (module: M) => ComponentType) {
  return async () => ({ Component: pick(await load()) });
}

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    hydrateFallbackElement: <FullPageSpinner />,
    // Any screen that crashes (or whose code can no longer be downloaded) lands here.
    errorElement: <RouteError />,
    children: [
      {
        element: <RequireAnonymous />,
        children: [
          { path: "/login", element: <LoginPage />, handle: { title: "Log in" } },
          {
            path: "/signup",
            handle: { title: "Sign up" },
            lazy: lazyPage(() => import("./pages/auth/SignupPage"), (m) => m.SignupPage),
          },
          {
            path: "/forgot-password",
            handle: { title: "Reset your password" },
            lazy: lazyPage(() => import("./pages/auth/PasswordPages"), (m) => m.ForgotPasswordPage),
          },
          {
            path: "/reset-password",
            handle: { title: "Choose a new password" },
            lazy: lazyPage(() => import("./pages/auth/PasswordPages"), (m) => m.ResetPasswordPage),
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          // Full screen, without the tab bar.
          {
            path: "/welcome",
            handle: { title: "Welcome" },
            lazy: lazyPage(() => import("./pages/onboarding/WelcomePage"), (m) => m.WelcomePage),
          },
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <TodayPage />, handle: { title: "Today" } },
              {
                path: "habits",
                handle: { title: "All habits" },
                lazy: lazyPage(() => import("./pages/habits/HabitsPage"), (m) => m.HabitsPage),
              },
              {
                path: "habits/new",
                handle: { title: "New habit" },
                lazy: lazyPage(() => import("./pages/habits/HabitFormPages"), (m) => m.NewHabitPage),
              },
              {
                // No fixed title: the tab takes the habit's name from its heading.
                path: "habits/:id",
                lazy: lazyPage(() => import("./pages/habits/HabitDetailPage"), (m) => m.HabitDetailPage),
              },
              {
                path: "habits/:id/edit",
                handle: { title: "Edit habit" },
                lazy: lazyPage(() => import("./pages/habits/HabitFormPages"), (m) => m.EditHabitPage),
              },
              {
                path: "stats",
                handle: { title: "Statistics" },
                lazy: lazyPage(() => import("./pages/stats/StatsPage"), (m) => m.StatsPage),
              },
              {
                path: "settings",
                handle: { title: "Settings" },
                lazy: lazyPage(() => import("./pages/settings/SettingsPage"), (m) => m.SettingsPage),
              },
            ],
          },
        ],
      },
      // Public: readable whether or not you are logged in.
      {
        path: "/privacy",
        handle: { title: "Privacy" },
        lazy: lazyPage(() => import("./pages/PrivacyPage"), (m) => m.PrivacyPage),
      },
      {
        path: "*",
        handle: { title: "Page not found" },
        lazy: lazyPage(() => import("./pages/NotFoundPage"), (m) => m.NotFoundPage),
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
