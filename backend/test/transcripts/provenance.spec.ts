import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ConfigService } from "@nestjs/config";
import type { PrismaService } from "../../src/database/prisma.service";
import type { EnvironmentVariables } from "../../src/config/env.validation";
import type { AuthUser } from "../../src/common/auth-user";
import { PERMISSIONS } from "../../src/common/constants/permissions";
import { AccessScope } from "../../src/common/access-scope";
import { SaveAnswerDto } from "../../src/modules/interviews/interviews.dto";
import { answerTranscripts, transcriptVersions } from "../../src/modules/interviews/answer-transcripts";
import { InterviewsService } from "../../src/modules/interviews/interviews.service";
import type { AuditService } from "../../src/modules/audit/audit.module";
import type { NotificationsService } from "../../src/modules/notifications/notifications.module";
import { AssessmentService } from "../../src/modules/assessment/assessment.service";
import type { OpenRouterService } from "../../src/modules/assessment/openrouter.service";
import * as nlp from "../../src/modules/assessment/nlp";

const input: SaveAnswerDto = {
  transcript: "I do not know the answer yet.", source: "SPEECH_TO_TEXT", responseDurationSec: 12,
  originalTranscript: "  i do not know\nthe answer yet  ", cleanedTranscript: "I do not know the answer yet.",
  hasUnfinalized: true, language: "en-IN", engine: "browser-web-speech", cleanupVersion: "local-format-v1",
};

describe("transcript versions", () => {
  it("preserves original characters, uncertainty and separate formatting without changing confirmation", () => {
    const rows = answerTranscripts(input, input.transcript);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "CONFIRMED", text: input.transcript, metadata: { candidateReviewed: true } });
    expect(rows[1]).toMatchObject({ kind: "PROVISIONAL", text: input.originalTranscript, metadata: { variant: "original", hasUnfinalized: true } });
    expect(rows[2]).toMatchObject({ kind: "PROVISIONAL", text: input.cleanedTranscript, metadata: { variant: "cleaned", cleanupVersion: "local-format-v1" } });
  });
  it("retains the legacy provisional field and prefers an explicitly supplied original", () => {
    const legacy = { ...input, originalTranscript: undefined, cleanedTranscript: undefined, provisionalTranscript: "old raw text" };
    expect(answerTranscripts(legacy, input.transcript)[1].text).toBe("old raw text");
    expect(answerTranscripts({ ...legacy, originalTranscript: "" }, input.transcript)[1].text).toBe("");
  });
  it("does not fabricate original text for historical or typed-only answers", () => {
    expect(transcriptVersions([])).toMatchObject({ originalTranscript: null, cleanedTranscript: null, hasUnfinalized: null, assessmentTranscript: "candidate_confirmed" });
    expect(answerTranscripts({ transcript: "typed", source: "TYPED_FALLBACK", responseDurationSec: 1 }, "typed")).toHaveLength(1);
  });
  it("reads legacy raw and new variants without treating a cleanup suggestion as the original", () => {
    const rows = [{ kind: "PROVISIONAL" as const, text: "raw", language: "en-GB", metadata: null }, { kind: "PROVISIONAL" as const, text: "Raw.", language: "en-GB", metadata: { variant: "cleaned", cleanupVersion: "v1" } }];
    expect(transcriptVersions(rows)).toMatchObject({ originalTranscript: "raw", cleanedTranscript: "Raw.", language: "en-GB", cleanupVersion: "v1", hasUnfinalized: null });
  });
  it("validates lengths, boolean flags, and allowed payload fields", async () => {
    expect(await validate(plainToInstance(SaveAnswerDto, input), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    for (const patch of [{ originalTranscript: "x".repeat(10001) }, { cleanedTranscript: "x".repeat(10001) }, { hasUnfinalized: "true" }, { cleanupVersion: "x".repeat(61) }, { model: "unexpected" }]) {
      expect((await validate(plainToInstance(SaveAnswerDto, { ...input, ...patch }), { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
    }
  });
});

function fixture() {
  const user: AuthUser = { id: "user", firebaseUid: "fictional", email: null, displayName: null, providers: [], roles: ["CANDIDATE"], candidateId: "candidate", permissions: new Set([PERMISSIONS.INTERVIEWS_TAKE]) };
  const question = { id: "question", code: "Q1", position: 1, textSnapshot: "Fictional question", categorySnapshot: "Test", responseSeconds: 90 };
  const session = { id: "session", candidateId: "candidate", status: "IN_PROGRESS", applicationId: "application", expiresAt: new Date(Date.now() + 3600000), questions: [question], answers: [], candidate: { id: "candidate", category: "CSR_FRESHER" }, jobRole: {}, questionSetVersion: { versionCode: "v1" }, application: { assignedRecruiterId: null } };
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: "session", status: "IN_PROGRESS", candidate_id: "candidate", application_id: "application", expires_at: session.expiresAt }]),
    $transaction: jest.fn(),
    interviewSession: { findUnique: jest.fn().mockResolvedValue(session), findUniqueOrThrow: jest.fn().mockResolvedValue({ questionSetVersionId: "v1" }), update: jest.fn() },
    interviewSessionQuestion: { findFirst: jest.fn().mockResolvedValue(question), findMany: jest.fn().mockResolvedValue([{ ...question, answer: null }]) },
    interviewAnswer: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    interviewTranscript: { findMany: jest.fn().mockResolvedValue([]) },
  };
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  const config = {} as ConfigService<EnvironmentVariables, true>;
  const service = new InterviewsService(db as unknown as PrismaService, config, {} as AuditService, {} as NotificationsService, new AccessScope(config));
  return { db, service, user, session };
}

