import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "../api/client";
import { AuthProvider } from "../auth/AuthProvider";
import { ToastProvider } from "../components/ui/Toast";
import { ThemeSync } from "../theme/ThemeSync";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retrying a 4xx won't change the answer; network blips and 5xx get two more tries.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
    },
  });
}

/** Everything around the router: server-data cache, session, toasts and theme. Shared with tests. */
export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <ThemeSync />
          {children}
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
