import type { Request, Response } from "express";
import { config } from "../config.js";
import type { IssuedRefreshToken } from "../services/sessions.js";

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  // The frontend and API are served from the same site (see docs/DECISIONS.md), so Lax is
  // enough for the cookie to be sent and blocks it on cross-site requests (CSRF).
  sameSite: "lax" as const,
  path: config.COOKIE_PATH,
});

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[config.refreshCookieName];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function setRefreshCookie(res: Response, issued: IssuedRefreshToken): void {
  res.cookie(config.refreshCookieName, issued.token, { ...cookieOptions(), expires: issued.expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.refreshCookieName, cookieOptions());
}
