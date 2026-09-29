import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    // Only needed for the in-process test database, which can't share one session across connections.
    DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    // Comma-separated list of frontend origins allowed to call the API with cookies.
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
    // Frontend base URL, used to build links in emails.
    APP_URL: z.url(),
    // Path the refresh cookie is scoped to. "/auth" when the browser calls the API directly,
    // "/api/auth" when the frontend proxies /api/* to the backend.
    COOKIE_PATH: z.string().startsWith("/").default("/auth"),
    // Number of reverse proxies in front of the app (Render/Railway: 1), so rate limits see real IPs.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
  })
  .refine((env) => env.NODE_ENV !== "production" || (env.RESEND_API_KEY && env.EMAIL_FROM), {
    message: "RESEND_API_KEY and EMAIL_FROM are required in production",
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
}

export const config = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlMs: 30 * 24 * 60 * 60 * 1000,
  passwordResetTtlMs: 60 * 60 * 1000,
  refreshCookieName: "refresh_token",
};