describe("confirmed-answer persistence and access", () => {
  it("atomically stores original, cleaned, and confirmed versions on confirmation", async () => {
    const { db, service, user } = fixture();
    await service.saveAnswer("session", "Q1", input, { user });
    expect(db.interviewAnswer.create).toHaveBeenCalledTimes(1);
    expect(db.interviewAnswer.create.mock.calls[0][0].data).toMatchObject({ transcript: input.transcript, transcripts: { create: answerTranscripts(input, input.transcript) } });
  });
  it("does not duplicate or rewrite provenance when the same confirmation is retried", async () => {
    const { db, service, user } = fixture();
    db.interviewAnswer.findUnique.mockResolvedValue({ transcript: input.transcript });
    const result = await service.saveAnswer("session", "Q1", { ...input, originalTranscript: "changed attempt" }, { user });
    expect(result.idempotentReplay).toBe(true);
    expect(db.interviewAnswer.create).not.toHaveBeenCalled();
    await expect(service.saveAnswer("session", "Q1", { ...input, transcript: "different" }, { user })).rejects.toMatchObject({ code: "ANSWER_ALREADY_CONFIRMED" });
  });
  it("checks session ownership before loading sensitive transcript variants", async () => {
    const { db, service, user } = fixture();
    await expect(service.detail("session", { ...user, candidateId: "other" })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(db.interviewTranscript.findMany).not.toHaveBeenCalled();
  });
  it("returns distinct versions to the authorized candidate", async () => {
    const { db, service, user, session } = fixture();
    db.interviewSession.findUnique.mockResolvedValue({ ...session, answers: [{ id: "answer", sessionQuestionId: "question", transcript: input.transcript, source: input.source }] });
    db.interviewTranscript.findMany.mockResolvedValue(answerTranscripts(input, input.transcript).map(row => ({ ...row, answerId: "answer" })));
    const detail = await service.detail("session", user);
    expect(detail.questions[0].answer).toMatchObject({ transcript: input.transcript, originalTranscript: input.originalTranscript, cleanedTranscript: input.cleanedTranscript, hasUnfinalized: true, language: "en-IN", assessmentTranscript: "candidate_confirmed" });
  });
});

it("assesses only candidate-confirmed text and preserves the external provider privacy gate", async () => {
  const analysis = jest.spyOn(nlp, "analyze");
  const db = { assessmentReport: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "PROCESSING", rubricSnapshot: [{ questionId: "Q1", content: { exampleAnswer: "Fictional reference", expectedConcepts: [] } }], session: { status: "SUBMITTED", questions: [{ id: "question", code: "Q1", textSnapshot: "Fictional question" }], answers: [{ id: "answer", sessionQuestionId: "question", confirmed: true, transcript: input.transcript, originalTranscript: "raw differs", cleanedTranscript: "suggestion differs" }] } }), update: jest.fn() }, lLMRequestUsage: { count: jest.fn().mockResolvedValue(0) } };
  const provider = { allowed: jest.fn().mockReturnValue(false), request: jest.fn() };
  const service = new AssessmentService(db as unknown as PrismaService, provider as unknown as OpenRouterService, {} as ConfigService<EnvironmentVariables, true>);
  await service.process("report");
  expect(analysis).toHaveBeenCalledWith("Q1", input.transcript, "Fictional reference", []);
  expect(provider.allowed).toHaveBeenCalledWith(false);
  expect(provider.request).not.toHaveBeenCalled();
  expect(db.assessmentReport.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", phase: "WAITING_FOR_APPROVED_PROVIDER" }) }));
  analysis.mockRestore();
});
