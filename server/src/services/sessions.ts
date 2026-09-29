import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { generateOpaqueToken, hashToken } from "../lib/tokens.js";

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

/** Starts a new session family (a fresh login). */
export async function createSession(userId: string, userAgent?: string): Promise<IssuedRefreshToken> {
  // Opportunistic cleanup; revoked-but-unexpired rows are kept for reuse detection.
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  return issue(prisma, userId, randomUUID(), userAgent);
}

/**
 * Exchanges a refresh token for a new one in the same family.
 * Returns null if the token is unknown, expired or already used. Presenting an already-used
 * token means it may have been stolen, so the whole family is revoked (logging out every
 * device that descends from that login).
 */
export async function rotateSession(
  token: string,
  userAgent?: string,
): Promise<(IssuedRefreshToken & { userId: string }) | null> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!session || session.expiresAt <= now) return null;

    if (session.revokedAt) {
      await tx.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      return null;
    }

    // Conditional update so two concurrent refreshes can't both succeed.
    const { count } = await tx.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count === 0) return null;

    const issued = await issue(tx, session.userId, session.familyId, userAgent);
    return { ...issued, userId: session.userId };
  });
}

/** Logs out the device holding this token (its whole family). Unknown tokens are ignored. */
export async function revokeSessionFamily(token: string): Promise<void> {
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) return;
  await prisma.session.updateMany({
    where: { familyId: session.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

type SessionWriter = Pick<typeof prisma, "session">;

async function issue(
  db: SessionWriter,
  userId: string,
  familyId: string,
  userAgent?: string,
): Promise<IssuedRefreshToken> {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlMs);
  await db.session.create({
    data: { userId, familyId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent?.slice(0, 500) },
  });
  return { token, expiresAt };
}
