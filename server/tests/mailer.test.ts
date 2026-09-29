import { afterEach, describe, expect, it, vi } from "vitest";
import { createResendTransport } from "../src/lib/mailer.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Resend transport", () => {
  it("sends the email in the shape Resend's API expects", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createResendTransport("re_test_key", "Habits <hello@example.com>")({
      to: "ada@example.com",
      subject: "Reset your password",
      text: "Here is your link",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_key", "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Habits <hello@example.com>",
      to: ["ada@example.com"],
      subject: "Reset your password",
      text: "Here is your link",
    });
  });

  it("fails loudly when Resend refuses, so the caller logs it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"Invalid API key"}', { status: 401 })));
    const send = createResendTransport("bad", "hello@example.com");
    await expect(send({ to: "a@example.com", subject: "s", text: "t" })).rejects.toThrow(/Resend responded 401.*Invalid API key/);
  });
});
