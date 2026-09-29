import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { isAllowedPushEndpoint, setPushSender, type PushMessage } from "../src/lib/push.js";
import { createUser, resetDatabase, type TestUser } from "./helpers.js";

let app: ReturnType<typeof createApp>;
let ada: TestUser;
let sent: { endpoint: string; message: PushMessage }[];
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";
const keys = { p256dh: "BPublicKeyFromTheBrowser", auth: "authSecret" };

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  ada = await createUser(app);
  sent = [];
  setPushSender(async (target, message) => {
    sent.push({ endpoint: target.endpoint, message });
    return "sent";
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    ["https://fcm.googleapis.com/fcm/send/x", true],
    ["https://updates.push.services.mozilla.com/wpush/v2/x", true],
    ["https://web.push.apple.com/abc", true],
    ["https://db5p.notify.windows.com/w/?token=x", true],
    ["http://fcm.googleapis.com/fcm/send/x", false], // not https
    ["https://fcm.googleapis.com:8443/x", false], // odd port
    ["https://fcm.googleapis.com.evil.example/x", false], // lookalike host
    ["https://localhost/x", false],
    ["https://169.254.169.254/latest/meta-data", false], // cloud metadata (SSRF)
    ["not a url", false],
  ])("%s -> %s", (endpoint, allowed) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(allowed);
  });
});

describe("push API", () => {
  it("gives the browser the public key", async () => {
    const res = await ada.get("/push/public-key");
    expect(res.body).toEqual({ publicKey: "test-public-key" });
  });

  it("registers a device, and re-registering updates it rather than duplicating", async () => {
    expect((await ada.post("/push/subscriptions").send({ endpoint: FCM, keys })).status).toBe(201);
    expect((await ada.post("/push/subscriptions").send({ endpoint: FCM, keys: { ...keys, auth: "new" } })).status).toBe(201);
    const stored = await prisma.pushSubscription.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ userId: ada.id, auth: "new" });
  });

  it("refuses endpoints that aren't a push service", async () => {
    const res = await ada.post("/push/subscriptions").send({ endpoint: "https://internal.example/hook", keys });
    expect(res.status).toBe(400);
    expect(res.body.error.fields[0].path).toBe("endpoint");
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("moves a device to whoever logs in on it next", async () => {
    await ada.post("/push/subscriptions").send({ endpoint: FCM, keys });
    const bob = await createUser(app);
    await bob.post("/push/subscriptions").send({ endpoint: FCM, keys });
    const stored = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: FCM } });
    expect(stored.userId).toBe(bob.id);
  });

  it("keeps at most 20 devices per person, forgetting the oldest", async () => {
    for (let i = 0; i < 22; i++) {
      await ada.post("/push/subscriptions").send({ endpoint: `${FCM}-${i}`, keys });
    }
    const endpoints = (await prisma.pushSubscription.findMany({ select: { endpoint: true } })).map((s) => s.endpoint);
    expect(endpoints).toHaveLength(20);
    expect(endpoints).not.toContain(`${FCM}-0`);
    expect(endpoints).toContain(`${FCM}-21`);
  });

  it("turns a device off, but only for its owner", async () => {
    await ada.post("/push/subscriptions").send({ endpoint: FCM, keys });
    const bob = await createUser(app);
    expect((await bob.delete("/push/subscriptions").send({ endpoint: FCM })).status).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(1);

    expect((await ada.delete("/push/subscriptions").send({ endpoint: FCM })).status).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("sends a test notification to the person's devices only", async () => {
    expect((await ada.post("/push/test")).body.error.code).toBe("no_devices");

    await ada.post("/push/subscriptions").send({ endpoint: FCM, keys });
    const bob = await createUser(app);
    await bob.post("/push/subscriptions").send({ endpoint: `${FCM}-bob`, keys });

    const res = await ada.post("/push/test");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 1, removed: 0 });
    expect(sent.map((s) => s.endpoint)).toEqual([FCM]);
  });

  it("requires login", async () => {
    const res = await ada.post("/push/subscriptions").set("Authorization", "").send({ endpoint: FCM, keys });
    expect(res.status).toBe(401);
  });

  it("deletes a person's devices with their account", async () => {
    await ada.post("/push/subscriptions").send({ endpoint: FCM, keys });
    await ada.delete("/me").send({ password: "correct horse battery" });
    expect(await prisma.pushSubscription.count()).toBe(0);
  });
});
