import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { refreshSession, setAccessToken, setSessionLostHandler, type Session } from "../api/client";
import { authApi } from "../api/endpoints";
import type { User } from "../api/types";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: User };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: { email: string; password: string; name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Replace the cached user after a profile change. */
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });
  const queryClient = useQueryClient();

  const startSession = useCallback((session: Session) => {
    setAccessToken(session.accessToken);
    setState({ status: "authenticated", user: session.user });
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    queryClient.clear();
    setState({ status: "anonymous", user: null });
  }, [queryClient]);

  // On load, the httpOnly refresh cookie (if any) restores the session.
  useEffect(() => {
    setSessionLostHandler(endSession);
    let cancelled = false;
    refreshSession()
      .then((session) => {
        if (cancelled) return;
        if (session) startSession(session);
        else setState({ status: "anonymous", user: null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "anonymous", user: null });
      });
    return () => {
      cancelled = true;
    };
  }, [endSession, startSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: async (email, password) => startSession(await authApi.login({ email, password })),
      signup: async (input) =>
        startSession(
          await authApi.signup({ ...input, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        ),
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          endSession();
        }
      },
      setUser: (user) => setState({ status: "authenticated", user }),
    }),
    [state, startSession, endSession],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

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
