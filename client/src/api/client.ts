// HTTP client for the API. Owns the access token: it lives only in this module's memory (never
// localStorage), is attached to every request, and is renewed from the httpOnly refresh cookie
// when the API answers 401.

import type { User } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldError[] = [],
  ) {
    super(message);
  }
}

export interface Session {
  accessToken: string;
  user: User;
}

let accessToken: string | null = null;
let onSessionLost: () => void = () => {};

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Called when the session can't be renewed, so the app can show the login page. */
export function setSessionLostHandler(handler: () => void): void {
  onSessionLost = handler;
}

let refreshInFlight: Promise<Session | null> | null = null;

/**
 * Swaps the refresh cookie for a new access token. Returns null if the session has ended.
 *
 * The API treats a reused refresh token as theft and logs the user out, so two refreshes must
 * never race with the same cookie: within a tab, callers share one request; across tabs, the
 * Web Locks API makes them take turns (each then sends the newest cookie).
 */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= withCrossTabLock(async () => {
    const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return null;
    const session = (await res.json()) as Session;
    accessToken = session.accessToken;
    return session;
  }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return fn();
  return (await navigator.locks.request("habits-auth-refresh", fn)) as T;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the refresh-and-retry on 401 (used by the auth endpoints themselves). */
  noRetry?: boolean;
}

export async function api<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = () =>
    fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: {
        ...(options.body !== undefined && { "Content-Type": "application/json" }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res = await send();
  if (res.status === 401 && !options.noRetry) {
    const session = await refreshSession();
    if (!session) {
      onSessionLost();
      throw await toApiError(res);
    }
    res = await send();
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.clone().json()) as { error?: { code: string; message: string; fields?: FieldError[] } };
    if (body.error) return new ApiError(res.status, body.error.code, body.error.message, body.error.fields);
  } catch {
    // Not JSON: fall through.
  }
  return new ApiError(res.status, "network_error", res.status >= 500 ? "Something went wrong on our side" : res.statusText);
}

/** Friendly message for any error thrown by `api`, including network failures. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return "Can't reach the server. Check your connection.";
  return "Something went wrong";
}
