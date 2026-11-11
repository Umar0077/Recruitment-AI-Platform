import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { CandidateTrack, HrReviewStatus, Prisma } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PrismaService } from "../../database/prisma.service";
import { RequirePermissions } from "../../common/decorators";
import { PERMISSIONS } from "../../common/constants/permissions";
import { ALLOWED_HR_TRANSITIONS, RECRUITMENT_STATUS_LABELS, RECRUITMENT_STATUS_ORDER } from "../../common/constants/recruitment";
import { Ctx, Paged, type RequestContext } from "../../common/http";
import { notFound } from "../../common/errors";
import { PageQueryDto, pageArgs, pageMeta } from "../../common/pagination";
import { AccessScope } from "../../common/access-scope";
import type { AuthUser } from "../../common/auth-user";
import { AuditService } from "../audit/audit.module";

const P = PERMISSIONS;
const toBool = ({ value }: { value: unknown }) => value === true || value === "true";

// ─────────────────────────── Recruitment pipeline ───────────────────────────

class PipelineQueryDto {
  @ApiPropertyOptional({ enum: CandidateTrack }) @IsOptional() @IsEnum(CandidateTrack) category?: CandidateTrack;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() jobRoleId?: string;
}

@ApiTags("recruitment")
@ApiBearerAuth()
@Controller("recruitment")
class RecruitmentController {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScope) {}

  /** Count of applications in each of the 18 official statuses, in official order. */
  @Get("pipeline")
  @RequirePermissions(P.APPLICATIONS_READ)
  async pipeline(@Query() q: PipelineQueryDto, @Ctx() { user }: RequestContext) {
    const where: Prisma.ApplicationWhereInput = { AND: [this.scope.applicationWhere(user), { jobRoleId: q.jobRoleId }, q.category ? { candidate: { category: q.category } } : {}] };
    const grouped = await this.prisma.application.groupBy({ by: ["status"], where, _count: { _all: true } });
    const counts = new Map(grouped.map((g) => [g.status, g._count._all]));
    const stages = RECRUITMENT_STATUS_ORDER.map((status, i) => ({ status, label: RECRUITMENT_STATUS_LABELS[status], position: i + 1, count: counts.get(status) ?? 0 }));
    return { total: stages.reduce((n, s) => n + s.count, 0), stages };
  }

  /** Status catalogue with the transitions HR may make manually. */
  @Get("statuses")
  statuses() {
    return RECRUITMENT_STATUS_ORDER.map((status) => ({ status, label: RECRUITMENT_STATUS_LABELS[status], allowedTransitions: ALLOWED_HR_TRANSITIONS[status] }));
  }
}

// ─────────────────────────── HR reviews ───────────────────────────

class ReviewQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: HrReviewStatus }) @IsOptional() @IsEnum(HrReviewStatus) status?: HrReviewStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() mine?: boolean;
}

class UpdateReviewDto {
  @ApiProperty({ enum: HrReviewStatus }) @IsEnum(HrReviewStatus) status!: HrReviewStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) remarks?: string;
}

@Injectable()
class HrReviewsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scope: AccessScope) {}

  async list(q: ReviewQueryDto, user: AuthUser) {
    const where: Prisma.HrReviewWhereInput = { status: q.status, application: this.scope.applicationWhere(user), ...(q.mine ? { reviewerId: user.id } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hrReview.findMany({
        where,
        orderBy: { createdAt: q.sortDir },
        ...pageArgs(q),
        include: {
          application: { select: { id: true, status: true, candidate: { select: { id: true, fullName: true, category: true, isSample: true } }, jobRole: { select: { title: true } } } },
          interviewSession: { select: { id: true, submittedAt: true } },
          reviewer: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.hrReview.count({ where }),
    ]);
    return new Paged(rows, pageMeta(q, total));
  }

  async get(id: string, user: AuthUser) {
    const r = await this.prisma.hrReview.findFirst({
      where: { id, application: this.scope.applicationWhere(user) },
      include: { application: { include: { candidate: true, jobRole: true } }, reviewer: { select: { id: true, displayName: true } }, interviewSession: { select: { id: true, status: true, submittedAt: true } } },
    });
    if (!r) throw notFound("HR review");
    return r;
  }

  /** Human review state. Does not change the recruitment status — that is an explicit, separate HR action. */
  async update(id: string, dto: UpdateReviewDto, ctx: RequestContext) {
    const before = await this.get(id, ctx.user);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.hrReview.update({
        where: { id },
        data: { status: dto.status, remarks: dto.remarks, reviewerId: ctx.user.id, reviewedAt: dto.status === "REVIEWED" ? new Date() : null },
      });
      await tx.recruitmentEvent.create({ data: { applicationId: before.applicationId, type: "HR_REVIEW_UPDATED", actorUserId: ctx.user.id, note: dto.status } });
      await this.audit.record({ actorUserId: ctx.user.id, action: "hr_review.updated", entityType: "hr_review", entityId: id, summary: { from: before.status, to: dto.status }, requestId: ctx.requestId }, tx);
      return r;
    });
  }
}

@ApiTags("hr-reviews")
@ApiBearerAuth()
@Controller("hr-reviews")
class HrReviewsController {
  constructor(private readonly svc: HrReviewsService) {}

  @Get()
  @RequirePermissions(P.INTERVIEWS_REVIEW)
  list(@Query() q: ReviewQueryDto, @Ctx() { user }: RequestContext) {
    return this.svc.list(q, user);
  }

  @Get(":id")
  @RequirePermissions(P.INTERVIEWS_REVIEW)
  get(@Param("id", ParseUUIDPipe) id: string, @Ctx() { user }: RequestContext) {
    return this.svc.get(id, user);
  }

  @Patch(":id")
  @RequirePermissions(P.INTERVIEWS_REVIEW)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateReviewDto, @Ctx() ctx: RequestContext) {
    return this.svc.update(id, dto, ctx);
  }
}

// ─────────────────────────── Assessments ───────────────────────────

class AssessmentQueryDto {
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() interviewId?: string;
}

const NOT_GENERATED = "Automated assessment is not enabled. No scores are generated from transcripts in this phase; HR reviews the confirmed answers directly.";

@ApiTags("assessments")
@ApiBearerAuth()
@Controller("assessments")
class AssessmentsController {
  constructor(private readonly prisma: PrismaService, private readonly scope: AccessScope) {}

  @Get()
  @RequirePermissions(P.ASSESSMENTS_READ)
  async list(@Query() q: AssessmentQueryDto, @Ctx() { user }: RequestContext) {
    const rows = await this.prisma.assessmentReport.findMany({
      where: { sessionId: q.interviewId, session: { application: this.scope.applicationWhere(user) } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, sessionId: true, version: true, status: true, isSample: true, generatedAt: true, createdAt: true },
    });
    return { notice: NOT_GENERATED, reports: rows };
  }

  @Get(":id")
  @RequirePermissions(P.ASSESSMENTS_READ)
  async get(@Param("id", ParseUUIDPipe) id: string, @Ctx() { user }: RequestContext) {
    const r = await this.prisma.assessmentReport.findFirst({
      where: { id, session: { application: this.scope.applicationWhere(user) } },
      include: { criteria: { orderBy: { position: "asc" } }, observations: true },
    });
    if (!r) throw notFound("Assessment");
    return { ...r, notice: r.status === "COMPLETED" ? null : NOT_GENERATED };
  }
}

@Module({ controllers: [RecruitmentController, HrReviewsController, AssessmentsController], providers: [HrReviewsService] })
export class RecruitmentModule {}
