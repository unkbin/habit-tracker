import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { HttpError, validationError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isAllowedPushEndpoint } from "../lib/push.js";
import { findCurrentUser } from "../lib/users.js";
import { currentUserId, requireAuth } from "../middleware/requireAuth.js";
import { sendToUser } from "../services/push.js";

/** Oldest devices are forgotten beyond this, so one account can't pile up subscriptions. */
const MAX_DEVICES_PER_USER = 20;

// The shape of PushSubscription.toJSON() in the browser.
const subscriptionBody = z.object({
  endpoint: z.string().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});
const endpointBody = z.object({ endpoint: z.string().max(1000) });

export function pushRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // The browser needs this to subscribe. Null when the server has no VAPID keys configured.
  router.get("/public-key", (_req, res) => {
    res.json({ publicKey: config.pushEnabled ? config.VAPID_PUBLIC_KEY : null });
  });

  // Registers this device for the logged-in user. A browser has one subscription per site, so if
  // someone else was logged in here before, the device moves to the current user.
  router.post("/subscriptions", async (req, res) => {
    const body = subscriptionBody.parse(req.body);
    if (!isAllowedPushEndpoint(body.endpoint)) {
      throw validationError([{ path: "endpoint", message: "Not a recognised push service" }]);
    }
    const userId = currentUserId(req);
    const data = { userId, p256dh: body.keys.p256dh, auth: body.keys.auth };
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { endpoint: body.endpoint, ...data },
      update: data,
    });

    const extra = await prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    if (extra.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: extra.map((s) => s.id) } } });

    res.status(201).json({ ok: true });
  });

  // Turns notifications off for one device. Only the owner's own subscription can be removed.
  router.delete("/subscriptions", async (req, res) => {
    const { endpoint } = endpointBody.parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: currentUserId(req) } });
    res.status(204).end();
  });

  // "Send a test notification" in Settings.
  router.post("/test", async (req, res) => {
    if (!config.pushEnabled) throw new HttpError(503, "push_not_configured", "Notifications aren't set up on this server");
    const user = await findCurrentUser(currentUserId(req));
    const result = await sendToUser(user.id, {
      title: "Notifications are on",
      body: "This is how your habit reminders will look.",
      url: "/",
      tag: "test",
    });
    if (result.sent === 0) {
      throw new HttpError(409, "no_devices", "No device with notifications turned on. Turn them on first.");
    }
    res.json(result);
  });

  return router;
}
