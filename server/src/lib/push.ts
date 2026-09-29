import webpush from "web-push";
import { config } from "../config.js";

/** What the service worker shows. Keep it small: push payloads are limited to about 4 KB. */
export interface PushMessage {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** "gone": the push service says the subscription no longer exists, so it should be deleted. */
export type PushResult = "sent" | "gone" | "failed";

export type PushSender = (target: PushTarget, message: PushMessage) => Promise<PushResult>;

const webPushSender: PushSender = async (target, message) => {
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(message),
      {
        vapidDetails: {
          subject: config.VAPID_SUBJECT,
          publicKey: config.VAPID_PUBLIC_KEY!,
          privateKey: config.VAPID_PRIVATE_KEY!,
        },
        // A reminder that arrives hours late is noise; let the push service drop it after an hour.
        TTL: 60 * 60,
      },
    );
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("Push failed", status, (error as Error).message);
    return "failed";
  }
};

let sender: PushSender = webPushSender;

/** Tests swap in a sender that records messages. */
export function setPushSender(next: PushSender): void {
  sender = next;
}

export function sendPush(target: PushTarget, message: PushMessage): Promise<PushResult> {
  return sender(target, message);
}

// The server POSTs to whatever endpoint a browser registers, so only accept the real push
// services. Otherwise a user could register an internal URL and make the server call it (SSRF).
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, most Chromium browsers
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari and iOS home-screen apps
  ".push.apple.com",
  ".notify.windows.com", // Edge on Windows
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "") return false;
  return PUSH_SERVICE_HOSTS.some((host) =>
    host.startsWith(".") ? url.hostname.endsWith(host) : url.hostname === host,
  );
}
