/** Fixed fictional fixture only. No file/argument/transcript input and no candidate lookup. */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import type { PrismaService } from "../src/database/prisma.service";
import { validateEnv, type EnvironmentVariables } from "../src/config/env.validation";
import { OpenRouterService, ProviderFailure } from "../src/modules/assessment/openrouter.service";
import { TRANSCRIPT_CLEANUP_PROMPT, TRANSCRIPT_CLEANUP_SCHEMA, validateTranscriptCleanup } from "../src/modules/assessment/transcript-cleanup";
async function main() {
  const env = validateEnv({ ...parse(readFileSync(resolve(__dirname, "../.env"))), ...process.env });
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } }, log: [] });
  const provider = new OpenRouterService(db as PrismaService, new ConfigService<EnvironmentVariables, true>(env));
  const purpose = "synthetic_transcript_cleanup", original = "i did not meet 12.5% conversion in CRM i made 30 calls";
  const since = new Date(), started = Date.now();
  try {
    let status = "validated", changed = false, error: string | null = null;
    try {
      const result = await provider.request({ system: TRANSCRIPT_CLEANUP_PROMPT, input: { transcript: original, fictional: true }, schema: TRANSCRIPT_CLEANUP_SCHEMA, synthetic: true, purpose, validate: value => validateTranscriptCleanup(value, original) });
      changed = validateTranscriptCleanup(result, original).correctedText !== original;
    } catch (e) { status = "failed"; error = e instanceof ProviderFailure ? e.code : "EVALUATION_FAILED"; }
    const usage = await db.lLMRequestUsage.findFirst({ where: { purpose, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { status: true, httpStatus: true, latencyMs: true, tokens: true } });
    process.stdout.write(JSON.stringify({ status, model: provider.settings.OPENROUTER_MODEL, elapsedMs: Date.now() - started, error, changed, usage, realCandidateProviderAllowed: provider.allowed(false), candidateDataSent: false, candidateAnswersModified: false }) + "\n");
  } finally { await db.$disconnect(); }
}
void main().catch((e: unknown) => { process.stderr.write(JSON.stringify({ errorType: e instanceof Error ? e.name : "unknown", errorCode: e && typeof e === "object" && "code" in e ? e.code : null, message: "Evaluation unavailable; sensitive details suppressed" }) + "\n"); process.exitCode = 1; });
