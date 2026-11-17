import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvironmentVariables } from "../../config/env.validation";
import { analyze } from "./nlp";
import { FINDINGS_SCHEMA, PROMPT_VERSION, RUBRIC_SCHEMA, SYSTEM_PROMPT, validateFindings, validateSchema, type Rubric } from "./contracts";
import { OpenRouterService, ProviderFailure } from "./openrouter.service";
export const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** AssessmentReport is the durable job/outbox. BullMQ periodically drains it; local mode uses the same worker. */
@Injectable()
export class AssessmentService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly db: PrismaService, private readonly provider: OpenRouterService, private readonly config: ConfigService<EnvironmentVariables, true>) {}
  onApplicationBootstrap() {
    if (this.config.get("JOBS_IN_PROCESS", { infer: true }) && this.config.get("NODE_ENV", { infer: true }) !== "test") {
      this.timer = setInterval(() => { void this.runOnce().catch(() => undefined); }, 15000);
      this.timer.unref();
    }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async runOnce() {
    if (this.running || !this.config.get("AI_ASSESSMENT_ENABLED", { infer: true })) return;
    this.running = true;
    try {
      // A lost worker never leaves an assessment labelled as successfully generated.
      await this.db.assessmentReport.updateMany({ where: { status: "PROCESSING", processingAt: { lt: new Date(Date.now() - 300000) } }, data: { status: "FAILED", phase: "FAILED", failureReason: "WORKER_INTERRUPTED", processingAt: null } });
      const report = await this.db.$transaction(async tx => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT r.id FROM assessment_reports r JOIN interview_sessions s ON s.id = r.session_id WHERE r.status = 'PENDING' AND s.status = 'SUBMITTED' AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= NOW()) ORDER BY r.created_at FOR UPDATE OF r SKIP LOCKED LIMIT 1`;
        if (!rows[0]) return null;
        return tx.assessmentReport.update({ where: { id: rows[0].id }, data: { status: "PROCESSING", phase: "NLP_PROCESSING", processingAt: new Date() } });
      });
      if (report) await this.process(report.id);
    } finally { this.running = false; }
  }
  async process(id: string) {
    try {
      const report = await this.db.assessmentReport.findUniqueOrThrow({ where: { id }, include: { session: { include: { questions: { orderBy: { position: "asc" } }, answers: true, questionSetVersion: true, jobRole: true } } } });
      if (report.status !== "PROCESSING" || report.session.status !== "SUBMITTED") return;
      const s = report.session;
      if (!s.questions.length || s.questions.length > 4 || s.answers.filter(a => a.confirmed).length !== s.questions.length) throw new ProviderFailure("INVALID_CONFIRMED_ANSWERS");
      let snapshot = report.rubricSnapshot as { questionId: string; rubricId: string; version: number; content: Rubric }[] | null;
      if (!snapshot) {
        const approved = await this.db.referenceRubricVersion.findMany({ where: { questionId: { in: s.questions.map(q => q.questionId) }, status: "APPROVED" }, orderBy: { version: "desc" } });
        snapshot = [];
        for (const q of s.questions) {
          const rubric = approved.find(r => r.questionId === q.questionId);
          if (!rubric) { await this.pending(id, "WAITING_FOR_APPROVED_RUBRIC", new Date(Date.now() + 60000)); return; }
          validateSchema(rubric.content, RUBRIC_SCHEMA);
          snapshot.push({ questionId: q.code, rubricId: rubric.id, version: rubric.version, content: rubric.content as unknown as Rubric });
        }
      }
      const input = s.questions.map(q => {
        const a = s.answers.find(a => a.sessionQuestionId === q.id && a.confirmed);
        const rubric = snapshot!.find(r => r.questionId === q.code);
        if (!a || !rubric) throw new ProviderFailure("INVALID_CONFIRMED_ANSWERS");
        // Only candidate-reviewed confirmed text is assessed. Original/cleanup variants stay separate.
        return { questionId: q.code, question: q.textSnapshot, category: q.categorySnapshot, answer: a.transcript, answerId: a.id, rubric, nlp: analyze(q.code, a.transcript, rubric.content.exampleAnswer, rubric.content.expectedConcepts) };
      });
      await this.db.assessmentReport.update({ where: { id }, data: { nlp: json(input.map(i => ({ ...i.nlp, answerId: i.answerId }))), rubricSnapshot: json(snapshot), promptVersion: PROMPT_VERSION } });
      // isSample is not proof that free text is synthetic. Persisted interviews always require production approval.
      if (!this.provider.allowed(false)) { await this.pending(id, "WAITING_FOR_APPROVED_PROVIDER", new Date(Date.now() + 300000)); return; }
      const attempts = await this.db.lLMRequestUsage.count({ where: { reportId: id } });
      if (attempts > this.config.get("AI_MAX_RETRIES", { infer: true })) throw new ProviderFailure("RETRY_EXHAUSTED");
      await this.db.assessmentReport.update({ where: { id }, data: { phase: "LLM_PROCESSING" } });
      const raw = await this.provider.request({ system: SYSTEM_PROMPT, input: { track: s.jobRole.track, questionSetVersion: s.questionSetVersion.versionCode, questions: input.map(({ answerId: _answerId, ...q }) => q) }, schema: FINDINGS_SCHEMA, synthetic: false, purpose: "assessment", reportId: id, attempt: attempts, validate: v => validateFindings(v, input) });
      const findings = validateFindings(raw, input);
      await this.db.$transaction(async tx => {
        await tx.assessmentReport.update({ where: { id }, data: { status: "COMPLETED", phase: "HUMAN_REVIEW_REQUIRED", findings: json(findings), provider: "OpenRouter", model: this.provider.settings.OPENROUTER_MODEL, generatedAt: new Date(), failureReason: null, processingAt: null, nextAttemptAt: null, summary: "Evidence-based observations require human review. Factual claims are not independently verified." } });
        await tx.assessmentObservation.createMany({ data: findings.questions.flatMap(q => [...q.strengths.map(o => ({ reportId: id, questionCode: q.questionId, kind: "STRENGTH" as const, text: o.observation })), ...q.reviewPoints.map(o => ({ reportId: id, questionCode: q.questionId, kind: "REVIEW_AREA" as const, text: o.observation }))]) });
      });
    } catch (error) {
      const failure = error instanceof ProviderFailure ? error : new ProviderFailure("ANALYSIS_FAILED");
      const attempts = await this.db.lLMRequestUsage.count({ where: { reportId: id } });
      if (failure.retryAt && (failure.code === "WAITING_FOR_CAPACITY" || attempts <= this.config.get("AI_MAX_RETRIES", { infer: true }))) await this.pending(id, failure.code, failure.retryAt);
      else await this.db.assessmentReport.update({ where: { id }, data: { status: "FAILED", phase: "FAILED", failureReason: failure.code, processingAt: null } });
    }
  }
  private pending(id: string, phase: string, nextAttemptAt: Date) {
    return this.db.assessmentReport.update({ where: { id }, data: { status: "PENDING", phase, nextAttemptAt, processingAt: null, failureReason: phase } });
  }
}
