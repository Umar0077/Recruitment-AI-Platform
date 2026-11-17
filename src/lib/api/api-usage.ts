/** Safe, aggregate-only API Usage responses. No prompts, transcripts or provider credentials. */
import { apiRequest } from "./client";
import type { Page } from "./types";

export type UsageRange = "today" | "7d" | "30d" | "month";
export type UsageStatus = "success" | "failed" | "pending";
export interface UsageTotals {
  requests: number;
  succeeded: number;
  failed: number;
  pending: number;
  retries: number;
  rateLimited: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number;
  costUsd: number | null;
  costCoverageRequests: number;
  tokenCoverageRequests: number;
  averageLatencyMs: number | null;
}
export interface UsageOverview {
  timezone: "UTC";
  range: UsageRange;
  from: string;
  to: string;
  provider: string;
  model: string;
  mode: string;
  today: UsageTotals;
  month: UsageTotals;
  selected: UsageTotals;
  daily: (UsageTotals & { date: string })[];
  monthly: (UsageTotals & { month: string })[];
  models: string[];
  features: string[];
  budget: { dailyLimit: number; usedToday: number; remainingToday: number; resetAt: string | null; basis: "application" };
  health: { status: "unknown" | "healthy" | "degraded"; lastSuccessAt: string | null; lastRequestAt: string | null; requestsLast24h: number; failuresLast24h: number };
  candidateDataAllowed: boolean;
}
export interface UsageRequest {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  provider: string;
  model: string;
  feature: string;
  status: UsageStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number;
  costUsd: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  attempt: number;
  httpStatus: number | null;
}
type MetadataStatus = "available" | "partial" | "unavailable" | "unconfigured";
export interface ProviderUsage {
  checkedAt: string;
  status: MetadataStatus;
  key: { status: MetadataStatus; usageUsd: number | null; dailyUsageUsd: number | null; monthlyUsageUsd: number | null; limitUsd: number | null; remainingUsd: number | null; limitReset: string | null; expiresAt: string | null; budgetResetAt: string | null };
  credits: { status: MetadataStatus; totalCreditsUsd: number | null; totalUsageUsd: number | null; remainingUsd: number | null };
  freeQuota: { limit: number | null; used: number | null; remaining: number | null; source: "provider" | "estimate" | "unavailable"; resetAt: string | null; resetSource: "provider" | "unavailable"; message: string };
  model: { id: string; name: string | null; availability: "available" | "unavailable" | "unknown"; pricingCategory: "free" | "paid" | "unknown"; inputCostPerMillion: number | null; outputCostPerMillion: number | null; requestCostUsd: number | null; contextWindow: number | null };
  errors: ("KEY_UNAVAILABLE" | "CREDITS_UNAVAILABLE" | "MODEL_METADATA_UNAVAILABLE")[];
}
export interface UsageHistoryQuery {
  range: UsageRange;
  from?: string;
  to?: string;
  model?: string;
  status?: UsageStatus;
  feature?: string;
  page: number;
  limit: number;
}
export const apiUsage = {
  overview: async (range: UsageRange, signal?: AbortSignal) => (await apiRequest<UsageOverview>("/api-usage/overview", { query: { range }, signal })).data,
  provider: async (signal?: AbortSignal) => (await apiRequest<ProviderUsage>("/api-usage/provider", { signal, timeoutMs: 25_000 })).data,
  history: async (query: UsageHistoryQuery, signal?: AbortSignal): Promise<Page<UsageRequest>> => {
    const response = await apiRequest<UsageRequest[]>("/api-usage/history", { query: { ...query }, signal });
    return { items: response.data, meta: response.meta };
  },
};
