/** Opt-in local test database only. Fictional fixtures and all lifecycle writes roll back. */
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
import type { AuthUser } from "../../src/common/auth-user";
import type { PrismaService } from "../../src/database/prisma.service";
import type { EnvironmentVariables } from "../../src/config/env.validation";

let phase = "configuration";
async function main() {
  const env = parse(readFileSync(resolve(__dirname, "../../.env")));
  const target = env.TEST_DATABASE_URL;
  assert(target && target !== env.DATABASE_URL);
  const url = new URL(target);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && /_test$/.test(url.pathname));
  Logger.overrideLogger(false);
  const db = new PrismaClient({ datasources: { db: { url: target } }, log: [] });
  const prefix = `fictional-assignment-${randomUUID()}`;
  const rollback = new Error("ROLLBACK_FIXTURES");
  const passed: string[] = [];
  try {
    try {
      await db.$transaction(async tx => {
        let n = 0;
        const adapter = new Proxy(tx, { get: (o, prop) => prop === "$transaction" ? async (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => {
          const savepoint = `assignment_${++n}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
          try { const result = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`); return result; }
          catch (e) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`); throw e; }
        } : Reflect.get(o, prop) }) as unknown as PrismaService;
        const config = new ConfigService<EnvironmentVariables, true>({ INTERVIEW_COMPLETION_WINDOW_HOURS: 48, INTERVIEW_REMINDER_AFTER_HOURS: 24, RECRUITER_SCOPE: "assigned" });
        const service = new InterviewsService(adapter, config, new AuditService(adapter), new NotificationsService(adapter), new AccessScope(config));
        for (const roleCode of ["FE-CLOSER", "CSR-FRESHER"]) {
          phase = `${roleCode} assignment`;
          const account = await tx.user.create({ data: { firebaseUid: `${prefix}-${roleCode}`, email: `${prefix}-${roleCode}@example.test`, emailVerified: true, displayName: "Fictional Assignment Candidate" } });
          const user: AuthUser = { id: account.id, firebaseUid: account.firebaseUid, email: account.email, displayName: account.displayName, providers: ["password"], roles: ["CANDIDATE"], permissions: new Set(["interviews:take"]), candidateId: null };
          assert.equal((await service.onboard({}, { user })).state, "select_role");
          const first = await service.onboard({ roleCode }, { user });
          assert(first.interviewId);
          const candidate = await tx.candidate.findUniqueOrThrow({ where: { userId: user.id } });
          user.candidateId = candidate.id;
          assert.equal(candidate.fullName, account.displayName);
          const session = await tx.interviewSession.findUniqueOrThrow({ where: { id: first.interviewId }, include: { questions: { orderBy: { position: "asc" } }, application: true, questionSetVersion: { include: { questions: true } } } });
          assert.equal(session.application.status, "AI_INTERVIEW_PENDING");
          assert.equal(session.questions.length, 4);
          await assert.rejects(adapter.$transaction(async nested => {
            await nested.interviewSession.create({ data: { initialAssignmentKey: candidate.id, candidateId: candidate.id, applicationId: session.applicationId, jobRoleId: session.jobRoleId, questionSetVersionId: session.questionSetVersionId, expiresAt: session.expiresAt } });
          }), { code: "P2002" });
          assert.equal(session.questions[0].code, roleCode === "FE-CLOSER" ? "FE-001" : "CSR-001");
          for (const q of session.questions) assert.equal(q.textSnapshot, session.questionSetVersion.questions.find(x => x.id === q.questionId)?.text);
          for (let i = 0; i < 3; i++) assert.equal((await service.onboard({ roleCode: roleCode === "FE-CLOSER" ? "CSR-FRESHER" : "FE-CLOSER" }, { user })).interviewId, first.interviewId);
          passed.push(`${roleCode}: explicit selection, published wording and repeat-login idempotence`);
          phase = "answer and submit lifecycle";
          await service.start(session.id, { user }, true);
          for (const q of session.questions) await service.saveAnswer(session.id, q.code, { transcript: "Fictional test answer only.", source: "TYPED_FALLBACK", responseDurationSec: 5 }, { user });
          await service.submit(session.id, { user });
          assert.equal((await service.progress(session.id, user)).status, "SUBMITTED");
          assert.equal((await service.onboard({}, { user })).interviewId, first.interviewId);
          assert.equal(await tx.interviewSession.count({ where: { candidateId: candidate.id } }), 1);
          assert.equal(await tx.interviewAnswer.count({ where: { sessionId: session.id } }), 4);
          assert(await tx.hrReview.findUnique({ where: { interviewSessionId: session.id } }));
          assert(await tx.recruitmentEvent.count({ where: { applicationId: session.applicationId, type: "INTERVIEW_INVITED" } }));
          await assert.rejects(service.start(session.id, { user }, true));
          await assert.rejects(service.detail(session.id, { ...user, candidateId: null }));
          passed.push(`${roleCode}: persisted answers, submission, review, ownership, no second assignment`);
        }
        phase = "Careers application reuse and selection";
        const account = await tx.user.create({ data: { firebaseUid: `${prefix}-careers`, email: `${prefix}-careers@example.test`, emailVerified: true, displayName: "Fictional Google Name" } });
        const candidate = await tx.candidate.create({ data: { email: account.email, fullName: "Established Fictional Name", category: "CSR_FRESHER" } });
        const roles = await tx.jobRole.findMany({ where: { code: { in: ["FE-CLOSER", "CSR-FRESHER"] } } });
        for (const role of roles) await tx.application.create({ data: { candidateId: candidate.id, jobRoleId: role.id, source: "CAREERS_WEBSITE", submittedAt: new Date() } });
        const user: AuthUser = { id: account.id, firebaseUid: account.firebaseUid, email: account.email, displayName: account.displayName, providers: ["google.com"], roles: ["CANDIDATE"], permissions: new Set(["interviews:take"]), candidateId: null };
        const selection = await service.onboard({}, { user });
        assert.equal(selection.state, "select_application");
        const chosen = await tx.application.findFirstOrThrow({ where: { candidateId: candidate.id, jobRole: { code: "CSR-FRESHER" } } });
        const result = await service.onboard({ applicationId: chosen.id, roleCode: "FE-CLOSER" }, { user });
        const assigned = await tx.interviewSession.findUniqueOrThrow({ where: { id: result.interviewId } });
        assert.equal(assigned.jobRoleId, chosen.jobRoleId);
        assert.equal(await tx.application.count({ where: { candidateId: candidate.id } }), 2);
        assert.equal((await tx.candidate.findUniqueOrThrow({ where: { id: candidate.id } })).fullName, "Established Fictional Name");
        passed.push("verified Careers profile linked; explicit application choice; application role overrides submitted role; established name preserved; no duplicate application");
        throw rollback;
      }, { timeout: 60000 });
    } catch (e) { if (e !== rollback) throw e; }
    assert.equal(await db.user.count({ where: { firebaseUid: { startsWith: prefix } } }), 0);
    process.stdout.write(JSON.stringify({ status: "passed", checks: passed, fixturesRolledBack: true, providerRequests: 0 }) + "\n");
  } finally { await db.$disconnect(); }
}
void main().catch((error: unknown) => { console.error(JSON.stringify({ status: "failed", phase, code: (error as {code?: string}).code, name: (error as {name?: string}).name, details: "suppressed" })); process.exitCode = 1; });
