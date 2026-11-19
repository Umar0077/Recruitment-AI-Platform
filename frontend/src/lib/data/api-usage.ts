"use client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import { isApiMode } from "@/lib/config/environment";
import { apiUsage, type UsageHistoryQuery, type UsageRange } from "@/lib/api/api-usage";

export function useApiUsage(range: UsageRange, history: UsageHistoryQuery) {
  const { status, profile } = useAuth();
  const allowed = !!profile?.permissions.includes("users:manage");
  const enabled = isApiMode && status === "signedIn" && allowed;
  const scope = profile?.id ?? "signed-out";
  const overview = useQuery({ queryKey: ["api-usage", scope, "overview", range], queryFn: ({ signal }) => apiUsage.overview(range, signal), enabled, staleTime: 30_000 });
  const requests = useQuery({ queryKey: ["api-usage", scope, "history", history], queryFn: ({ signal }) => apiUsage.history(history, signal), enabled, staleTime: 30_000, placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === scope ? previous : undefined });
  // The backend also caches/deduplicates official metadata calls; navigation never bypasses it.
  const provider = useQuery({ queryKey: ["api-usage", scope, "provider"], queryFn: ({ signal }) => apiUsage.provider(signal), enabled, staleTime: 300_000 });
  return { overview, requests, provider, allowed, restoring: status === "loading" };
}
