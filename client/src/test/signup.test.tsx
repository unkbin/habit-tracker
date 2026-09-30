import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { installFakeApi } from "./fakeApi";
import { renderApp } from "./renderApp";

describe("signing up", () => {
  it("creates the account with the device's timezone and starts onboarding", async () => {
    const api = installFakeApi();
    const { user } = renderApp("/signup");

    await user.type(await screen.findByLabelText("Name (optional)"), "Ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Small steps, every day" })).toBeInTheDocument();
    expect(api.requests).toEqual([
      {
        method: "POST",
        path: "/auth/signup",
        body: {
          name: "Ada",
          email: "ada@example.com",
          password: "correct horse battery",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      },
    ]);
  });

  it("checks the form before sending anything", async () => {
    const api = installFakeApi();
    const { user } = renderApp("/signup");

    await user.type(await screen.findByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(api.requests).toEqual([]);
  });

  it("sends a logged-out visitor from the app to the login page", async () => {
    installFakeApi();
    renderApp("/stats");
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
});
