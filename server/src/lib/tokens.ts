import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";

const secret = new TextEncoder().encode(config.JWT_SECRET);
const AUDIENCE = "habit-tracker";

export function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(secret);
}

/** Returns the user id, or null if the token is invalid or expired. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience: AUDIENCE, algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** Random token for refresh cookies and reset links. Only its hash is ever stored. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

// SHA-256 is enough here (no salt/slow hash needed): the tokens are 256 random bits, not passwords.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
