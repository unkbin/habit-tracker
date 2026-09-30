import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteError } from "../components/layout/RouteError";
import { installFakeApi, makeUser } from "./fakeApi";
import { renderApp } from "./renderApp";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("privacy page", () => {
  it("is readable without an account and linked from the login page", async () => {
    installFakeApi();
    const { user } = renderApp("/login");
    await user.click(await screen.findByRole("link", { name: "Privacy" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cookies and storage" })).toBeInTheDocument();
  });

  it("is also readable when logged in", async () => {
    installFakeApi({ user: makeUser() });
    renderApp("/privacy");
    expect(await screen.findByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
  });
});

describe("error page", () => {
  // A router whose only page throws, with the app's error page attached as in router.tsx.
  function renderCrash(error: Error) {
    const router = createMemoryRouter([
      {
        path: "/",
        errorElement: <RouteError />,
        Component: () => {
          throw error;
        },
      },
    ]);
    return render(<RouterProvider router={router} />);
  }

  it("replaces a crashed screen with a way back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderCrash(new Error("boom"));
    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute("href", "/");
  });

  it("reloads once when a new deploy removed the page's code, then stops", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    const stale = new Error("Failed to fetch dynamically imported module: /assets/StatsPage-abc.js");

    const first = renderCrash(stale);
    await screen.findByRole("heading", { name: "There's a new version of Habits" });
    expect(reload).toHaveBeenCalledTimes(1);
    first.unmount();

    // If the reload didn't help, don't loop: show the page instead.
    renderCrash(stale);
    await screen.findByRole("heading", { name: "There's a new version of Habits" });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
