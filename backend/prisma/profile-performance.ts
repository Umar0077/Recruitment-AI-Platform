/** Read-only existing LOCAL TEST database. Never initializes fixtures or emits row/credential values. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { AnalyticsController } from "../src/modules/analytics/analytics.module";

async function main() {
  const env = parse(readFileSync(resolve(__dirname, "../.env")));
  const target = env.TEST_DATABASE_URL;
  assert(target && target !== env.DATABASE_URL, "Separate test database required");
  const url = new URL(target);
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && /_test$/.test(url.pathname), "Local test database only");
  const prisma = new PrismaClient({ datasources: { db: { url: target } }, log: [{ level: "query", emit: "event" }] });
  let count = 0, sqlMs = 0;
  prisma.$on("query", e => { count++; sqlMs += e.duration; });
  const rows: object[] = [];
  const label = process.env.PERF_PHASE === "after" ? "after" : "baseline";
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const controller = new AnalyticsController(tx as never, { get: () => "production" } as never);
      const queries: Record<string, () => Promise<unknown>> = {
        overview: () => controller.overview({ includeSample: true }),
        activity: () => controller.activity({ weeks: 12, includeSample: true }),
        candidateList: () => tx.candidate.findMany({ where: { isSample: true }, take: 20, select: { id: true, fullName: true, category: true }, orderBy: { createdAt: "desc" } }),
        interviewList: () => tx.interviewSession.findMany({ where: { isSample: true }, take: 20, select: { id: true, status: true }, orderBy: { createdAt: "desc" } }),
      };
      if ("summary" in controller) queries.summary = () => (controller as AnalyticsController & { summary(): Promise<unknown> }).summary();
      for (const [name, query] of Object.entries(queries)) {
        await query();
        for (let run = 0; run < 10; run++) {
          count = 0; sqlMs = 0; const start = performance.now(); const result = await query();
          rows.push({ name, run, elapsedMs: Math.round((performance.now() - start) * 100) / 100, queries: count, sqlMs, bytes: Buffer.byteLength(JSON.stringify(result)) });
        }
      }
      if ("summary" in controller) {
        const full = await controller.overview({ includeSample: false });
        const brief = await controller.summary();
        assert.deepEqual([brief.candidates.total, brief.candidates.selected, brief.interviews.completed, brief.reviews.pending],
          [full.candidates.total, full.candidates.selected, full.interviews.byStatus.SUBMITTED, full.reviews.pending]);
        rows.push({ name: "summaryParity", passed: true });
        for (let run = 0; run < 10; run++) for (const [name, query] of [["pairedOverview", () => controller.overview({ includeSample: false })], ["pairedSummary", () => controller.summary()]] as const) {
          count = 0; sqlMs = 0; const start = performance.now(); const result = await query();
          rows.push({ name, run, elapsedMs: Math.round((performance.now() - start) * 100) / 100, queries: count, sqlMs, bytes: Buffer.byteLength(JSON.stringify(result)) });
        }
      }
      const explain = await tx.$queryRaw<{ "QUERY PLAN": string }[]>`EXPLAIN (ANALYZE, BUFFERS) SELECT status, count(*) FROM interview_sessions WHERE is_sample = true GROUP BY status`;
      rows.push({ name: "aggregateExplain", plan: explain.map(r => r["QUERY PLAN"]) });
    }, { timeout: 60000 });
  } catch (error) {
    rows.push({ error: error instanceof Error ? error.name : "UnknownError", status: "Profiling unavailable; no database changes attempted" });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    const dir = resolve(__dirname, "../../docs/performance/full"); mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${label}-database.json`), JSON.stringify({ at: new Date().toISOString(), writes: 0, rows }, null, 2));
    console.log(JSON.stringify({ label, measurements: rows.length, writes: 0, success: !process.exitCode }));
  }
}
void main().catch(() => { console.error("Local test profiling configuration is invalid; credential values are not logged."); process.exitCode = 1; });
