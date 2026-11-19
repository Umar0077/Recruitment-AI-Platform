import { BadRequestException, Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Put, NotFoundException } from "@nestjs/common";
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { RequirePermissions } from "../../common/decorators";
import { PERMISSIONS as P } from "../../common/constants/permissions";
import { Ctx, type RequestContext } from "../../common/http";
import { AccessScope } from "../../common/access-scope";
import { PrismaService } from "../../database/prisma.service";
import { AssessmentService, json } from "./assessment.service";
import { OpenRouterService } from "./openrouter.service";
import { RELEVANCE, RUBRIC_SCHEMA, validateSchema } from "./contracts";
import { draftFor } from "./drafts";
import { ApiUsageController } from "./api-usage.controller";
import { ApiUsageService } from "./api-usage.service";
import { ProviderMetadataService } from "./provider-metadata.service";
class DraftDto { @IsObject() content!: object }
class CorrectionDto {
  @IsOptional() @IsString() @MaxLength(20) questionCode?: string;
  @IsOptional() @IsIn(RELEVANCE) relevance?: string;
  @IsString() @MaxLength(4000) note!: string;
  @IsBoolean() reviewed!: boolean;
}
@Controller("ai")
export class AssessmentAdminController {
  constructor(private readonly db: PrismaService, private readonly provider: OpenRouterService, private readonly scope: AccessScope) {}
  @Get("usage") @RequirePermissions(P.USERS_MANAGE)
  usage() { return this.provider.usage(); }
  @Get("rubrics") @RequirePermissions(P.QUESTION_SETS_MANAGE)
  rubrics() { return this.db.question.findMany({ where: { version: { status: "PUBLISHED" } }, include: { version: true, rubrics: { orderBy: { version: "desc" } } }, orderBy: [{ versionId: "asc" }, { position: "asc" }] }); }
  @Post("rubrics/prepare") @RequirePermissions(P.QUESTION_SETS_MANAGE)
  async prepare(@Ctx() ctx: RequestContext) {
    const questions = await this.db.question.findMany({ where: { version: { status: "PUBLISHED" } } });
    for (const q of questions) {
      const content = draftFor(q.code);
      if (content) await this.db.referenceRubricVersion.upsert({ where: { questionId_version: { questionId: q.id, version: 1 } }, create: { questionId: q.id, version: 1, content: json(content) }, update: {} });
    }
    await this.db.auditLog.create({ data: { actorUserId: ctx.user.id, action: "rubrics.prepared", entityType: "rubric", entityId: "initial-drafts" } });
    return { prepared: true, approved: false };
  }
  @Post("rubrics/:questionId/generate") @RequirePermissions(P.QUESTION_SETS_MANAGE)
  async generate(@Param("questionId", ParseUUIDPipe) questionId: string, @Ctx() ctx: RequestContext) {
    const question = await this.db.question.findUniqueOrThrow({ where: { id: questionId }, include: { version: { include: { questionSet: true } } } });
    const content = await this.provider.request({ synthetic: true, purpose: "rubric_draft", system: "Prepare a fictional example answer and HR review rubric for the official question. No candidate data is provided. Alternatives are valid. Never modify the question, make hiring decisions, or claim facts are verified. Return the strict schema.", input: { question: question.text, role: question.version.questionSet.track, startingConcepts: draftFor(question.code) }, schema: RUBRIC_SCHEMA, validate: v => validateSchema(v, RUBRIC_SCHEMA) });
    return this.newDraft(questionId, content as object, ctx);
  }
  @Post("rubrics/:questionId/drafts") @RequirePermissions(P.QUESTION_SETS_MANAGE)
  newDraftRoute(@Param("questionId", ParseUUIDPipe) questionId: string, @Body() dto: DraftDto, @Ctx() ctx: RequestContext) { return this.newDraft(questionId, dto.content, ctx); }
  private async newDraft(questionId: string, content: object, ctx: RequestContext) {
    this.checkRubric(content);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM questions WHERE id = ${questionId}::uuid FOR UPDATE`;
      const last = await tx.referenceRubricVersion.findFirst({ where: { questionId }, orderBy: { version: "desc" } });
      const r = await tx.referenceRubricVersion.create({ data: { questionId, version: (last?.version ?? 0) + 1, content: json(content) } });
      await tx.auditLog.create({ data: { actorUserId: ctx.user.id, action: "rubric.draft_created", entityType: "rubric", entityId: r.id } });
      return r;
    });
  }
  @Put("rubrics/:id") @RequirePermissions(P.QUESTION_SETS_MANAGE)
  async edit(@Param("id", ParseUUIDPipe) id: string, @Body() dto: DraftDto, @Ctx() ctx: RequestContext) {
    this.checkRubric(dto.content);
    return this.db.$transaction(async tx => {
      const changed = await tx.referenceRubricVersion.updateMany({ where: { id, status: "DRAFT" }, data: { content: json(dto.content) } });
      if (!changed.count) throw new BadRequestException("Only draft rubrics can be edited");
      await tx.auditLog.create({ data: { actorUserId: ctx.user.id, action: "rubric.edited", entityType: "rubric", entityId: id } });
      return { saved: true };
    });
  }
  @Post("rubrics/:id/approve") @RequirePermissions(P.QUESTION_SETS_MANAGE)
  async approve(@Param("id", ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.db.$transaction(async tx => {
      const r = await tx.referenceRubricVersion.findUniqueOrThrow({ where: { id } });
      this.checkRubric(r.content);
      const changed = await tx.referenceRubricVersion.updateMany({ where: { id, status: "DRAFT" }, data: { status: "APPROVED", approvedById: ctx.user.id, approvedAt: new Date() } });
      if (!changed.count) throw new BadRequestException("Rubric already approved");
      await tx.auditLog.create({ data: { actorUserId: ctx.user.id, action: "rubric.approved", entityType: "rubric", entityId: id } });
      return { approved: true };
    });
  }
  @Post("reports/:id/reassess") @RequirePermissions(P.INTERVIEWS_REVIEW)
  async reassess(@Param("id", ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    const r = await this.visible(id, ctx);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM interview_sessions WHERE id = ${r.sessionId}::uuid FOR UPDATE`;
      const last = await tx.assessmentReport.findFirstOrThrow({ where: { sessionId: r.sessionId }, orderBy: { version: "desc" } });
      if (["PENDING", "PROCESSING"].includes(last.status)) return last;
      const created = await tx.assessmentReport.create({ data: { sessionId: r.sessionId, version: last.version + 1 } });
      await tx.auditLog.create({ data: { actorUserId: ctx.user.id, action: "assessment.reassessment", entityType: "assessment", entityId: created.id, summary: { previous: last.id } } });
      return created;
    });
  }
  @Post("reports/:id/corrections") @RequirePermissions(P.INTERVIEWS_REVIEW)
  async correct(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CorrectionDto, @Ctx() ctx: RequestContext) {
    const report = await this.visible(id, ctx);
    if (!dto.note.trim()) throw new BadRequestException("A review note is required");
    if (dto.relevance && !dto.questionCode) throw new BadRequestException("A question is required for a relevance correction");
    if (dto.questionCode && !await this.db.interviewSessionQuestion.count({ where: { sessionId: report.sessionId, code: dto.questionCode } })) throw new BadRequestException("Unknown question");
    return this.db.$transaction(async tx => {
      const correction = await tx.assessmentCorrection.create({ data: { reportId: id, actorUserId: ctx.user.id, ...dto } });
      await tx.auditLog.create({ data: { actorUserId: ctx.user.id, action: "assessment.reviewed", entityType: "assessment", entityId: id, summary: { correctionId: correction.id } } });
      if (dto.reviewed) await tx.hrReview.updateMany({ where: { interviewSessionId: report.sessionId }, data: { status: "REVIEWED", reviewedAt: new Date(), reviewerId: ctx.user.id } });
      if (dto.reviewed && report.status === "COMPLETED") await tx.assessmentReport.update({ where: { id }, data: { phase: "COMPLETED" } });
      return correction;
    });
  }
  private async visible(id: string, ctx: RequestContext) {
    const r = await this.db.assessmentReport.findFirst({ where: { id, session: { application: this.scope.applicationWhere(ctx.user) } } });
    if (!r) throw new NotFoundException();
    return r;
  }
  private checkRubric(value: unknown) { try { validateSchema(value, RUBRIC_SCHEMA); } catch { throw new BadRequestException("Invalid rubric content"); } }
}
@Module({ providers: [OpenRouterService, AssessmentService], exports: [OpenRouterService, AssessmentService] })
export class AssessmentWorkerModule {}
@Module({ imports: [AssessmentWorkerModule], controllers: [AssessmentAdminController, ApiUsageController], providers: [ApiUsageService, ProviderMetadataService] })
export class AssessmentModule {}
