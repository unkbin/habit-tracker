import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app: a manifest plus a service worker that precaches the app shell, so it opens
    // instantly and offline. API calls are deliberately never cached: stale check-offs shown as
    // current would be worse than the app's "can't reach the server" state.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Habits",
        short_name: "Habits",
        description: "Build good habits, one day at a time.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#3f6b4f",
        background_color: "#f7f7f5",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        // Take control of the page on the very first visit (not only after a reload), activate new
        // versions straight away, and drop caches from old versions.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        // Client-side routes load the app shell; /api/* always goes to the network.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5173,
    // The app always calls the API at /api on its own origin, so the refresh cookie is
    // first-party. In development Vite forwards /api/* to the API; in production the host
    // does the same with a rewrite (see docs/DECISIONS.md). `vite preview` reuses this proxy.
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
