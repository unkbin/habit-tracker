import type { Response } from "supertest";
import { prisma } from "../src/lib/prisma.js";

/** Empties every table. Deleting users cascades to everything else. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE`);
}

/** The refresh cookie from a response, as a `name=value` string ready for a Cookie header. */
export function refreshCookieFrom(res: Response): string {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith("refresh_token="));
  if (!cookie) throw new Error("Response did not set a refresh_token cookie");
  return cookie.split(";")[0]!;
}

/** The raw Set-Cookie header for the refresh cookie, including its attributes. */
export function rawRefreshCookie(res: Response): string | undefined {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  return header?.find((c) => c.startsWith("refresh_token="));
}
