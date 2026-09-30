import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { installFakeApi, makeHabit, makeUser, TODAY } from "./fakeApi";
import { renderApp } from "./renderApp";

function twoHabits() {
  return [makeHabit({ id: "water", name: "Drink water" }), makeHabit({ id: "read", name: "Read", icon: "book", sortOrder: 1 })];
}

const progress = () => screen.getByRole("img", { name: /habits done today/ });

describe("checking a habit off", () => {
  it("ticks it instantly and saves it for today's date", async () => {
    const api = installFakeApi({ user: makeUser(), habits: twoHabits() });
    const { user } = renderApp("/");

    const button = await screen.findByRole("button", { name: "Mark Drink water done" });
    expect(progress()).toHaveAccessibleName("0 of 2 habits done today");

    await user.click(button);

    // Optimistic: the screen updates before the server answers.
    expect(screen.getByRole("button", { name: "Drink water: done. Tap to undo" })).toHaveAttribute("aria-pressed", "true");
    expect(progress()).toHaveAccessibleName("1 of 2 habits done today");
    await waitFor(() =>
      expect(api.requests).toContainEqual({ method: "POST", path: "/habits/water/completions", body: { date: TODAY, value: null } }),
    );
  });

  it("puts it back and says so when saving fails", async () => {
    installFakeApi({ user: makeUser(), habits: twoHabits(), failCheckOffs: true });
    const { user } = renderApp("/");

    await user.click(await screen.findByRole("button", { name: "Mark Drink water done" }));

    expect(await screen.findByText(/Couldn't update Drink water/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Drink water done" })).toHaveAttribute("aria-pressed", "false");
    expect(progress()).toHaveAccessibleName("0 of 2 habits done today");
  });

  it("puts it back when the connection drops, even though it can't refetch", async () => {
    const api = installFakeApi({ user: makeUser(), habits: twoHabits() });
    const { user } = renderApp("/");
    const button = await screen.findByRole("button", { name: "Mark Drink water done" });

    api.offline = true;
    await user.click(button);

    expect(await screen.findByText(/Couldn't update Drink water. Can't reach the server/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Drink water done" })).toHaveAttribute("aria-pressed", "false");
    expect(progress()).toHaveAccessibleName("0 of 2 habits done today");
    // The failed refresh keeps the list on screen, with a notice, rather than an error page.
    expect(await screen.findByText("Couldn't refresh. Showing what was last loaded.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Read done" })).toBeInTheDocument();
  });

  it("offers Undo after unchecking", async () => {
    const api = installFakeApi({ user: makeUser(), habits: twoHabits(), doneToday: new Map([["water", null]]) });
    const { user } = renderApp("/");

    await user.click(await screen.findByRole("button", { name: "Drink water: done. Tap to undo" }));
    expect(await screen.findByText("Unchecked Drink water")).toBeInTheDocument();
    await waitFor(() => expect(api.requests.map((r) => r.method)).toContain("DELETE"));

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: "Drink water: done. Tap to undo" })).toBeInTheDocument();
    await waitFor(() => expect(api.doneToday.has("water")).toBe(true));
  });

  it("celebrates when the last habit of the day is done", async () => {
    installFakeApi({ user: makeUser(), habits: twoHabits(), doneToday: new Map([["water", null]]) });
    const { user } = renderApp("/");

    await user.click(await screen.findByRole("button", { name: "Mark Read done" }));

    expect(await screen.findByText("All done for today. Nice work!")).toBeInTheDocument();
    expect(screen.getByText("All done for today")).toBeInTheDocument();
  });

  it("invites a new user to create a first habit", async () => {
    installFakeApi({ user: makeUser() });
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Start your first habit" })).toBeInTheDocument();
    // Both the header's "+" and the empty state's button lead to the form.
    const links = screen.getAllByRole("link", { name: /New habit/ });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute("href", "/habits/new");
  });
});
