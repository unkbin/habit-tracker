import { rateLimit } from "express-rate-limit";

function limiter(windowMinutes: number, limit: number) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many attempts, try again later" } });
    },
  });
}

// Created per app so each app instance (and each test) gets its own in-memory counters.
// With more than one server instance, switch to a shared store such as Redis.
export function createAuthLimiters() {
  return {
    login: limiter(15, 10),
    signup: limiter(60, 5),
    forgotPassword: limiter(60, 5),
    resetPassword: limiter(15, 10),
  };
}
