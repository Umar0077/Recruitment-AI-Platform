/** Opt-in local PostgreSQL check. All fictional fixtures live inside one rollback-only transaction. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import { InterviewsService } from "../../src/modules/interviews/interviews.service";
import { AuditService } from "../../src/modules/audit/audit.module";
import { NotificationsService } from "../../src/modules/notifications/notifications.module";
import { AccessScope } from "../../src/common/access-scope";
import { PERMISSIONS } from "../../src/common/constants/permissions";
import type { AuthUser } from "../../src/common/auth-user";
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
  const prefix = `fictional-transcript-${randomUUID()}`;
  const rollback = new Error("ROLLBACK_FICTIONAL_FIXTURES");
  const passed: string[] = [];
  let fixtureSessionId: string | undefined;
  try {
    phase = "database connection and rollback-only transaction";
    try {
      await prisma.$transaction(async tx => {
        phase = "isolated fictional fixture creation";
        const owner = await tx.user.create({ data: { firebaseUid: `${prefix}-owner` } });
        const other = await tx.user.create({ data: { firebaseUid: `${prefix}-other` } });
        const candidate = await tx.candidate.create({ data: { userId: owner.id, fullName: "Fictional Transcript Fixture", category: "CSR_FRESHER", isSample: true } });
        const otherCandidate = await tx.candidate.create({ data: { userId: other.id, fullName: "Fictional Other Fixture", category: "CSR_FRESHER", isSample: true } });
        const role = await tx.jobRole.create({ data: { code: `${prefix}-job`, title: "Fictional transcript check", track: "CSR_FRESHER" } });
        const set = await tx.questionSet.create({ data: { code: `${prefix}-set`, title: "Fictional transcript check", track: "CSR_FRESHER" } });
        const version = await tx.questionSetVersion.create({ data: { questionSetId: set.id, version: 1, versionCode: `${prefix}-v1`, status: "PUBLISHED" } });
        const questions = await Promise.all([1, 2].map(position => tx.question.create({ data: { versionId: version.id, code: `Q${position}`, position, category: "Fictional", text: `Fictional question ${position}`, responseSeconds: 90 } })));
        const application = await tx.application.create({ data: { candidateId: candidate.id, jobRoleId: role.id, submittedAt: new Date(), status: "AI_INTERVIEW_IN_PROGRESS", externalApplicationRef: prefix } });
        const session = await tx.interviewSession.create({ data: { candidateId: candidate.id, applicationId: application.id, jobRoleId: role.id, questionSetVersionId: version.id, status: "IN_PROGRESS", startedAt: new Date(), expiresAt: new Date(Date.now() + 3600000), isSample: true, questions: { create: questions.map(q => ({ questionId: q.id, position: q.position, code: q.code, textSnapshot: q.text, categorySnapshot: q.category, responseSeconds: q.responseSeconds })) } } });
        fixtureSessionId = session.id;
        let sequence = 0;
        let failAfterInsert = false;
        // Real savepoints preserve inner service transaction semantics without ever committing fixtures.
        const adapter = new Proxy(tx, { get: (object, prop) => prop === "$transaction" ? async (fn: (client: Prisma.TransactionClient) => unknown) => {
          const savepoint = `transcript_check_${++sequence}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
          const client = new Proxy(tx, { get: (db, name) => name === "interviewSession" && failAfterInsert ? new Proxy(db.interviewSession, { get: (delegate, method) => method === "update" ? async () => { throw new Error("FICTIONAL_ATOMICITY_FAILURE"); } : Reflect.get(delegate, method) }) : Reflect.get(db, name) });
          try { const result = await fn(client); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`); return result; }
          catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`); throw error; }
        } : Reflect.get(object, prop) }) as unknown as PrismaService;
        const config = new ConfigService<EnvironmentVariables, true>({ RECRUITER_SCOPE: "assigned" });
        const service = new InterviewsService(adapter, config, new AuditService(adapter), new NotificationsService(adapter), new AccessScope(config));
        // Principals are test values only; no role or permission database rows are inserted or changed.
        const user: AuthUser = { id: owner.id, firebaseUid: owner.firebaseUid, email: null, displayName: null, roles: ["CANDIDATE"], providers: [], permissions: new Set([PERMISSIONS.INTERVIEWS_TAKE]), candidateId: candidate.id };
        const unauthorized = { ...user, id: other.id, firebaseUid: other.firebaseUid, candidateId: otherCandidate.id };
        const input = { transcript: "I do not know the fictional answer yet.", source: "SPEECH_TO_TEXT" as const, responseDurationSec: 12, originalTranscript: "  i do not know\nthe fictional answer yet  ", cleanedTranscript: "I do not know the fictional answer yet.", hasUnfinalized: true, language: "en-IN", engine: "browser-web-speech", interimTranscript: "unfinished fictional words", cleanupVersion: "format-v2-final-separated" };
        phase = "ownership enforcement";
        await assert.rejects(service.saveAnswer(session.id, "Q1", input, { user: unauthorized }), { code: "RESOURCE_NOT_FOUND" });
        await assert.rejects(service.detail(session.id, unauthorized), { code: "RESOURCE_NOT_FOUND" });
        assert.equal(await tx.interviewAnswer.count({ where: { sessionId: session.id } }), 0);
        passed.push("ownership enforced before capture writes and transcript reads");
        phase = "failed save transaction atomicity";
        failAfterInsert = true;
        await assert.rejects(service.saveAnswer(session.id, "Q1", input, { user }), { message: "FICTIONAL_ATOMICITY_FAILURE" });
        failAfterInsert = false;
        assert.equal(await tx.interviewAnswer.count({ where: { sessionId: session.id } }), 0);
        assert.equal(await tx.interviewTranscript.count({ where: { answer: { sessionId: session.id } } }), 0);
        passed.push("failure after answer insert rolls back answer and transcript versions atomically");
        phase = "original cleaned and confirmed persistence";
        const saved = await service.saveAnswer(session.id, "Q1", input, { user });
        assert.equal(saved.idempotentReplay, false);
        const answer = await tx.interviewAnswer.findFirstOrThrow({ where: { sessionId: session.id }, include: { transcripts: true } });
        assert.equal(answer.transcript, input.transcript);
        assert.equal(answer.transcripts.length, 3);
        assert.equal(answer.transcripts.find(row => row.kind === "CONFIRMED")?.text, input.transcript);
        const detail = await service.detail(session.id, user);
        assert.equal(detail.questions[0].answer?.originalTranscript, input.originalTranscript);
        assert.equal(detail.questions[0].answer?.cleanedTranscript, input.cleanedTranscript);
        assert.equal(detail.questions[0].answer?.hasUnfinalized, true);
        assert.equal(detail.questions[0].answer?.interimTranscript, input.interimTranscript);
        assert.equal(detail.questions[0].answer?.originalFinalOnly, true);
        assert.equal(detail.questions[0].answer?.language, "en-IN");
        assert.equal(detail.questions[0].answer?.assessmentTranscript, "candidate_confirmed");
        passed.push("original text preserved verbatim; cleaned and confirmed versions stored distinctly");
        phase = "idempotent replay and immutable confirmation";
        assert.equal((await service.saveAnswer(session.id, "Q1", { ...input, originalTranscript: "different retry capture" }, { user })).idempotentReplay, true);
        await assert.rejects(service.saveAnswer(session.id, "Q1", { ...input, transcript: "changed confirmed answer" }, { user }), { code: "ANSWER_ALREADY_CONFIRMED" });
        assert.equal(await tx.interviewAnswer.count({ where: { sessionId: session.id } }), 1);
        assert.equal(await tx.interviewTranscript.count({ where: { answerId: answer.id } }), 3);
        assert.equal((await service.detail(session.id, user)).questions[0].answer?.originalTranscript, input.originalTranscript);
        passed.push("duplicate save does not add rows or overwrite original; confirmed edits rejected");
        phase = "typed fallback compatibility";
        await service.saveAnswer(session.id, "Q2", { transcript: "Fictional typed answer.", source: "TYPED_FALLBACK", responseDurationSec: 2 }, { user });
        const final = await service.detail(session.id, user);
        assert.equal(final.status, "COMPLETED");
        assert.equal(final.questions[1].answer?.originalTranscript, null);
        assert.equal(final.questions[1].answer?.cleanedTranscript, null);
        passed.push("legacy typed payload completes the session without fabricated original text");
        throw rollback;
      }, { timeout: 30000 });
    } catch (error) { if (error !== rollback) throw error; }
    phase = "rollback verification";
    assert.equal(await prisma.user.count({ where: { firebaseUid: { startsWith: prefix } } }), 0);
    assert.equal(await prisma.jobRole.count({ where: { code: { startsWith: prefix } } }), 0);
    assert.equal(await prisma.questionSet.count({ where: { code: { startsWith: prefix } } }), 0);
    assert.equal(await prisma.application.count({ where: { externalApplicationRef: prefix } }), 0);
    assert.equal(await prisma.interviewSession.count({ where: { id: fixtureSessionId } }), 0);
    assert.equal(await prisma.interviewAnswer.count({ where: { sessionId: fixtureSessionId } }), 0);
    assert.equal(await prisma.interviewTranscript.count({ where: { answer: { sessionId: fixtureSessionId } } }), 0);
    passed.push("outer transaction rolled back; zero fictional fixture records remain");
    process.stdout.write(JSON.stringify({ status: "passed", checks: passed, existingRecordsModified: false, permissionsModified: false, migrationsOrResets: false, providerRequests: 0 }, null, 2) + "\n");
  } finally { await prisma.$disconnect(); }
}
void main().catch((error: unknown) => {
  const detail = error as { code?: string; errorCode?: string; name?: string; message?: string };
  const code = detail?.code ?? detail?.errorCode;
  const kind = ["PrismaClientInitializationError", "PrismaClientKnownRequestError", "PrismaClientValidationError", "TypeError", "AssertionError", "Error"].includes(detail?.name ?? "") ? detail.name : "suppressed";
  console.error(JSON.stringify({ status: "failed", phase, kind, code: code && /^(P\d{4}|ERR_ASSERTION|ECONNREFUSED)$/.test(code) ? code : "suppressed", connectionUnavailable: /reach database|connect|ECONNREFUSED/i.test(detail?.message ?? ""), missingEnvironment: /Environment variable not found/.test(detail?.message ?? "") }));
  process.exitCode = 1;
});
