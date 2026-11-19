/** Fictional fixtures, local test database only. Every DB write rolls back; object storage is a test double. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { ConfigService } from "@nestjs/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import { RecordingsService } from "../../src/modules/recordings/recordings.service";
import { EnvironmentVariables } from "../../src/config/env.validation";
import { AccessScope } from "../../src/common/access-scope";
import { AuditService } from "../../src/modules/audit/audit.module";
import type { PrismaService } from "../../src/database/prisma.service";
import type { RecordingStorage } from "../../src/integrations/storage/recording-storage";
import type { AuthUser } from "../../src/common/auth-user";
let phase = "configuration";
async function main() {
  const env = parse(readFileSync(resolve(__dirname, "../../.env"))); const target = env.TEST_DATABASE_URL;
  assert(target && target !== env.DATABASE_URL); const url = new URL(target);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && /_test$/.test(url.pathname));
  const db = new PrismaClient({ datasources: { db: { url: target } }, log: [] }); const prefix = `fictional-recording-${randomUUID()}`, rollback = new Error("ROLLBACK_FIXTURES");
  let savedId = "";
  try {
    try { await db.$transaction(async tx => {
      let n = 0;
      const adapter = new Proxy(tx, { get: (o, prop) => prop === "$transaction" ? async (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => {
        const point = `recording_${++n}`; await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
        try { const result = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`); return result; } catch (e) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`); throw e; }
      } : Reflect.get(o, prop) }) as unknown as PrismaService;
      phase = "fictional fixture";
      const account = await tx.user.create({ data: { firebaseUid: prefix, email: `${prefix}@example.test`, displayName: "Fictional Recording Candidate" } });
      const candidate = await tx.candidate.create({ data: { userId: account.id, email: account.email, fullName: account.displayName!, category: "CSR_FRESHER" } });
      const version = await tx.questionSetVersion.findFirstOrThrow({ where: { status: "PUBLISHED" }, include: { questionSet: true } });
      const jobRole = await tx.jobRole.findFirstOrThrow();
      const application = await tx.application.create({ data: { candidateId: candidate.id, jobRoleId: jobRole.id, source: "MANUAL", submittedAt: new Date() } });
      const session = await tx.interviewSession.create({ data: { candidateId: candidate.id, applicationId: application.id, jobRoleId: jobRole.id, questionSetVersionId: version.id, status: "IN_PROGRESS", expiresAt: new Date(Date.now() + 86400000) } });
      const owner = { id: account.id, candidateId: candidate.id, roles: ["CANDIDATE"], permissions: new Set(["interviews:take"]) } as AuthUser;
      const staff = { ...owner, candidateId: null, roles: ["SUPER_ADMIN"], permissions: new Set(["interviews:read", "interviews:review", "users:manage"]) } as AuthUser;
      const config = new ConfigService<EnvironmentVariables, true>({ ...new EnvironmentVariables(), NODE_ENV: "test", RECORDING_ENABLED: true, RECORDING_UPLOAD_ENABLED: true, RECORDING_MONITORING_ENABLED: true, RECORDING_RETENTION_DAYS: 1, RECORDING_POLICY_REFERENCE: "Fictional policy for rollback test", RECORDING_SUPPORT_EMAIL: "support@example.test" });
      let object: { size: number; type: string } | null = null;
      const storage = { configured: true, ready: async () => true, begin: async () => "fictional-upload", partUrl: async () => "https://storage.example.test/part", parts: async () => [{ partNumber: 1, size: 100, etag: "fictional" }], complete: async () => { object = { size: 100, type: "video/webm" }; }, head: async () => object, playback: async () => "https://storage.example.test/signed", abort: async () => {}, remove: async () => { object = null; } } as unknown as RecordingStorage;
      const service = new RecordingsService(adapter, config, storage, new AccessScope(config), new AuditService(adapter));
      phase = "consent, ownership and idempotent initiation";
      const input = { sessionId: session.id, clientId: randomUUID(), consent: true, policyReference: config.get("RECORDING_POLICY_REFERENCE", { infer: true }), cameraConsent: true, monitoringConsent: true, systemAudioConsent: false, displaySurface: "browser", contentType: "video/webm" };
      const first = await service.begin(input, owner); savedId = first.id; assert.equal((await service.begin(input, owner)).id, first.id);
      await assert.rejects(service.list(session.id, { ...owner, candidateId: randomUUID() }));
      phase = "part, event and completion persistence";
      await service.part(first.id, { partNumber: 1, sizeBytes: 100 }, owner);
      const event = { id: randomUUID(), type: "TAB_HIDDEN", occurredAt: new Date().toISOString(), captureState: "RECORDING" };
      await service.event(first.id, event, owner); await service.event(first.id, event, owner); assert.equal(await tx.interviewSessionEvent.count({ where: { recordingId: first.id } }), 1);
      await service.complete(first.id, { partsCount: 1, durationMs: 1000 }, owner); await service.complete(first.id, { partsCount: 1, durationMs: 1000 }, owner);
      assert.equal((await tx.interviewRecording.findUniqueOrThrow({ where: { id: first.id } })).status, "UPLOADED");
      assert.equal((await tx.interviewSession.findUniqueOrThrow({ where: { id: session.id } })).status, "IN_PROGRESS");
      phase = "authorized playback and deletion";
      await tx.interviewSession.update({ where: { id: session.id }, data: { status: "COMPLETED" } });
      await assert.rejects(service.playback(first.id, owner)); assert((await service.playback(first.id, staff)).expiresAt);
      const list = await service.list(session.id, staff); assert(!("objectKey" in list.recordings[0])); assert(!("uploadId" in list.recordings[0]));
      await assert.rejects(service.remove(first.id, owner)); await service.remove(first.id, staff);
      assert.equal(object, null); assert.equal(await tx.recordingSegment.count({ where: { recordingId: first.id } }), 0); assert.equal(await tx.interviewSessionEvent.count({ where: { recordingId: first.id } }), 0);
      assert.equal((await tx.interviewRecording.findUniqueOrThrow({ where: { id: first.id } })).status, "DELETED");
      assert.equal(await tx.auditLog.count({ where: { entityId: first.id, action: "recording.deletion_verified" } }), 1);
      throw rollback;
    }, { timeout: 60000 }); } catch (e) { if (e !== rollback) throw e; }
    assert.equal(await db.user.count({ where: { firebaseUid: prefix } }), 0); assert.equal(await db.interviewRecording.count({ where: { id: savedId } }), 0);
    process.stdout.write(JSON.stringify({ status: "passed", fictional: true, rolledBack: true, storage: "test-double", checks: ["consent", "ownership", "idempotence", "parts", "event deduplication", "verified completion", "answers untouched", "reviewer playback", "deletion and audit", "no residual fixtures"] }) + "\n");
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error(JSON.stringify({ status: "failed", phase, details: "suppressed to protect credentials and database data" })); process.exitCode = 1; });
