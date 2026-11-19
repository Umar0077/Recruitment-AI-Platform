import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvironmentVariables } from "../../config/env.validation";
import { Paged } from "../../common/http";
import { pageArgs, pageMeta } from "../../common/pagination";
import { OpenRouterService } from "./openrouter.service";
import { DAY_MS, UsageHistoryQuery, UsageOverviewQuery, usageWindow, utcDay } from "./api-usage.dto";

const TOTALS = Prisma.sql`
 COUNT(*)::integer AS requests,
 COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::integer AS succeeded,
 COUNT(*) FILTER (WHERE status NOT IN ('SUCCEEDED', 'RESERVED'))::integer AS failed,
 COUNT(*) FILTER (WHERE status = 'RESERVED')::integer AS pending,
 COUNT(*) FILTER (WHERE attempt > 0)::integer AS retries,
 COUNT(*) FILTER (WHERE http_status = 429)::integer AS "rateLimited",
 SUM(input_tokens) AS "inputTokens", SUM(output_tokens) AS "outputTokens",
 COALESCE(SUM(tokens), 0) AS "totalTokens", SUM(cost_usd) AS "costUsd",
 COUNT(cost_usd)::integer AS "costCoverageRequests",
 COUNT(*) FILTER (WHERE input_tokens IS NOT NULL AND output_tokens IS NOT NULL)::integer AS "tokenCoverageRequests",
 AVG(latency_ms) AS "averageLatencyMs"`;
type AggregateRow = Record<string, number | bigint | Prisma.Decimal | string | null>;
export function usageTotals(row: AggregateRow = {}) {
  const required = (key: string) => Number(row[key] ?? 0);
  const optional = (key: string) => row[key] == null ? null : Number(row[key]);
  return { requests: required("requests"), succeeded: required("succeeded"), failed: required("failed"), pending: required("pending"), retries: required("retries"), rateLimited: required("rateLimited"), inputTokens: optional("inputTokens"), outputTokens: optional("outputTokens"), totalTokens: required("totalTokens"), costUsd: optional("costUsd"), costCoverageRequests: required("costCoverageRequests"), tokenCoverageRequests: required("tokenCoverageRequests"), averageLatencyMs: optional("averageLatencyMs") };
}
@Injectable()
export class ApiUsageService {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService<EnvironmentVariables, true>, private readonly provider: OpenRouterService) {}
  private async totals(from: Date, to: Date) {
    const rows = await this.db.$queryRaw<AggregateRow[]>(Prisma.sql`SELECT ${TOTALS} FROM llm_request_usage WHERE created_at >= ${from} AND created_at < ${to}`);
    return usageTotals(rows[0]);
  }
  async overview(query: UsageOverviewQuery, now = new Date()) {
    const window = usageWindow(query.range, now), todayWindow = usageWindow("today", now), monthWindow = usageWindow("month", now);
    const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const [today, month, selected, days, months, models, features, lastSuccess, lastRequest, recent] = await Promise.all([
      this.totals(todayWindow.from, todayWindow.to), this.totals(monthWindow.from, monthWindow.to), this.totals(window.from, window.to),
      this.db.$queryRaw<AggregateRow[]>(Prisma.sql`SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, ${TOTALS} FROM llm_request_usage WHERE created_at >= ${window.from} AND created_at < ${window.to} GROUP BY 1 ORDER BY 1`),
      this.db.$queryRaw<AggregateRow[]>(Prisma.sql`SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, ${TOTALS} FROM llm_request_usage WHERE created_at >= ${firstMonth} AND created_at < ${todayWindow.to} GROUP BY 1 ORDER BY 1`),
      this.db.lLMRequestUsage.groupBy({ by: ["model"], orderBy: { model: "asc" } }),
      this.db.lLMRequestUsage.groupBy({ by: ["purpose"], orderBy: { purpose: "asc" } }),
      this.db.lLMRequestUsage.findFirst({ where: { status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      this.db.lLMRequestUsage.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      this.totals(new Date(now.getTime() - DAY_MS), new Date(now.getTime() + 1)),
    ]);
    const daily = [];
    for (let stamp = window.from.getTime(); stamp < window.to.getTime(); stamp += DAY_MS) {
      const date = new Date(stamp).toISOString().slice(0, 10);
      daily.push({ date, ...usageTotals(days.find(row => row.date === date)) });
    }
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const month = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + i, 1)).toISOString().slice(0, 7);
      return { month, ...usageTotals(months.find(row => row.month === month)) };
    });
    const dailyLimit = this.config.get("AI_MAX_REQUESTS_PER_DAY", { infer: true });
    return { timezone: "UTC", range: query.range, from: window.from.toISOString(), to: window.to.toISOString(), provider: "OpenRouter", model: this.provider.settings.OPENROUTER_MODEL, mode: this.provider.settings.AI_ASSESSMENT_MODE, today, month, selected, daily, monthly,
      models: [...new Set([this.provider.settings.OPENROUTER_MODEL, ...models.map(row => row.model)])].sort(), features: features.map(row => row.purpose),
      budget: { dailyLimit, usedToday: today.requests, remainingToday: Math.max(0, dailyLimit - today.requests), resetAt: new Date(utcDay(now).getTime() + DAY_MS).toISOString(), basis: "application" },
      health: { status: !recent.requests ? "unknown" : recent.failed ? "degraded" : recent.succeeded ? "healthy" : "unknown", lastSuccessAt: lastSuccess?.createdAt.toISOString() ?? null, lastRequestAt: lastRequest?.createdAt.toISOString() ?? null, requestsLast24h: recent.requests, failuresLast24h: recent.failed },
      candidateDataAllowed: this.provider.allowed(false),
    };
  }
  async history(query: UsageHistoryQuery, now = new Date()) {
    const window = usageWindow(query.range, now, query.from, query.to);
    const where: Prisma.LLMRequestUsageWhereInput = { createdAt: { gte: window.from, lt: window.to }, ...(query.model ? { model: query.model } : {}), ...(query.feature ? { purpose: query.feature } : {}), ...(query.status === "success" ? { status: "SUCCEEDED" } : query.status === "pending" ? { status: "RESERVED" } : query.status === "failed" ? { status: { notIn: ["SUCCEEDED", "RESERVED"] } } : {}) };
    const [rows, total] = await Promise.all([
      this.db.lLMRequestUsage.findMany({ where, ...pageArgs(query), orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true, finishedAt: true, model: true, purpose: true, status: true, inputTokens: true, outputTokens: true, tokens: true, costUsd: true, latencyMs: true, attempt: true, httpStatus: true } }),
      this.db.lLMRequestUsage.count({ where }),
    ]);
    return new Paged(rows.map(row => ({ id: row.id, createdAt: row.createdAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null, provider: "OpenRouter", model: row.model, feature: row.purpose, status: row.status === "SUCCEEDED" ? "success" : row.status === "RESERVED" ? "pending" : "failed", inputTokens: row.inputTokens, outputTokens: row.outputTokens, totalTokens: row.tokens, costUsd: row.costUsd === null ? null : Number(row.costUsd), latencyMs: row.latencyMs, errorCode: ["SUCCEEDED", "RESERVED"].includes(row.status) ? null : /^[A-Z_]{1,60}$/.test(row.status) ? row.status : "PROVIDER_ERROR", attempt: row.attempt, httpStatus: row.httpStatus })), pageMeta(query, total));
  }
}
