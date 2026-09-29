// The auth context and its hooks. Kept apart from AuthProvider.tsx so that file exports only a
// component: Vite's fast refresh can then hot-swap it without creating a second context that
// components still holding the old one would fail to find.

import { createContext, use } from "react";
import type { User } from "../api/types";

export type AuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | {
      status: "authenticated";
      user: User;
      /** Signed up in this session, so onboarding comes before the app. */
      isNewAccount: boolean;
    };

export interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: { email: string; password: string; name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Replace the cached user after a profile change. */
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** The logged-in user. Only for components rendered behind RequireAuth. */
export function useUser(): User {
  const { state } = useAuth();
  if (state.status !== "authenticated") throw new Error("useUser needs a logged-in user");
  return state.user;
}
