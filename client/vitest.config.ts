import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Component and flow tests run the real app in jsdom against a fake API (src/test/fakeApi.ts).
// Separate from vite.config.ts so the PWA and Tailwind plugins stay out of tests.
export default defineConfig({
  plugins: [react()],
  define: {
    // Node's fetch needs absolute URLs; the fake API answers here.
    "import.meta.env.VITE_API_URL": JSON.stringify("http://localhost:3000/api"),
  },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
