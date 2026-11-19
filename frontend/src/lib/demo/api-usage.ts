/** Explicitly fictional, fixed-date samples. Never used as a fallback for API failures. */
import type { ProviderUsage, UsageHistoryQuery, UsageOverview, UsageRange, UsageRequest, UsageTotals } from "@/lib/api/api-usage";
import type { Page } from "@/lib/api/types";

export const DEMO_USAGE_AS_OF = "2026-11-17T18:00:00.000Z";
const asOf = Date.parse(DEMO_USAGE_AS_OF);
const day = 86_400_000;
const model = "demo/fictional-interview-model";
const rows: UsageRequest[] = Array.from({ length: 96 }, (_, i) => {
  const status = i === 0 ? "pending" : i % 9 === 0 ? "failed" : "success";
  const tokens = status === "success" ? 410 + (i % 7) * 78 : 0;
  const createdAt = new Date(asOf - i * 9 * 3_600_000).toISOString();
  return { id: `fictional-usage-${i + 1}`, createdAt, finishedAt: status === "pending" ? null : new Date(Date.parse(createdAt) + 850 + (i % 6) * 220).toISOString(), provider: "OpenRouter", model, feature: i % 3 ? "answer_analysis" : "rubric_generation", status, inputTokens: status === "success" ? tokens : null, outputTokens: status === "success" ? 120 + i % 12 : null, totalTokens: status === "success" ? tokens + 120 + i % 12 : 0, costUsd: status === "success" ? Number((tokens * 0.000001).toFixed(6)) : null, latencyMs: status === "pending" ? null : 850 + (i % 6) * 220, errorCode: status === "failed" ? "RATE_LIMITED" : null, attempt: i % 13 === 1 ? 2 : 1, httpStatus: status === "pending" ? null : status === "failed" ? 429 : 200 };
});
function periodStart(range: UsageRange) {
  const today = Date.UTC(2026, 10, 17);
  return range === "today" ? today : range === "7d" ? today - 6 * day : range === "30d" ? today - 29 * day : Date.UTC(2026, 10, 1);
}
function summarize(items: UsageRequest[]): UsageTotals {
  const knownCosts = items.filter(row => row.costUsd != null), knownTokens = items.filter(row => row.inputTokens != null && row.outputTokens != null), timed = items.filter(row => row.latencyMs != null);
  return { requests: items.length, succeeded: items.filter(row => row.status === "success").length, failed: items.filter(row => row.status === "failed").length, pending: items.filter(row => row.status === "pending").length, retries: items.filter(row => row.attempt > 1).length, rateLimited: items.filter(row => row.httpStatus === 429).length, inputTokens: knownTokens.length ? knownTokens.reduce((sum, row) => sum + row.inputTokens!, 0) : null, outputTokens: knownTokens.length ? knownTokens.reduce((sum, row) => sum + row.outputTokens!, 0) : null, totalTokens: items.reduce((sum, row) => sum + row.totalTokens, 0), costUsd: knownCosts.length ? knownCosts.reduce((sum, row) => sum + row.costUsd!, 0) : null, costCoverageRequests: knownCosts.length, tokenCoverageRequests: knownTokens.length, averageLatencyMs: timed.length ? Math.round(timed.reduce((sum, row) => sum + row.latencyMs!, 0) / timed.length) : null };
}
export function demoUsageOverview(range: UsageRange): UsageOverview {
  const from = periodStart(range), to = Date.UTC(2026, 10, 18);
  const between = (start: number, end = to) => rows.filter(row => Date.parse(row.createdAt) >= start && Date.parse(row.createdAt) < end);
  const today = summarize(between(periodStart("today")));
  const recent = summarize(between(asOf - day, asOf + 1));
  return { timezone: "UTC", range, from: new Date(from).toISOString(), to: new Date(to).toISOString(), provider: "OpenRouter", model, mode: "fictional_demo", today, month: summarize(between(periodStart("month"))), selected: summarize(between(from)), daily: Array.from({ length: Math.round((to - from) / day) }, (_, index) => { const start = from + index * day; return { date: new Date(start).toISOString().slice(0, 10), ...summarize(between(start, start + day)) }; }), monthly: Array.from({ length: 6 }, (_, index) => { const start = Date.UTC(2026, 5 + index, 1), end = Date.UTC(2026, 6 + index, 1); return { month: new Date(start).toISOString().slice(0, 7), ...summarize(between(start, end)) }; }), models: [model], features: ["answer_analysis", "rubric_generation"], budget: { dailyLimit: 200, usedToday: today.requests, remainingToday: 200 - today.requests, resetAt: new Date(to).toISOString(), basis: "application" }, health: { status: !recent.requests ? "unknown" : recent.failed ? "degraded" : recent.succeeded ? "healthy" : "unknown", lastSuccessAt: rows.find(row => row.status === "success")?.createdAt ?? null, lastRequestAt: rows[0]?.createdAt ?? null, requestsLast24h: recent.requests, failuresLast24h: recent.failed }, candidateDataAllowed: false };
}
export function demoUsageHistory(query: UsageHistoryQuery): Page<UsageRequest> {
  const from = query.from ? Date.parse(`${query.from}T00:00:00.000Z`) : periodStart(query.range);
  const to = query.to ? Date.parse(`${query.to}T00:00:00.000Z`) + day : Date.UTC(2026, 10, 18);
  const matching = rows.filter(row => Date.parse(row.createdAt) >= from && Date.parse(row.createdAt) < to && (!query.model || query.model === row.model) && (!query.feature || query.feature === row.feature) && (!query.status || query.status === row.status));
  return { items: matching.slice((query.page - 1) * query.limit, query.page * query.limit), meta: { page: query.page, limit: query.limit, total: matching.length, totalPages: Math.max(1, Math.ceil(matching.length / query.limit)) } };
}
export const DEMO_PROVIDER_USAGE: ProviderUsage = {
  checkedAt: DEMO_USAGE_AS_OF, status: "unconfigured",
  key: { status: "unconfigured", usageUsd: null, dailyUsageUsd: null, monthlyUsageUsd: null, limitUsd: null, remainingUsd: null, limitReset: null, expiresAt: null, budgetResetAt: null },
  credits: { status: "unconfigured", totalCreditsUsd: null, totalUsageUsd: null, remainingUsd: null },
  freeQuota: { limit: null, used: null, remaining: null, source: "unavailable", resetAt: null, resetSource: "unavailable", message: "Demo preview only. No provider account, balance or quota was requested." },
  model: { id: model, name: "Fictional preview model", availability: "unknown", pricingCategory: "unknown", inputCostPerMillion: null, outputCostPerMillion: null, requestCostUsd: null, contextWindow: null },
  errors: [],
};
