import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { AppProviders, createQueryClient } from "./app/AppProviders";
import "./index.css";
import { initErrorReporting } from "./lib/errorReporting";
import { router } from "./router";

void initErrorReporting();

// RouteError reloads once when a new deploy makes an old page file disappear, and leaves a marker
// so a genuinely broken file can't cause a reload loop. Once the app has run fine for a while,
// clear it so the next deploy can do the same.
setTimeout(() => {
  try {
    sessionStorage.removeItem("habits-reloaded-for-update");
  } catch {
    // Storage blocked: nothing to clear.
  }
}, 30_000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders queryClient={createQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
