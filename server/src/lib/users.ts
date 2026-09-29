import type { User } from "../generated/prisma/client.js";
import { HttpError } from "./errors.js";
import { prisma } from "./prisma.js";

/** The logged-in user. A valid access token can outlive its account, hence the check. */
export async function findCurrentUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, "unauthorized", "Account no longer exists");
  return user;
}

/** The user fields safe to send to the client. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    weekStartDay: user.weekStartDay,
    theme: user.theme,
    createdAt: user.createdAt,
  };
}
