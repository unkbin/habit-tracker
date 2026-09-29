import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { habitsRouter } from "./routes/habits.js";
import { meRouter } from "./routes/me.js";
import { statsRouter } from "./routes/stats.js";
import { todayRouter } from "./routes/today.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", config.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/auth", authRouter());
  app.use("/me", meRouter());
  app.use("/habits", habitsRouter());
  app.use("/today", todayRouter());
  app.use("/stats", statsRouter());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
