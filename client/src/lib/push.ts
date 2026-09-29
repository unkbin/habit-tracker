// Web Push on this device: detecting support, and turning notifications on and off.

import { api } from "../api/client";

/**
 * - "unsupported": this browser can't receive web push at all.
 * - "needs-install": iPhone/iPad Safari, which only allows push for apps added to the Home Screen.
 * - "no-worker": the service worker isn't running (development server, or a browser that blocks
 *   service workers). Notifications work in the built, installed app.
 * - "ready": can subscribe.
 */
export type PushSupport = "unsupported" | "needs-install" | "no-worker" | "ready";

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export async function pushSupport(): Promise<PushSupport> {
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? "ready" : "no-worker";
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker?.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Asks permission if needed, subscribes this device, and registers it with the server. */
export async function enablePush(): Promise<"enabled" | "denied" | "not-configured"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const { publicKey } = await api<{ publicKey: string | null }>("/push/public-key");
  if (!publicKey) return "not-configured";

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  await api("/push/subscriptions", { method: "POST", body: subscription.toJSON() });
  return "enabled";
}

/** Stops notifications on this device, on the server and in the browser. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api("/push/subscriptions", { method: "DELETE", body: { endpoint: subscription.endpoint } });
  await subscription.unsubscribe();
}

/**
 * On logout: this device shouldn't keep getting reminders for someone who has logged out.
 * Best effort; never blocks logging out.
 */
export async function forgetThisDevice(): Promise<void> {
  try {
    await Promise.race([disablePush(), new Promise((resolve) => setTimeout(resolve, 3000))]);
  } catch {
    // Offline or already gone: the server drops dead subscriptions on its own.
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
