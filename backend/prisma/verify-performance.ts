/** Read-only local PostgreSQL verification. No reset, fixture inserts, credentials or row values logged. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parse } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { AnalyticsController } from "../src/modules/analytics/analytics.module";

const fixtures = `WITH
  candidates(id, is_sample) AS (VALUES (1, false), (2, true)),
  applications(candidate_id, submitted_at) AS (VALUES (1, '2026-11-16 00:01:00+00'::timestamptz), (2, '2026-11-16 00:02:00+00'::timestamptz), (1, '2026-11-15 23:59:00+00'::timestamptz)),
  interview_sessions(id, submitted_at, is_sample) AS (VALUES (1, '2026-11-16 00:01:00+00'::timestamptz, false), (2, '2026-11-16 00:02:00+00'::timestamptz, true), (3, '2026-11-15 23:59:00+00'::timestamptz, false)),
  hr_reviews(interview_session_id, status, reviewed_at) AS (VALUES (1, 'REVIEWED', '2026-11-16 00:01:00+00'::timestamptz), (2, 'REVIEWED', '2026-11-16 00:02:00+00'::timestamptz), (3, 'REVIEWED', '2026-11-15 23:59:00+00'::timestamptz)) , w AS`;

type Sample = { elapsedMs: number; sqlCount: number; sqlDurationMs: number; returnedBytes: number };
const round = (value: number) => Math.round(value * 100) / 100;
function summary(samples: Sample[]) {
  const times = samples.map(s => s.elapsedMs).sort((a, b) => a - b);
  return { samples, medianMs: round((times[4]! + times[5]!) / 2), minMs: times[0], maxMs: times[9] };
}

let phase = "configuration";
async function main() {
  const env = parse(readFileSync(resolve(__dirname, "../.env")));
  const target = env.TEST_DATABASE_URL;
  assert(target, "A separate TEST_DATABASE_URL is required.");
  const url = new URL(target);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && /_test$/.test(url.pathname), "Only a local test database is allowed.");
  assert(target !== env.DATABASE_URL, "The test database must be separate.");
  const prisma = new PrismaClient({ datasources: { db: { url: target } }, log: [{ emit: "event", level: "query" }] });
  let active: Sample | undefined;
  prisma.$on("query", event => { if (active) { active.sqlCount++; active.sqlDurationMs += event.duration; } });
  const evidence: Record<string, unknown> = { measuredAt: new Date().toISOString(), database: "existing local test database", writes: 0, analytics: [], queryComparison: { status: "not measured" } };
  try {
    phase = "database connection";
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const verified: object[] = [];
      for (const timezone of ["UTC", "Asia/Karachi", "America/New_York"]) {
        await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
        const adapter = {
          $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
            // Pure CTE fixtures shadow tables for this SELECT only; fixed time tests the UTC week boundary.
            const parts = strings.map(part => part.replaceAll("now()", "'2026-11-16 00:30:00+00'::timestamptz"));
            parts[0] = parts[0]!.replace("WITH w AS", fixtures);
            return tx.$queryRaw(Prisma.sql(parts as unknown as TemplateStringsArray, ...values));
          },
        };
        const controller = new AnalyticsController(adapter as never, { get: () => "production" } as never);
        for (const includeSample of [false, true]) {
          phase = `analytics ${timezone} includeSample=${includeSample}`;
          const result = await controller.activity({ weeks: 1, includeSample });
          assert.equal(result.weeks.length, 1);
          assert.equal(result.weeks[0]!.weekStart.toISOString(), "2026-11-16T00:00:00.000Z");
          const expected = includeSample ? 2 : 1;
          assert.equal(result.weeks[0]!.applications, expected); assert.equal(result.weeks[0]!.interviews, expected); assert.equal(result.weeks[0]!.reviews, expected);
          verified.push({ timezone, includeSample, result: "passed", countPerSeries: expected });
        }
      }
      evidence.analytics = verified;
      phase = "existing sample lookup";
      const application = await tx.application.findFirst({ where: { candidate: { isSample: true } }, select: { id: true, assignedRecruiterId: true } });
      if (!application) { evidence.queryComparison = { status: "unavailable", reason: "No existing sample application in the test database; no fixtures inserted." }; return; }
      const where = { id: application.id, assignedRecruiterId: application.assignedRecruiterId };
      const original = () => tx.application.findFirst({ where, include: {
        candidate: true, jobRole: true, assignedRecruiter: { select: { id: true, displayName: true, email: true } },
        interviews: { select: { id: true, status: true, invitedAt: true, startedAt: true, submittedAt: true, expiresAt: true }, orderBy: { createdAt: "desc" } },
        reviews: { select: { id: true, status: true, reviewedAt: true, interviewSessionId: true } },
      } });
      const idOnly = () => tx.application.findFirst({ where, select: { id: true } });
      await original(); await idOnly(); // Warm both query shapes and use one transaction/connection.
      const before: Sample[] = [], after: Sample[] = [];
      phase = "read-only query comparison";
      for (let iteration = 0; iteration < 10; iteration++) {
        for (const [query, samples] of [[original, before], [idOnly, after]] as const) {
          const sample = { elapsedMs: 0, sqlCount: 0, sqlDurationMs: 0, returnedBytes: 0 };
          active = sample; const start = performance.now(); const row = await query(); sample.elapsedMs = round(performance.now() - start); active = undefined;
          sample.returnedBytes = Buffer.byteLength(JSON.stringify(row)); samples.push(sample);
        }
      }
      evidence.queryComparison = { status: "measured", method: "10 alternating warm reads of each shape on one existing sample application, same scoped predicate and connection; no row values recorded", originalDetailProbe: summary(before), idOnlyProbe: summary(after) };
    }, { timeout: 30000 });
    mkdirSync(resolve(__dirname, "../../docs/performance"), { recursive: true });
    writeFileSync(resolve(__dirname, "../../docs/performance/database.json"), JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify(evidence));
  } finally { await prisma.$disconnect(); }
}
void main().catch(error => {
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof Prisma.PrismaClientInitializationError ? error.errorCode : undefined;
  console.error(JSON.stringify({ status: "failed", phase, code: code ?? "VERIFICATION_FAILED", kind: error instanceof Error ? error.name : "unknown" })); process.exitCode = 1;
});
