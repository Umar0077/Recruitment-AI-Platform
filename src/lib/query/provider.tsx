"use client";
/**
 * Server-state cache for API mode (TanStack Query). No polling by default: data refreshes on
 * mount/focus where it's useful and after mutations through targeted invalidation.
 * The cache is cleared whenever the signed-in account changes (see AuthProvider).
 */
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            // Retry only transient failures; never retry auth/permission/validation errors.
            retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.status === 0 || err.status >= 500),
          },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
