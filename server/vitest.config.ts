import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/globalSetup.ts"],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
      CORS_ORIGINS: "http://localhost:5173",
      APP_URL: "http://localhost:5173",
      COOKIE_PATH: "/auth",
      RESEND_API_KEY: "",
    },
  },
});
