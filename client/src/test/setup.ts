import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { setAccessToken } from "../api/client";

// Browser features jsdom doesn't have.

// Reports "reduce motion" so celebrations skip the (canvas) confetti; everything else is "no".
window.matchMedia = (query: string) =>
  ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

/** Every request the app makes goes here; tests install handlers with `server.use(...)`. */
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  // The access token lives in module memory; don't let one test's session leak into the next.
  setAccessToken(null);
  localStorage.clear();
});
afterAll(() => server.close());
