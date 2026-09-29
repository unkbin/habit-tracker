/// <reference lib="webworker" />
// The service worker. Built by vite-plugin-pwa (injectManifest), which fills in __WB_MANIFEST
// with every file of the build. Type-checked separately (tsconfig.sw.json) because it runs in a
// worker, not a page.

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

// App shell: every built file is cached, new versions take over at once and old caches go.
// Page routes load index.html (so the app opens offline); /api/* is never cached, because stale
// check-offs shown as current would be worse than the app's "can't reach the server" state.
void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//] }));

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

// A reminder from the server (see server/src/jobs/reminders.ts for what it sends).
self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Habits", {
      body: payload.body,
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      tag: payload.tag,
      data: { url: payload.url ?? "/" },
    }),
  );
});

// Tapping a notification opens the app (or focuses it, if it's already open) on the given page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string } | null)?.url ?? "/", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) {
        await self.clients.openWindow(target.href);
        return;
      }
      await open.focus();
      if (new URL(open.url).pathname !== target.pathname) await open.navigate(target.href);
    })(),
  );
});
