import type { User } from "../generated/prisma/client.js";

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
