import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { refreshSession, setAccessToken, setSessionLostHandler, type Session } from "../api/client";
import { authApi } from "../api/endpoints";
import { forgetThisDevice } from "../lib/push";
import { AuthContext, type AuthContextValue, type AuthState } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });
  const queryClient = useQueryClient();

  const startSession = useCallback((session: Session, isNewAccount = false) => {
    setAccessToken(session.accessToken);
    setState({ status: "authenticated", user: session.user, isNewAccount });
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
          true,
        ),
      logout: async () => {
        try {
          // First, while still logged in: stop this device getting the user's reminders.
          await forgetThisDevice();
          await authApi.logout();
        } finally {
          endSession();
        }
      },
      setUser: (user) => setState((s) => ({ status: "authenticated", user, isNewAccount: s.status === "authenticated" && s.isNewAccount })),
    }),
    [state, startSession, endSession],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
