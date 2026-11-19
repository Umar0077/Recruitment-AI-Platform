/** Local test DB only, with rollback fixtures and no reset/global setup. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { EnvironmentVariables } from "../../src/config/env.validation";
import type { PrismaService } from "../../src/database/prisma.service";
import { OpenRouterService } from "../../src/modules/assessment/openrouter.service";
import { ApiUsageService } from "../../src/modules/assessment/api-usage.service";
import { UsageHistoryQuery } from "../../src/modules/assessment/api-usage.dto";

let phase = "configuration";
async function main() {
  const env = parse(readFileSync(resolve(__dirname, "../../.env"))), target = env.TEST_DATABASE_URL;
  assert(target, "Separate test database required.");
  const url = new URL(target);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && /_test$/.test(url.pathname) && target !== env.DATABASE_URL, "Local separate test database only.");
  const db = new PrismaClient({ datasources: { db: { url: target } }, log: [] });
  const feature = `fictional-usage-${randomUUID()}`, rollback = new Error("ROLLBACK_FIXTURES");
  const checks: string[] = [];
  try {
    phase = "transaction";
    try {
      await db.$transaction(async tx => {
        const config = new ConfigService<EnvironmentVariables, true>(new EnvironmentVariables());
        const adapter = tx as unknown as PrismaService;
        const provider = new OpenRouterService(adapter, config), service = new ApiUsageService(adapter, config, provider);
        const now = new Date("2040-03-01T12:00:00Z");
        phase = "baseline aggregate";
        const baseline = await service.overview({ range: "7d" }, now);
        phase = "fictional accounting fixtures";
        await tx.lLMRequestUsage.createMany({ data: [
          { model: "fictional-model", purpose: feature, attempt: 0, status: "SUCCEEDED", tokens: 30, inputTokens: 10, outputTokens: 20, costUsd: 0, latencyMs: 200, createdAt: new Date("2040-03-01T00:00:00Z"), finishedAt: new Date("2040-03-01T00:00:01Z") },
          { model: "fictional-model", purpose: feature, attempt: 1, status: "RATE_LIMITED", tokens: 0, httpStatus: 429, latencyMs: 100, createdAt: new Date("2040-03-01T00:01:00Z") },
          { model: "fictional-model", purpose: feature, attempt: 0, status: "RESERVED", tokens: 0, createdAt: new Date("2040-03-01T00:02:00Z") },
          { model: "fictional-model", purpose: feature, attempt: 0, status: "INVALID_OUTPUT", tokens: 10, inputTokens: 5, outputTokens: 5, costUsd: 0.25, latencyMs: 300, createdAt: new Date("2040-02-29T23:59:59Z") },
        ] });
        phase = "UTC aggregate and null coverage";
        const overview = await service.overview({ range: "7d" }, now);
        assert.equal(overview.today.requests - baseline.today.requests, 3);
        assert.equal(overview.month.requests - baseline.month.requests, 3);
        assert.equal(overview.selected.requests - baseline.selected.requests, 4);
        assert.equal(overview.selected.retries - baseline.selected.retries, 1);
        assert.equal(overview.selected.rateLimited - baseline.selected.rateLimited, 1);
        assert.equal(overview.selected.totalTokens - baseline.selected.totalTokens, 40);
        assert.equal((overview.selected.costUsd ?? 0) - (baseline.selected.costUsd ?? 0), 0.25);
        assert.equal(overview.selected.costCoverageRequests - baseline.selected.costCoverageRequests, 2);
        assert.equal(overview.selected.tokenCoverageRequests - baseline.selected.tokenCoverageRequests, 2);
        assert.equal(overview.daily.length, 7); assert.equal(overview.monthly.length, 12); assert.equal(overview.candidateDataAllowed, false);
        checks.push("SQL daily/monthly UTC boundaries, retry/429 counts, cost/token coverage, privacy gate");
        phase = "bounded history and privacy";
        const query = Object.assign(new UsageHistoryQuery(), { from: "2040-02-29", to: "2040-03-01", feature, limit: 2 });
        const page1 = await service.history(query, now), page2 = await service.history(Object.assign(new UsageHistoryQuery(), query, { page: 2 }), now);
        assert.equal(page1.meta.total, 4); assert.equal(page1.data.length, 2); assert.equal(page2.data.length, 2);
        assert.equal(new Set([...page1.data, ...page2.data].map(row => row.id)).size, 4);
        const failed = await service.history(Object.assign(new UsageHistoryQuery(), query, { status: "failed", limit: 100 }), now);
        assert.equal(failed.meta.total, 2); assert(failed.data.every(row => row.status === "failed" && row.errorCode));
        assert(!JSON.stringify(page1).includes("reportId")); assert(!JSON.stringify(page1).includes("providerRequestId"));
        const success = await service.history(Object.assign(new UsageHistoryQuery(), query, { status: "success" }), now);
        assert.equal(success.data[0].costUsd, 0); assert.equal(success.data[0].inputTokens, 10);
        checks.push("history inclusive dates, filtering, deterministic pagination, no candidate/report identifiers");
        throw rollback;
      }, { timeout: 30000 });
    } catch (error) { if (error !== rollback) throw error; }
    phase = "rollback verification";
    assert.equal(await db.lLMRequestUsage.count({ where: { purpose: feature } }), 0);
    checks.push("all fictional rows rolled back; existing records unchanged");
    process.stdout.write(JSON.stringify({ status: "passed", checks, databaseReset: false, persistedFixtures: 0 }, null, 2) + "\n");
  } finally { await db.$disconnect(); }
}
void main().catch((error: unknown) => {
  const detail = error as { code?: string; errorCode?: string; message?: string };
  const code = detail?.code ?? detail?.errorCode;
  process.stderr.write(JSON.stringify({ status: "failed", phase, code: code && /^(P\d{4}|ERR_ASSERTION|ECONNREFUSED)$/.test(code) ? code : "suppressed", connectionUnavailable: /reach database|connect|ECONNREFUSED/i.test(detail?.message ?? "") }) + "\n");
  process.exitCode = 1;
});
