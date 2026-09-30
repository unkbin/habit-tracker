import { http, HttpResponse } from "msw";
import type { Habit, TodayItem, User } from "../api/types";
import { server } from "./setup";

// A small in-memory stand-in for the API, just enough for the flow tests. It records every
// request so tests can assert on exactly what the app sent. The real API has its own tests.

const API = "http://localhost:3000/api";
export const TODAY = "2026-09-30";

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

export interface FakeApi {
  /** Logged-in user, or null when the refresh cookie would be missing. */
  user: User | null;
  habits: Habit[];
  /** Habit id -> amount logged today (null for yes/no habits). */
  doneToday: Map<string, number | null>;
  requests: RecordedRequest[];
  /** Make check-off saves fail with a 500. */
  failCheckOffs: boolean;
  /** Every request fails as if the connection dropped. */
  offline: boolean;
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "ada@example.com",
    name: "Ada",
    timezone: "UTC",
    weekStartDay: 1,
    theme: "LIGHT",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: `habit-${Math.random().toString(36).slice(2, 8)}`,
    name: "Drink water",
    description: null,
    icon: "droplet",
    color: "#0284c7",
    frequency: "DAILY",
    targetWeekdays: [],
    timesPerWeek: null,
    targetValue: null,
    unit: null,
    startDate: "2026-09-01",
    reminderTime: null,
    sortOrder: 0,
    archived: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Installs the fake API for one test. Mutate the returned state to shape what the app sees. */
export function installFakeApi(initial: Partial<FakeApi> = {}): FakeApi {
  const state: FakeApi = {
    user: null,
    habits: [],
    doneToday: new Map(),
    requests: [],
    failCheckOffs: false,
    offline: false,
    ...initial,
  };

  const session = () => ({ accessToken: "test-access-token", user: state.user });
  const record = async (request: Request, path: string) => {
    const text = await request.clone().text();
    state.requests.push({ method: request.method, path, body: text ? JSON.parse(text) : undefined });
  };
  const today = () => {
    const items: TodayItem[] = state.habits
      .filter((h) => !h.archived)
      .map((habit) => {
        const done = state.doneToday.has(habit.id);
        return {
          habit,
          done,
          value: state.doneToday.get(habit.id) ?? null,
          note: null,
          streak: { current: done ? 1 : 0, longest: 1, unit: "days" },
          weekProgress: null,
          satisfied: done,
        };
      });
    return {
      date: TODAY,
      summary: { completed: items.filter((i) => i.satisfied).length, total: items.length },
      habits: items,
    };
  };

  server.use(
    // Checked first: while "offline", nothing gets through.
    http.all(`${API}/*`, () => (state.offline ? HttpResponse.error() : undefined)),
    http.post(`${API}/auth/refresh`, () =>
      state.user ? HttpResponse.json(session()) : HttpResponse.json({ error: { code: "unauthorized", message: "Session expired" } }, { status: 401 }),
    ),
    http.post(`${API}/auth/signup`, async ({ request }) => {
      await record(request, "/auth/signup");
      const body = (await request.json()) as { email: string; name?: string; timezone: string };
      state.user = makeUser({ email: body.email, name: body.name ?? null, timezone: body.timezone });
      return HttpResponse.json(session(), { status: 201 });
    }),
    http.get(`${API}/today`, () => HttpResponse.json(today())),
    http.get(`${API}/habits`, () => HttpResponse.json({ habits: state.habits })),
    http.post(`${API}/habits`, async ({ request }) => {
      await record(request, "/habits");
      const body = (await request.json()) as Partial<Habit>;
      const habit = makeHabit({ ...body, sortOrder: state.habits.length });
      state.habits.push(habit);
      return HttpResponse.json({ habit }, { status: 201 });
    }),
    http.post(`${API}/habits/:id/completions`, async ({ request, params }) => {
      await record(request, `/habits/${params.id}/completions`);
      if (state.failCheckOffs) return HttpResponse.json({ error: { code: "internal_error", message: "Something went wrong" } }, { status: 500 });
      const body = (await request.json()) as { date: string; value?: number | null };
      state.doneToday.set(String(params.id), body.value ?? null);
      return HttpResponse.json({ completion: { date: body.date, value: body.value ?? null, note: null } });
    }),
    http.delete(`${API}/habits/:id/completions/:date`, async ({ request, params }) => {
      await record(request, `/habits/${params.id}/completions/${params.date}`);
      state.doneToday.delete(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${API}/stats/overview`, () => HttpResponse.json({})),
  );
  return state;
}
