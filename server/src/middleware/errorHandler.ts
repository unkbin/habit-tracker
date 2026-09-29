import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../lib/errors.js";

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "not_found", message: "Not found" } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Invalid request",
        fields: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    });
    return;
  }
  // Races the route checks can't rule out, e.g. two identical requests at once or a row
  // deleted mid-request. Safe to report; the client can refetch and retry.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: { code: "conflict", message: "That was changed at the same time, try again" } });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: { code: "not_found", message: "Not found" } });
      return;
    }
  }
  // Malformed JSON body from express.json().
  if (typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "invalid_json", message: "Request body is not valid JSON" } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
}
