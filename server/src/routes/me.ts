import { Router } from "express";
import { HttpError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { toPublicUser } from "../lib/users.js";
import { currentUserId, requireAuth } from "../middleware/requireAuth.js";

// PATCH, DELETE and export are added with the rest of the user endpoints in step 3.
export function meRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: currentUserId(req) } });
    if (!user) throw new HttpError(401, "unauthorized", "Account no longer exists");
    res.json({ user: toPublicUser(user) });
  });

  return router;
}
