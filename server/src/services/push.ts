import { prisma } from "../lib/prisma.js";
import { sendPush, type PushMessage } from "../lib/push.js";

/**
 * Sends a notification to every device the user has turned notifications on for, and deletes
 * devices the push service reports as gone (uninstalled, permission revoked, expired).
 */
export async function sendToUser(userId: string, message: PushMessage): Promise<{ sent: number; removed: number }> {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const results = await Promise.all(subscriptions.map((s) => sendPush(s, message)));

  const gone = subscriptions.filter((_, i) => results[i] === "gone").map((s) => s.id);
  if (gone.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });

  return { sent: results.filter((r) => r === "sent").length, removed: gone.length };
}
