import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InterviewStatus, Prisma, RecruitmentStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AppError, conflict, forbidden, notFound, unprocessable } from "../../common/errors";
import { hasPermission, type AuthUser } from "../../common/auth-user";
import { PERMISSIONS } from "../../common/constants/permissions";
import { AccessScope } from "../../common/access-scope";
import type { RequestContext } from "../../common/http";
import { pageArgs, pageMeta } from "../../common/pagination";
import type { EnvironmentVariables } from "../../config/env.validation";
import { AuditService } from "../audit/audit.module";
import { NotificationsService } from "../notifications/notifications.module";
import type { InterviewListQueryDto, SaveAnswerDto } from "./interviews.dto";

type Tx = Prisma.TransactionClient;
const OPEN: InterviewStatus[] = ["PENDING", "IN_PROGRESS", "INTERRUPTED"];
const HOUR = 3_600_000;

/** Short human-readable reference shown to candidates and HR (derived from the session id). */
export const interviewReference = (id: string) => `INT-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const sessionInclude = {
  questions: { orderBy: { position: "asc" as const } },
  answers: true,
  jobRole: { select: { id: true, code: true, title: true, track: true } },
  questionSetVersion: { select: { id: true, versionCode: true, version: true } },
  candidate: { select: { id: true, fullName: true, category: true } },
} satisfies Prisma.InterviewSessionInclude;
type SessionFull = Prisma.InterviewSessionGetPayload<{ include: typeof sessionInclude }>;

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly scope: AccessScope,
  ) {}

  // ─────────────────────────── HR: invite ───────────────────────────

  /** Creates an interview session pinned to the job role's active published question-set version. */
  async invite(applicationId: string, ctx: RequestContext) {
    const app = await this.prisma.application.findFirst({
      where: { id: applicationId, ...this.scope.applicationWhere(ctx.user) },
      include: { jobRole: { include: { defaultQuestionSet: { include: { activeVersion: { include: { questions: { where: { isActive: true }, orderBy: { position: "asc" } } } } } } } } },
    });
    if (!app) throw notFound("Application");
    const version = app.jobRole.defaultQuestionSet?.activeVersion;
    if (!version || version.status !== "PUBLISHED" || !version.questions.length) {
      throw unprocessable("QUESTION_SET_NOT_PUBLISHED", "This job role has no published question set.");
    }
    if (app.status !== "APPLICATION_RECEIVED" && app.status !== "AI_INTERVIEW_PENDING") {
      throw conflict("INVALID_STATUS_TRANSITION", "An interview can only be issued while the application is awaiting its AI interview.");
    }
    const now = new Date();
    const windowH = this.config.get("INTERVIEW_COMPLETION_WINDOW_HOURS", { infer: true });
    const reminderH = this.config.get("INTERVIEW_REMINDER_AFTER_HOURS", { infer: true });

    const session = await this.prisma.$transaction(async (tx) => {
      const s = await tx.interviewSession.create({
        data: {
          candidateId: app.candidateId,
          applicationId: app.id,
          jobRoleId: app.jobRoleId,
          questionSetVersionId: version.id,
          invitedAt: now,
          expiresAt: new Date(now.getTime() + windowH * HOUR),
          reminderDueAt: reminderH < windowH ? new Date(now.getTime() + reminderH * HOUR) : null,
          currentQuestionId: version.questions[0]!.id,
          questions: {
            create: version.questions.map((q) => ({ questionId: q.id, position: q.position, code: q.code, textSnapshot: q.text, categorySnapshot: q.category, responseSeconds: q.responseSeconds })),
          },
          progressEvents: { create: { type: "INVITED" } },
        },
      });
      if (app.status === "APPLICATION_RECEIVED") await this.setApplicationStatus(tx, app.id, app.status, "AI_INTERVIEW_PENDING", ctx.user.id, "AI interview issued");
      await tx.recruitmentEvent.create({ data: { applicationId: app.id, type: "INTERVIEW_INVITED", actorUserId: ctx.user.id, note: version.versionCode } });
      await this.audit.record({ actorUserId: ctx.user.id, action: "interview.invited", entityType: "interview_session", entityId: s.id, summary: { applicationId: app.id, questionSetVersion: version.versionCode }, requestId: ctx.requestId }, tx);
      return s;
    });
    return this.detail(session.id, ctx.user);
  }

  // ─────────────────────────── Reads ───────────────────────────

  async list(q: InterviewListQueryDto, user: AuthUser) {
    const where: Prisma.InterviewSessionWhereInput = {
      status: q.status,
      jobRoleId: q.jobRoleId,
      applicationId: q.applicationId,
      application: this.scope.applicationWhere(user),
      ...(q.reviewStatus ? { review: { status: q.reviewStatus } } : q.reviewOpen ? { review: { status: { in: ["PENDING_REVIEW", "IN_REVIEW", "FURTHER_REVIEW_REQUIRED"] } } } : {}),
      ...(q.search ? { candidate: { fullName: { contains: q.search, mode: "insensitive" } } } : {}),
      ...(q.from || q.to ? { createdAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.interviewSession.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortDir },
        ...pageArgs(q),
        select: {
          id: true, status: true, invitedAt: true, startedAt: true, completedAt: true, submittedAt: true, expiresAt: true, isSample: true,
          candidate: { select: { id: true, fullName: true, email: true, isSample: true } },
          application: { select: { id: true, status: true } },
          jobRole: { select: { id: true, title: true, track: true } },
          questionSetVersion: { select: { versionCode: true } },
          review: { select: { id: true, status: true, reviewedAt: true } },
          assessments: { select: { id: true, status: true }, orderBy: { version: "desc" }, take: 1 },
          _count: { select: { answers: true, questions: true } },
        },
      }),
      this.prisma.interviewSession.count({ where }),
    ]);
    return { rows, meta: pageMeta(q, total) };
  }

  listMine(user: AuthUser) {
    if (!user.candidateId) return [];
    return this.prisma.interviewSession.findMany({
      where: { candidateId: user.candidateId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, invitedAt: true, startedAt: true, submittedAt: true, expiresAt: true, jobRole: { select: { title: true, track: true } } },
    });
  }

  /** Staff get the full record (answers, review). Candidates get only their own session, without HR data. */
  async detail(id: string, user: AuthUser) {
    const s = await this.load(id, user);
    const staff = hasPermission(user, PERMISSIONS.INTERVIEWS_READ);
    return {
      ...this.progressOf(s),
      candidate: s.candidate,
      invitedAt: s.invitedAt,
      completedAt: s.completedAt,
      isSample: s.isSample,
      questions: s.questions.map((q) => {
        const a = s.answers.find((x) => x.sessionQuestionId === q.id);
        return {
          code: q.code,
          position: q.position,
          category: q.categorySnapshot,
          text: q.textSnapshot,
          responseSeconds: q.responseSeconds,
          answer: a
            ? { transcript: a.transcript, source: a.source, responseDurationSec: a.responseDurationSec, confirmedAt: a.confirmedAt, questionTextSnapshot: a.questionTextSnapshot }
            : null,
        };
      }),
      ...(staff ? { review: await this.prisma.hrReview.findUnique({ where: { interviewSessionId: id } }) } : {}),
    };
  }

  async progress(id: string, user: AuthUser) {
    return this.progressOf(await this.load(id, user));
  }

  // ─────────────────────────── Candidate lifecycle ───────────────────────────

  /** Starts a PENDING session or resumes an IN_PROGRESS/INTERRUPTED one. Safe to call repeatedly. */
  async start(id: string, ctx: RequestContext, consent = false) {
    const result = await this.prisma.$transaction(async (tx) => {
      const s = await this.lockOwned(tx, id, ctx.user);
      if (await this.expireIfDue(tx, s)) return "expired" as const;
      if (s.status === "COMPLETED" || s.status === "SUBMITTED") throw conflict("INTERVIEW_NOT_ACTIVE", "This interview has already been completed.");
      if (s.status === "EXPIRED" || s.status === "CANCELLED") throw conflict("INTERVIEW_NOT_ACTIVE", `This interview is ${s.status.toLowerCase()}.`);
      const now = new Date();
      if (s.status === "IN_PROGRESS") return "ok" as const; // repeated Start/Resume clicks: no new events
      if (s.status === "PENDING") {
        if (!consent) throw unprocessable("VALIDATION_FAILED", "Consent is required before the interview can start.", { consentRequired: true });
        await tx.interviewSession.update({
          where: { id },
          data: { status: "IN_PROGRESS", startedAt: now, lastActivityAt: now, progressEvents: { create: { type: "STARTED", metadata: { consentAcceptedAt: now.toISOString() } } } },
        });
        const app = await tx.application.findUniqueOrThrow({ where: { id: s.applicationId } });
        if (app.status === "AI_INTERVIEW_PENDING" || app.status === "APPLICATION_RECEIVED") {
          await this.setApplicationStatus(tx, app.id, app.status, "AI_INTERVIEW_IN_PROGRESS", ctx.user.id, null);
          await tx.recruitmentEvent.create({ data: { applicationId: app.id, type: "INTERVIEW_STARTED", actorUserId: ctx.user.id } });
        }
      } else {
        await tx.interviewSession.update({ where: { id }, data: { status: "IN_PROGRESS", lastActivityAt: now, progressEvents: { create: { type: "RESUMED" } } } });
      }
      return "ok" as const;
    });
    if (result === "expired") throw new AppError("INTERVIEW_EXPIRED", "The completion window for this interview has closed.", HttpStatus.GONE);
    return this.progress(id, ctx.user);
  }

  async interrupt(id: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const s = await this.lockOwned(tx, id, ctx.user);
      if (s.status !== "IN_PROGRESS") return;
      await tx.interviewSession.update({ where: { id }, data: { status: "INTERRUPTED", lastActivityAt: new Date(), progressEvents: { create: { type: "INTERRUPTED" } } } });
    });
    return this.progress(id, ctx.user);
  }

  /**
   * Saves a confirmed answer. Rules: own session, IN_PROGRESS, not expired, question belongs to the
   * session, earlier questions answered first. Re-sending the same text is idempotent; changing a
   * confirmed answer is rejected.
   */
  async saveAnswer(id: string, questionCode: string, dto: SaveAnswerDto, ctx: RequestContext) {
    const transcript = dto.transcript.trim();
    if (!transcript) throw unprocessable("VALIDATION_FAILED", "The answer cannot be empty.");
    const outcome = await this.prisma.$transaction(async (tx) => {
      const s = await this.lockOwned(tx, id, ctx.user);
      if (await this.expireIfDue(tx, s)) return "expired" as const;
      const sq = await tx.interviewSessionQuestion.findFirst({ where: { sessionId: id, code: questionCode } });
      if (!sq) throw unprocessable("QUESTION_NOT_IN_SESSION", "This question is not part of the interview.");
      const existing = await tx.interviewAnswer.findUnique({ where: { sessionQuestionId: sq.id } });
      if (existing) {
        if (existing.transcript === transcript) return "duplicate" as const;
        throw conflict("ANSWER_ALREADY_CONFIRMED", "This answer has already been confirmed and cannot be changed.");
      }
      if (s.status === "PENDING") throw conflict("INTERVIEW_NOT_STARTED", "Start the interview before answering.");
      if (s.status !== "IN_PROGRESS") throw conflict("INTERVIEW_NOT_ACTIVE", `Answers cannot be saved while the interview is ${s.status.toLowerCase()}.`);

      const all = await tx.interviewSessionQuestion.findMany({ where: { sessionId: id }, orderBy: { position: "asc" }, include: { answer: { select: { id: true } } } });
      const firstOpen = all.find((q) => !q.answer);
      if (firstOpen && firstOpen.id !== sq.id) {
        throw unprocessable("VALIDATION_FAILED", `Questions must be answered in order. Next question: ${firstOpen.code}.`, { nextQuestion: firstOpen.code });
      }
      const now = new Date();
      const version = await tx.interviewSession.findUniqueOrThrow({ where: { id }, select: { questionSetVersionId: true } });
      await tx.interviewAnswer.create({
        data: {
          sessionId: id,
          sessionQuestionId: sq.id,
          questionCode: sq.code,
          questionSetVersionId: version.questionSetVersionId,
          questionTextSnapshot: sq.textSnapshot,
          categorySnapshot: sq.categorySnapshot,
          transcript,
          source: dto.source,
          responseDurationSec: dto.responseDurationSec,
          confirmedAt: now,
          transcripts: {
            create: [
              { kind: "CONFIRMED", text: transcript, engine: dto.engine, language: dto.language },
              ...(dto.provisionalTranscript ? [{ kind: "PROVISIONAL" as const, text: dto.provisionalTranscript, engine: dto.engine, language: dto.language }] : []),
            ],
          },
        },
      });
      const next = all.find((q) => !q.answer && q.id !== sq.id);
      await tx.interviewSession.update({
        where: { id },
        data: {
          lastActivityAt: now,
          currentQuestionId: next?.questionId ?? null,
          // All questions confirmed → COMPLETED (awaiting explicit submission).
          ...(next ? {} : { status: "COMPLETED", completedAt: now }),
          progressEvents: { create: { type: "ANSWER_CONFIRMED", questionCode: sq.code } },
        },
      });
      return "created" as const;
    });
    if (outcome === "expired") throw new AppError("INTERVIEW_EXPIRED", "The completion window for this interview has closed.", HttpStatus.GONE);
    return { saved: true, idempotentReplay: outcome === "duplicate", progress: await this.progress(id, ctx.user) };
  }

  /** Submits a fully answered interview. Repeat calls return the same result without side effects. */
  async submit(id: string, ctx: RequestContext) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const s = await this.lockOwned(tx, id, ctx.user);
      if (s.status === "SUBMITTED") return "already" as const;
      if (await this.expireIfDue(tx, s)) return "expired" as const;
      const [total, answered] = await Promise.all([tx.interviewSessionQuestion.count({ where: { sessionId: id } }), tx.interviewAnswer.count({ where: { sessionId: id, confirmed: true } })]);
      if (answered < total) throw unprocessable("INTERVIEW_INCOMPLETE", `All ${total} questions must be answered before submitting (${answered} confirmed).`);
      if (s.status !== "COMPLETED" && s.status !== "IN_PROGRESS") throw conflict("INTERVIEW_NOT_ACTIVE", `This interview is ${s.status.toLowerCase()}.`);

      const now = new Date();
      await tx.interviewSession.update({
        where: { id },
        data: { status: "SUBMITTED", submittedAt: now, completedAt: s.completedAt ?? now, lastActivityAt: now, currentQuestionId: null, progressEvents: { create: { type: "SUBMITTED" } } },
      });
      const app = await tx.application.findUniqueOrThrow({ where: { id: s.applicationId } });
      if (app.status === "AI_INTERVIEW_IN_PROGRESS" || app.status === "AI_INTERVIEW_PENDING") {
        await this.setApplicationStatus(tx, app.id, app.status, "AI_INTERVIEW_COMPLETED", ctx.user.id, null);
        await this.setApplicationStatus(tx, app.id, "AI_INTERVIEW_COMPLETED", "RECRUITER_REVIEW_PENDING", null, "Awaiting recruiter review");
      }
      await tx.recruitmentEvent.create({ data: { applicationId: app.id, type: "INTERVIEW_SUBMITTED", actorUserId: ctx.user.id } });
      await tx.hrReview.upsert({ where: { interviewSessionId: id }, create: { applicationId: app.id, interviewSessionId: id }, update: {} });
      // Assessment generation is queued only as PENDING — no scores are produced in Phase 3.
      await tx.assessmentReport.upsert({ where: { sessionId_version: { sessionId: id, version: 1 } }, create: { sessionId: id, version: 1, status: "PENDING" }, update: {} });
      await this.notifications.notifyStaff(
        { type: "INTERVIEW_COMPLETED", title: "Interview submitted", message: `${s.candidateName} submitted their AI interview.`, entityType: "interview_session", entityId: id, dedupeKey: `interview-completed:${id}` },
        undefined,
        tx,
      );
      await this.audit.record({ actorUserId: ctx.user.id, action: "interview.submitted", entityType: "interview_session", entityId: id, summary: { answered }, requestId: ctx.requestId }, tx);
      return "submitted" as const;
    });
    if (outcome === "expired") throw new AppError("INTERVIEW_EXPIRED", "The completion window for this interview has closed.", HttpStatus.GONE);
    return { submitted: true, alreadySubmitted: outcome === "already", progress: await this.progress(id, ctx.user) };
  }

  /** HR cancels an interview that has not been submitted. */
  async cancel(id: string, ctx: RequestContext) {
    await this.load(id, ctx.user);
    await this.prisma.$transaction(async (tx) => {
      const [s] = await tx.$queryRaw<{ status: InterviewStatus }[]>`SELECT status FROM interview_sessions WHERE id = ${id}::uuid FOR UPDATE`;
      if (!s || !OPEN.includes(s.status)) throw conflict("INTERVIEW_NOT_ACTIVE", "Only an interview that has not been completed can be cancelled.");
      await tx.interviewSession.update({ where: { id }, data: { status: "CANCELLED", currentQuestionId: null, progressEvents: { create: { type: "CANCELLED" } } } });
      await this.audit.record({ actorUserId: ctx.user.id, action: "interview.cancelled", entityType: "interview_session", entityId: id, requestId: ctx.requestId }, tx);
    });
    return this.detail(id, ctx.user);
  }

  // ─────────────────────────── Internals ───────────────────────────

  private async load(id: string, user: AuthUser): Promise<SessionFull> {
    const s = await this.prisma.interviewSession.findUnique({ where: { id }, include: { ...sessionInclude, application: { select: { assignedRecruiterId: true } } } });
    if (!s) throw notFound("Interview");
    const owner = !!user.candidateId && s.candidateId === user.candidateId && hasPermission(user, PERMISSIONS.INTERVIEWS_TAKE);
    if (owner) return s;
    if (hasPermission(user, PERMISSIONS.INTERVIEWS_READ)) {
      const scope = this.scope.applicationWhere(user);
      if (scope.assignedRecruiterId && s.application.assignedRecruiterId !== scope.assignedRecruiterId) throw notFound("Interview");
      return s;
    }
    // Do not reveal whether another candidate's interview exists.
    throw notFound("Interview");
  }

  /** Locks the session row for the transaction and enforces candidate ownership. */
  private async lockOwned(tx: Tx, id: string, user: AuthUser) {
    if (!hasPermission(user, PERMISSIONS.INTERVIEWS_TAKE)) throw forbidden("Only the invited candidate can take this interview.");
    if (!user.candidateId) throw notFound("Interview");
    const rows = await tx.$queryRaw<{ id: string; status: InterviewStatus; candidate_id: string; application_id: string; expires_at: Date; completed_at: Date | null; full_name: string }[]>`
      SELECT s.id, s.status, s.candidate_id, s.application_id, s.expires_at, s.completed_at, c.full_name
      FROM interview_sessions s JOIN candidates c ON c.id = s.candidate_id
      WHERE s.id = ${id}::uuid FOR UPDATE OF s`;
    const s = rows[0];
    if (!s || s.candidate_id !== user.candidateId) throw notFound("Interview");
    return { id: s.id, status: s.status, applicationId: s.application_id, expiresAt: s.expires_at, completedAt: s.completed_at, candidateName: s.full_name };
  }

  private async expireIfDue(tx: Tx, s: { id: string; status: InterviewStatus; expiresAt: Date }) {
    if (!OPEN.includes(s.status) || s.expiresAt > new Date()) return false;
    await tx.interviewSession.update({ where: { id: s.id }, data: { status: "EXPIRED", progressEvents: { create: { type: "EXPIRED" } } } });
    return true;
  }

  private async setApplicationStatus(tx: Tx, applicationId: string, from: RecruitmentStatus, to: RecruitmentStatus, actorUserId: string | null, note: string | null) {
    await tx.application.update({ where: { id: applicationId }, data: { status: to, statusChangedAt: new Date() } });
    await tx.recruitmentEvent.create({ data: { applicationId, type: "STATUS_CHANGED", fromStatus: from, toStatus: to, actorUserId, note } });
  }

  private progressOf(s: SessionFull) {
    const answeredIds = new Set(s.answers.map((a) => a.sessionQuestionId));
    const next = s.questions.find((q) => !answeredIds.has(q.id));
    const remainingSeconds = OPEN.includes(s.status) ? Math.max(0, Math.floor((s.expiresAt.getTime() - Date.now()) / 1000)) : 0;
    return {
      interviewId: s.id,
      reference: interviewReference(s.id),
      applicationId: s.applicationId,
      status: s.status,
      candidateTrack: s.candidate.category,
      jobRole: s.jobRole,
      questionSetVersion: s.questionSetVersion.versionCode,
      totalQuestions: s.questions.length,
      completedQuestions: answeredIds.size,
      nextQuestion: next && s.status !== "SUBMITTED" ? { code: next.code, position: next.position, category: next.categorySnapshot, text: next.textSnapshot, responseSeconds: next.responseSeconds } : null,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
      expiresAt: s.expiresAt,
      remainingSeconds,
      lastActivityAt: s.lastActivityAt,
      confirmedAnswers: s.questions
        .map((q) => ({ q, a: s.answers.find((x) => x.sessionQuestionId === q.id) }))
        .filter((x) => x.a)
        .map(({ q, a }) => ({ questionCode: q.code, position: q.position, source: a!.source, confirmedAt: a!.confirmedAt })),
    };
  }
}
