/** Opt-in local test database only. Full 10-scenario Candidate-to-HR lifecycle matrix; all writes roll back. */
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
import { CandidatesService } from "../../src/modules/candidates/candidates.module";
import { HrReviewsService } from "../../src/modules/recruitment/recruitment.module";
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
  assert(target && target !== env.DATABASE_URL);
  const url = new URL(target);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && /_test$/.test(url.pathname));
  Logger.overrideLogger(false);
  const db = new PrismaClient({ datasources: { db: { url: target } }, log: [] });
  const prefix = `fictional-e2e-${randomUUID()}`;
  const rollback = new Error("ROLLBACK_E2E_MATRIX");
  const passed: string[] = [];

  try {
    try {
      await db.$transaction(async (tx) => {
        let n = 0;
        const adapter = new Proxy(tx, {
          get: (o, prop) =>
            prop === "$transaction"
              ? async (arg: unknown) => {
                  const savepoint = `e2e_${++n}`;
                  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
                  try {
                    const result = Array.isArray(arg)
                      ? await Promise.all(arg)
                      : await (arg as (t: Prisma.TransactionClient) => Promise<unknown>)(tx);
                    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
                    return result;
                  } catch (e) {
                    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
                    throw e;
                  }
                }
              : Reflect.get(o, prop),
        }) as unknown as PrismaService;

        const config = new ConfigService<EnvironmentVariables, true>({
          INTERVIEW_COMPLETION_WINDOW_HOURS: 48,
          INTERVIEW_REMINDER_AFTER_HOURS: 24,
          RECRUITER_SCOPE: "all",
        });
        const audit = new AuditService(adapter);
        const notifications = new NotificationsService(adapter);
        const scope = new AccessScope(config);
        const interviews = new InterviewsService(adapter, config, audit, notifications, scope);
        const candidates = new CandidatesService(adapter, audit, notifications, scope);
        const reviews = new HrReviewsService(adapter, audit, scope);

        const hrAccount = await tx.user.create({
          data: {
            firebaseUid: `${prefix}-hr`,
            email: `${prefix}-hr@example.test`,
            emailVerified: true,
            displayName: "Fictional HR Reviewer",
          },
        });
        const hrUser: AuthUser = {
          id: hrAccount.id,
          firebaseUid: hrAccount.firebaseUid,
          email: hrAccount.email,
          displayName: hrAccount.displayName,
          providers: ["admin-password"],
          roles: ["HR_MANAGER"],
          permissions: new Set([
            PERMISSIONS.CANDIDATES_READ,
            PERMISSIONS.APPLICATIONS_READ,
            PERMISSIONS.APPLICATIONS_UPDATE_STATUS,
            PERMISSIONS.INTERVIEWS_READ,
            PERMISSIONS.INTERVIEWS_REVIEW,
            PERMISSIONS.HR_REMARKS_WRITE,
            PERMISSIONS.ASSESSMENTS_READ,
          ]),
          candidateId: null,
        };

        const makeCandidateUser = async (tag: string, name: string): Promise<AuthUser> => {
          const acc = await tx.user.create({
            data: {
              firebaseUid: `${prefix}-${tag}`,
              email: `${prefix}-${tag}@example.test`,
              emailVerified: true,
              displayName: name,
            },
          });
          return {
            id: acc.id,
            firebaseUid: acc.firebaseUid,
            email: acc.email,
            displayName: acc.displayName,
            providers: ["password"],
            roles: ["CANDIDATE"],
            permissions: new Set([PERMISSIONS.INTERVIEWS_TAKE]),
            candidateId: null,
          };
        };

        // 1 & 3 & 4 & 5 & 6: FE Closer completes all questions (including disconnect, resume, duplicate submit, post-completion login)
        phase = "1. FE Closer onboarding, disconnect, resume, completion, duplicate submit, post-completion login";
        const feUser = await makeCandidateUser("fe", "Fictional FE Closer");
        const feOnboard = await interviews.onboard({ roleCode: "FE-CLOSER" }, { user: feUser });
        assert(feOnboard.interviewId);
        const feCandidate = await tx.candidate.findUniqueOrThrow({ where: { userId: feUser.id } });
        feUser.candidateId = feCandidate.id;

        const feStarted = await interviews.start(feOnboard.interviewId, { user: feUser }, true);
        assert.equal(feStarted.status, "IN_PROGRESS");
        assert.equal(feStarted.totalQuestions, 4);

        const feSession = await tx.interviewSession.findUniqueOrThrow({
          where: { id: feOnboard.interviewId },
          include: { questions: { orderBy: { position: "asc" } } },
        });
        assert.equal(feSession.questions.length, 4);

        // Save first 2 answers (Speech-to-Text with original, cleaned, confirmed transcripts)
        for (const q of feSession.questions.slice(0, 2)) {
          await interviews.saveAnswer(
            feSession.id,
            q.code,
            {
              transcript: `Confirmed FE answer for ${q.code}: I verify coverage needs and guide the family clearly.`,
              originalTranscript: `raw stt for ${q.code} i verify coverage needs and guide the family clearly`,
              cleanedTranscript: `Confirmed FE answer for ${q.code}: I verify coverage needs and guide the family clearly.`,
              source: "SPEECH_TO_TEXT",
              responseDurationSec: 42,
              language: "en-US",
            },
            { user: feUser },
          );
        }

        // Scenario 3: Candidate disconnects during interview
        const interrupted = await interviews.interrupt(feSession.id, { user: feUser });
        assert.equal(interrupted.status, "INTERRUPTED");
        assert.equal(interrupted.completedQuestions, 2);
        passed.push("3. Candidate disconnects during interview: status INTERRUPTED and 2 confirmed answers preserved");

        // Scenario 4: Candidate resumes an incomplete session
        const resumed = await interviews.start(feSession.id, { user: feUser });
        assert.equal(resumed.status, "IN_PROGRESS");
        assert.equal(resumed.completedQuestions, 2);
        assert.equal(resumed.nextQuestion?.code, feSession.questions[2]!.code);
        assert.equal(await tx.interviewProgressEvent.count({ where: { sessionId: feSession.id, type: "RESUMED" } }), 1);
        passed.push("4. Candidate resumes incomplete session: resumes at Question 3 without losing prior answers");

        // Complete remaining 2 questions
        for (const q of feSession.questions.slice(2)) {
          await interviews.saveAnswer(
            feSession.id,
            q.code,
            {
              transcript: `Confirmed FE answer for ${q.code}: I handle objections with empathy and factual policy terms.`,
              source: "TYPED_FALLBACK",
              responseDurationSec: 35,
            },
            { user: feUser },
          );
        }

        const feSubmit = await interviews.submit(feSession.id, { user: feUser });
        assert.equal(feSubmit.alreadySubmitted, false);
        assert.equal(feSubmit.progress.status, "SUBMITTED");
        assert(feSubmit.progress.submittedAt);
        passed.push("1. FE Closer completes all 4 questions and submits interview once");

        // Scenario 5: Candidate tries to submit twice (idempotent replay without duplicate events/reviews)
        const secondSubmit = await interviews.submit(feSession.id, { user: feUser });
        assert.equal(secondSubmit.alreadySubmitted, true);
        assert.equal(await tx.interviewAnswer.count({ where: { sessionId: feSession.id } }), 4);
        assert.equal(await tx.interviewProgressEvent.count({ where: { sessionId: feSession.id, type: "SUBMITTED" } }), 1);
        assert.equal(await tx.hrReview.count({ where: { interviewSessionId: feSession.id } }), 1);
        passed.push("5. Candidate duplicate submission handled idempotently (alreadySubmitted=true); answers, events, and review not duplicated");

        // Scenario 6: Candidate logs in after completion
        const relogin = await interviews.onboard({}, { user: feUser });
        assert.equal(relogin.interviewId, feSession.id);
        await assert.rejects(interviews.start(feSession.id, { user: feUser }, true), (err: { status?: number }) => err.status === 409);
        const fePortal = await candidates.portal(feUser);
        assert.equal(fePortal.applications[0]?.stage.key, "under_review");
        assert.equal(fePortal.applications[0]?.interviews[0]?.status, "SUBMITTED");
        passed.push("6. Candidate logs in after completion: existing submitted interview preserved, restart blocked, portal shows Under Recruiter Review");

        // Scenario 2: CSR Fresher completes all questions
        phase = "2. CSR Fresher completes all questions";
        const csrUser = await makeCandidateUser("csr", "Fictional CSR Fresher");
        const csrOnboard = await interviews.onboard({ roleCode: "CSR-FRESHER" }, { user: csrUser });
        assert(csrOnboard.interviewId);
        const csrCandidate = await tx.candidate.findUniqueOrThrow({ where: { userId: csrUser.id } });
        csrUser.candidateId = csrCandidate.id;

        await interviews.start(csrOnboard.interviewId, { user: csrUser }, true);
        const csrSession = await tx.interviewSession.findUniqueOrThrow({
          where: { id: csrOnboard.interviewId },
          include: { questions: { orderBy: { position: "asc" } } },
        });
        assert.equal(csrSession.questions.length, 4);
        for (const q of csrSession.questions) {
          await interviews.saveAnswer(
            csrSession.id,
            q.code,
            {
              transcript: `Confirmed CSR answer for ${q.code}: I listen actively, stay calm, and resolve the customer's question.`,
              source: "TYPED_FALLBACK",
              responseDurationSec: 28,
            },
            { user: csrUser },
          );
        }
        const csrSubmit = await interviews.submit(csrSession.id, { user: csrUser });
        assert.equal(csrSubmit.progress.status, "SUBMITTED");
        passed.push("2. CSR Fresher completes all 4 questions and submits interview");

        // Scenario 10: Unauthorized user requests another candidate's interview
        phase = "10. Unauthorized cross-candidate access rejected";
        await assert.rejects(interviews.progress(feSession.id, csrUser), { code: "RESOURCE_NOT_FOUND" });
        await assert.rejects(interviews.detail(feSession.id, csrUser), { code: "RESOURCE_NOT_FOUND" });
        await assert.rejects(
          interviews.saveAnswer(feSession.id, feSession.questions[0]!.code, { transcript: "Hijack", source: "TYPED_FALLBACK", responseDurationSec: 5 }, { user: csrUser }),
          { code: "RESOURCE_NOT_FOUND" },
        );
        passed.push("10. Unauthorized cross-candidate access to progress, detail, and saveAnswer rejected");

        // Scenario 7: HR opens a newly completed interview
        phase = "7. HR opens newly completed interview in review queue";
        const queue = await interviews.list({ reviewOpen: true, page: 1, limit: 50, sortBy: "submittedAt", sortDir: "desc" }, hrUser);
        const feInQueue = queue.rows.find((i) => i.id === feSession.id);
        const csrInQueue = queue.rows.find((i) => i.id === csrSession.id);
        assert(feInQueue && csrInQueue);
        assert.equal(feInQueue.review?.status, "PENDING_REVIEW");

        const hrDetail = await interviews.detail(feSession.id, hrUser);
        assert.equal(hrDetail.candidate.fullName, "Fictional FE Closer");
        assert.equal(hrDetail.jobRole.code, "FE-CLOSER");
        assert.equal(hrDetail.questions.length, 4);
        assert.equal(
          hrDetail.questions[0]?.answer?.transcript,
          `Confirmed FE answer for ${feSession.questions[0]!.code}: I verify coverage needs and guide the family clearly.`,
        );
        assert.equal(
          hrDetail.questions[0]?.answer?.originalTranscript,
          `raw stt for ${feSession.questions[0]!.code} i verify coverage needs and guide the family clearly`,
        );
        passed.push("7. HR review queue and interview detail show accurate candidate info, role, ordered questions, and confirmed/original transcripts");

        // Scenario 8: HR reviews candidate answers and adds internal remark
        phase = "8. HR reviews candidate answers and records internal remark";
        assert(hrDetail.review?.id);
        const updatedReview = await reviews.update(
          hrDetail.review.id,
          { status: "REVIEWED", remarks: "Strong FE closing structure and clear objection handling." },
          { user: hrUser, requestId: `${prefix}-req-1` },
        );
        assert.equal(updatedReview.status, "REVIEWED");
        assert(updatedReview.reviewedAt);

        const remark = await candidates.addRemark(
          hrDetail.applicationId,
          { body: "Recommend moving to Shortlisted for live HR interview." },
          { user: hrUser, requestId: `${prefix}-req-2` },
        );
        assert.equal(remark.body, "Recommend moving to Shortlisted for live HR interview.");

        // Candidate portal must not leak HR remarks or internal review notes
        const fePortalAfterReview = JSON.stringify(await candidates.portal(feUser));
        assert(!fePortalAfterReview.includes("Strong FE closing structure"));
        assert(!fePortalAfterReview.includes("Recommend moving to Shortlisted"));
        passed.push("8. HR saves review decision and internal remark; candidate portal never exposes internal HR notes");

        // Scenario 9: HR updates a permitted recruitment stage
        phase = "9. HR updates permitted recruitment stage and audits transition";
        const stageUpdate = await candidates.updateStatus(
          hrDetail.applicationId,
          { status: "SHORTLISTED", note: "Shortlisted after HR review of AI interview" },
          { user: hrUser, requestId: `${prefix}-req-3` },
        );
        assert.equal(stageUpdate.status, "SHORTLISTED");

        // Disallowed backward transition to APPLICATION_RECEIVED must be rejected
        await assert.rejects(
          candidates.updateStatus(hrDetail.applicationId, { status: "APPLICATION_RECEIVED" }, { user: hrUser }),
          (err: { status?: number }) => err.status === 409,
        );

        const timeline = await candidates.timeline(hrDetail.applicationId, hrUser);
        assert(timeline.events.some((e) => e.type === "STATUS_CHANGED" && e.toStatus === "SHORTLISTED"));
        assert(timeline.events.some((e) => e.type === "HR_REVIEW_UPDATED"));
        assert.equal(timeline.remarks.length, 1);
        passed.push("9. HR updates recruitment stage to SHORTLISTED, invalid transition rejected, audit timeline verified");

        throw rollback;
      }, { timeout: 60000 });
    } catch (e) {
      if (e !== rollback) throw e;
    }

    assert.equal(await db.user.count({ where: { firebaseUid: { startsWith: prefix } } }), 0);
    process.stdout.write(
      JSON.stringify({ status: "passed", scenariosVerified: passed.length, checks: passed, fixturesRolledBack: true, existingRecordsModified: false }, null, 2) + "\n",
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "failed", phase, message: error instanceof Error ? error.message : "unknown" }));
  process.exitCode = 1;
});
