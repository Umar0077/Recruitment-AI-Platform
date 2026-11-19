import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { PrismaService } from "../../database/prisma.service";
import { RequirePermissions } from "../../common/decorators";
import { PERMISSIONS } from "../../common/constants/permissions";
import { Ctx, type RequestContext } from "../../common/http";
import { conflict, notFound, unprocessable } from "../../common/errors";
import { AuditService } from "../audit/audit.module";

class DraftQuestionDto {
  @ApiProperty({ example: "FE-001" }) @IsString() @Matches(/^[A-Z]{2,5}-\d{3}$/) code!: string;
  @ApiProperty({ example: "FE Experience" }) @IsString() @MinLength(2) @MaxLength(80) category!: string;
  /** Stored exactly as provided — never rewritten. */
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(1000) text!: string;
  @ApiProperty({ minimum: 30, maximum: 300, example: 90 }) @IsInt() @Min(30) @Max(300) responseSeconds!: number;
}

class DraftVersionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) source?: string;
  @ApiProperty({ type: [DraftQuestionDto] })
  @ValidateNested({ each: true }) @Type(() => DraftQuestionDto) @ArrayMinSize(1) @ArrayMaxSize(20)
  questions!: DraftQuestionDto[];
}

const versionInclude = { questions: { orderBy: { position: "asc" as const } } };

@Injectable()
export class QuestionSetsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list() {
    return this.prisma.questionSet.findMany({
      orderBy: { code: "asc" },
      include: { activeVersion: { include: versionInclude }, versions: { select: { versionCode: true, version: true, status: true, publishedAt: true }, orderBy: { version: "desc" } } },
    });
  }

  async version(versionCode: string) {
    const v = await this.prisma.questionSetVersion.findUnique({ where: { versionCode }, include: { ...versionInclude, questionSet: true } });
    if (!v) throw notFound("Question set version");
    return v;
  }

  async createDraft(setCode: string, dto: DraftVersionDto, ctx: RequestContext) {
    this.assertUnique(dto);
    const set = await this.prisma.questionSet.findUnique({ where: { code: setCode }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!set) throw notFound("Question set");
    const next = (set.versions[0]?.version ?? 0) + 1;
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.questionSetVersion.create({
        data: {
          questionSetId: set.id,
          version: next,
          versionCode: `${set.code}-V${next}`,
          status: "DRAFT",
          source: dto.source,
          questions: { create: dto.questions.map((q, i) => ({ ...q, position: i + 1 })) },
        },
        include: versionInclude,
      });
      await this.audit.record({ actorUserId: ctx.user.id, action: "question_set.draft_created", entityType: "question_set_version", entityId: v.id, summary: { versionCode: v.versionCode, questions: dto.questions.length }, requestId: ctx.requestId }, tx);
      return v;
    });
  }

  async updateDraft(versionCode: string, dto: DraftVersionDto, ctx: RequestContext) {
    this.assertUnique(dto);
    const v = await this.prisma.questionSetVersion.findUnique({ where: { versionCode } });
    if (!v) throw notFound("Question set version");
    if (v.status !== "DRAFT") throw conflict("CONFLICT", "Published versions are immutable. Create a new draft instead.");
    return this.prisma.$transaction(async (tx) => {
      await tx.question.deleteMany({ where: { versionId: v.id } });
      const updated = await tx.questionSetVersion.update({
        where: { id: v.id },
        data: { source: dto.source, questions: { create: dto.questions.map((q, i) => ({ ...q, position: i + 1 })) } },
        include: versionInclude,
      });
      await this.audit.record({ actorUserId: ctx.user.id, action: "question_set.draft_updated", entityType: "question_set_version", entityId: v.id, summary: { versionCode }, requestId: ctx.requestId }, tx);
      return updated;
    });
  }

  /** Publishes a draft and makes it the active version. Existing interviews keep their original version. */
  async publish(versionCode: string, ctx: RequestContext) {
    const v = await this.prisma.questionSetVersion.findUnique({ where: { versionCode }, include: { questions: true, questionSet: true } });
    if (!v) throw notFound("Question set version");
    if (v.status !== "DRAFT") throw conflict("CONFLICT", `Version ${versionCode} is already ${v.status.toLowerCase()}.`);
    if (!v.questions.length) throw unprocessable("VALIDATION_FAILED", "A version needs at least one question.");
    return this.prisma.$transaction(async (tx) => {
      if (v.questionSet.activeVersionId) {
        await tx.questionSetVersion.update({ where: { id: v.questionSet.activeVersionId }, data: { status: "RETIRED" } });
      }
      const published = await tx.questionSetVersion.update({
        where: { id: v.id },
        data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: ctx.user.id },
        include: versionInclude,
      });
      await tx.questionSet.update({ where: { id: v.questionSetId }, data: { activeVersionId: v.id } });
      await this.audit.record({ actorUserId: ctx.user.id, action: "question_set.published", entityType: "question_set_version", entityId: v.id, summary: { versionCode, previousActiveVersionId: v.questionSet.activeVersionId }, requestId: ctx.requestId }, tx);
      return published;
    });
  }

  private assertUnique(dto: DraftVersionDto) {
    const codes = new Set(dto.questions.map((q) => q.code));
    if (codes.size !== dto.questions.length) throw unprocessable("VALIDATION_FAILED", "Question codes must be unique within a version.");
  }
}

@ApiTags("question-sets")
@ApiBearerAuth()
@Controller("question-sets")
class QuestionSetsController {
  constructor(private readonly svc: QuestionSetsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.QUESTION_SETS_READ)
  list() {
    return this.svc.list();
  }

  @Get("versions/:versionCode")
  @RequirePermissions(PERMISSIONS.QUESTION_SETS_READ)
  version(@Param("versionCode") code: string) {
    return this.svc.version(code);
  }

  @Post(":setCode/drafts")
  @RequirePermissions(PERMISSIONS.QUESTION_SETS_MANAGE)
  createDraft(@Param("setCode") setCode: string, @Body() dto: DraftVersionDto, @Ctx() ctx: RequestContext) {
    return this.svc.createDraft(setCode, dto, ctx);
  }

  @Put("versions/:versionCode")
  @RequirePermissions(PERMISSIONS.QUESTION_SETS_MANAGE)
  updateDraft(@Param("versionCode") code: string, @Body() dto: DraftVersionDto, @Ctx() ctx: RequestContext) {
    return this.svc.updateDraft(code, dto, ctx);
  }

  @Post("versions/:versionCode/publish")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.QUESTION_SETS_MANAGE)
  publish(@Param("versionCode") code: string, @Ctx() ctx: RequestContext) {
    return this.svc.publish(code, ctx);
  }
}

@ApiTags("job-roles")
@ApiBearerAuth()
@Controller("job-roles")
class JobRolesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Any signed-in user may read the job roles (titles, tracks) — no candidate data involved. */
  @Get()
  list() {
    return this.prisma.jobRole.findMany({
      where: { isActive: true },
      orderBy: { title: "asc" },
      select: { id: true, code: true, externalJobId: true, title: true, description: true, track: true, isActive: true, defaultQuestionSet: { select: { code: true, activeVersion: { select: { versionCode: true } } } } },
    });
  }
}

@Module({ controllers: [QuestionSetsController, JobRolesController], providers: [QuestionSetsService], exports: [QuestionSetsService] })
export class QuestionSetsModule {}
