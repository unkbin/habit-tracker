import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app: a manifest plus our own service worker (src/sw.ts), which precaches the app
    // shell so it opens instantly and offline, and shows reminder notifications. The plugin builds
    // it and injects the list of files to cache.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
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
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
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
