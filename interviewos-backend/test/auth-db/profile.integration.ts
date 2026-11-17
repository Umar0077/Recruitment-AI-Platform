/** Opt-in PostgreSQL test: local test database only; every fictional row is rolled back. No reset/setup. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { AuthService } from "../../src/modules/auth/auth.service";
import { AuditService } from "../../src/modules/audit/audit.module";
import type { PrismaService } from "../../src/database/prisma.service";
import type { EnvironmentVariables } from "../../src/config/env.validation";

let phase = "configuration";
async function main() {
  const env = parse(readFileSync(resolve(__dirname, "../../.env")));
  const target = env.TEST_DATABASE_URL;
  assert(target, "A separate TEST_DATABASE_URL is required.");
  const url = new URL(target);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && /_test$/.test(url.pathname), "Only a local database ending in _test is allowed.");
  assert(target !== env.DATABASE_URL, "The test database must be separate.");
  Logger.overrideLogger(false);
  const prisma = new PrismaClient({ datasources: { db: { url: target } }, log: [] });
  const prefix = `fictional-profile-${randomUUID()}`;
  const rollback = new Error("ROLLBACK_FICTIONAL_FIXTURES");
  const passed: string[] = [];
  try {
    phase = "database connection and transaction";
    try {
      await prisma.$transaction(async tx => {
        phase = "candidate role lookup";
        if (!await tx.role.findUnique({ where: { code: "CANDIDATE" } })) await tx.role.create({ data: { code: "CANDIDATE", name: "Candidate" } });
        // AuthService's inner transaction joins this rollback-only test transaction.
        const adapter = new Proxy(tx, { get: (object, prop) => prop === "$transaction" ? async (fn: (client: typeof tx) => unknown) => fn(tx) : Reflect.get(object, prop) }) as unknown as PrismaService;
        const service = new AuthService(adapter, new ConfigService<EnvironmentVariables, true>({ AUTO_LINK_CANDIDATE_BY_VERIFIED_EMAIL: false }), new AuditService(adapter));
        const identity = { uid: `${prefix}-password`, email: `${prefix}@example.test`, emailVerified: true, name: "  Fictional  Full Name  ", signInProvider: "password" };
        phase = "initial profile persistence";
        const user = await service.resolve(identity);
        assert.equal(user.displayName, "Fictional  Full Name"); assert.deepEqual(user.roles, ["CANDIDATE"]); assert.equal(user.candidateId, null);
        assert.equal((await tx.user.findUniqueOrThrow({ where: { id: user.id } })).displayName, "Fictional  Full Name"); passed.push("name persisted by UID; candidate role only; no invitation fabricated");
        phase = "existing identity and candidate ownership";
        const again = await service.resolve({ ...identity, name: "Different Google Name", signInProvider: "google.com" });
        assert.equal(again.id, user.id); assert.equal(again.displayName, "Fictional  Full Name"); assert.equal(await tx.user.count({ where: { firebaseUid: identity.uid } }), 1);
        const official = await tx.candidate.create({ data: { userId: user.id, fullName: "Official Fictional Applicant", category: "CSR_FRESHER" } });
        const linked = await service.resolve({ ...identity, name: "Changed Provider Name" }); assert.equal(linked.candidateId, official.id);
        assert.equal((await tx.candidate.findUniqueOrThrow({ where: { id: official.id } })).fullName, "Official Fictional Applicant"); passed.push("stored name, UID uniqueness and official candidate ownership preserved");
        phase = "Google profile completion and auditing";
        const noName = { ...identity, uid: `${prefix}-google`, email: `${prefix}-google@example.test`, signInProvider: "google.com", name: null };
        const google = await service.resolve(noName); assert.equal(google.displayName, null);
        const completed = await service.resolve({ ...noName, name: " Fictional Google Profile " }); assert.equal(completed.displayName, "Fictional Google Profile");
        const audits = await tx.auditLog.findMany({ where: { entityId: { in: [user.id, google.id] } } });
        assert.equal(audits.length, 3); assert(audits.some(a => a.action === "user.profile_completed")); assert(!JSON.stringify(audits.map(a => a.summary)).includes("Fictional"));
        passed.push("missing Google name completed; profile audit entries contain field names only");
        throw rollback;
      }, { timeout: 20000 });
    } catch (error) { if (error !== rollback) throw error; }
    phase = "rollback verification";
    assert.equal(await prisma.user.count({ where: { firebaseUid: { startsWith: prefix } } }), 0);
    passed.push("transaction rolled back; zero fictional user records remain");
    process.stdout.write(JSON.stringify({ status: "passed", checks: passed, existingRecordsModified: false, migrationsOrResets: false }, null, 2) + "\n");
  } finally { await prisma.$disconnect(); }
}
void main().catch((error: unknown) => {
  const detail = error as { code?: string; errorCode?: string; name?: string; message?: string };
  const code = detail?.code ?? detail?.errorCode;
  const kind = ["PrismaClientInitializationError", "PrismaClientKnownRequestError", "PrismaClientValidationError", "TypeError", "AssertionError", "Error"].includes(detail?.name ?? "") ? detail.name : "suppressed";
  console.error(JSON.stringify({ status: "failed", phase, kind, code: code && /^(P\d{4}|ERR_ASSERTION|ECONNREFUSED)$/.test(code) ? code : "suppressed", connectionUnavailable: /reach database|connect|ECONNREFUSED/i.test(detail?.message ?? ""), missingEnvironment: /Environment variable not found/.test(detail?.message ?? "") }));
  process.exitCode = 1;
});
