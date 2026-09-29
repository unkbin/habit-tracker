import type { NextFunction, Request, Response } from "express";
import { unauthorized } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/tokens.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Requires a valid `Authorization: Bearer <access token>` header and sets `req.userId`. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) throw unauthorized();
  req.userId = userId;
  next();
}

/** The authenticated user's id. Only valid in handlers mounted behind `requireAuth`. */
export function currentUserId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
