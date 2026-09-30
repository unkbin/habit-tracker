import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// vercel.json's Content Security Policy only allows index.html's inline script by its hash, so
// editing that script without updating the hash would stop it running in production (and the
// theme would flash). This catches that before deploying.

const root = join(__dirname, "../../..");
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy")!.value;

describe("vercel.json", () => {
  it("allows exactly the inline scripts in index.html, by hash", () => {
    const html = readFileSync(join(root, "client/index.html"), "utf8");
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    const allowed = [...csp.matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1]);
    const expected = inline.map((s) => `sha256-${createHash("sha256").update(s).digest("base64")}`);
    expect(allowed.sort()).toEqual(expected.sort());
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");
    expect(csp).toMatch(/script-src 'self' 'sha256-/);
  });

  it("proxies /api to the API and serves the app for every other path", () => {
    expect(vercel.rewrites[0]).toMatchObject({ source: "/api/:path*" });
    expect(vercel.rewrites[0]!.destination).toMatch(/^https:\/\/.+\/:path\*$/);
    expect(vercel.rewrites.at(-1)).toEqual({ source: "/((?!api/).*)", destination: "/index.html" });
  });
});
