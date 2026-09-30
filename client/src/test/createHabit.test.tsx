import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { todayIn } from "../lib/dates";
import { installFakeApi, makeUser } from "./fakeApi";
import { renderApp } from "./renderApp";

describe("creating a habit", () => {
  it("sends the habit as chosen and shows it on Today", async () => {
    const api = installFakeApi({ user: makeUser() });
    const { user } = renderApp("/habits/new");

    await user.type(await screen.findByLabelText("Name"), "Evening walk");
    await user.click(screen.getByRole("radio", { name: "Walk" }));
    await user.click(screen.getByRole("radio", { name: "Green" }));
    await user.click(screen.getByRole("radio", { name: "Some days" }));

    // "Some days" starts on Monday-Friday; drop Friday.
    const days = within(screen.getByRole("group", { name: "On these days" }));
    expect(days.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
    await user.click(days.getByRole("button", { name: "Fri" }));

    await user.click(screen.getByRole("button", { name: "Create habit" }));

    expect(await screen.findByText("Added Evening walk")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Mark Evening walk done" })).toBeInTheDocument();
    expect(api.requests.find((r) => r.path === "/habits")?.body).toEqual({
      name: "Evening walk",
      description: null,
      icon: "footprints",
      color: "#16a34a",
      frequency: "WEEKDAYS",
      targetWeekdays: [1, 2, 3, 4],
      timesPerWeek: null,
      targetValue: null,
      unit: null,
      reminderTime: null,
      startDate: todayIn("UTC"),
    });
  });

  it("fills in a suggestion and sends an amount goal", async () => {
    const api = installFakeApi({ user: makeUser() });
    const { user } = renderApp("/habits/new");

    await user.click(await screen.findByRole("button", { name: "Drink water" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Drink water");

    await user.click(screen.getByRole("switch", { name: /Track an amount/ }));
    await user.type(screen.getByLabelText("Daily goal"), "8");
    await user.type(screen.getByLabelText("Unit (optional)"), "glasses");
    await user.click(screen.getByRole("button", { name: "Create habit" }));

    await screen.findByText("Added Drink water");
    expect(api.requests.find((r) => r.path === "/habits")?.body).toMatchObject({
      name: "Drink water",
      icon: "droplet",
      frequency: "DAILY",
      targetValue: 8,
      unit: "glasses",
    });
  });

  it("points out missing fields instead of sending", async () => {
    const api = installFakeApi({ user: makeUser() });
    const { user } = renderApp("/habits/new");

    await user.click(await screen.findByRole("radio", { name: "Some days" }));
    const days = within(screen.getByRole("group", { name: "On these days" }));
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) await user.click(days.getByRole("button", { name: day }));
    await user.click(screen.getByRole("button", { name: "Create habit" }));

    expect(await screen.findByText("Give the habit a name")).toBeInTheDocument();
    expect(screen.getByText("Pick at least one day")).toBeInTheDocument();
    expect(api.requests.filter((r) => r.path === "/habits")).toEqual([]);
  });
});
