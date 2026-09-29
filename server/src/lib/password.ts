import argon2 from "argon2";

// argon2id with the library defaults (64 MiB, 3 passes), which meet OWASP's recommendation.
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// Verified against when an email isn't registered, so a login for an unknown email takes as
// long as one with a wrong password and can't be used to discover which emails exist.
const dummyHash = hashPassword("not-a-real-password");

export async function burnPasswordCheck(password: string): Promise<void> {
  await argon2.verify(await dummyHash, password);
}
