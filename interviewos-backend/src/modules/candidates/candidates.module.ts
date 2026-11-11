import { Body, Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { CandidateTrack, InterviewStatus, Prisma, RecruitmentStatus } from "@prisma/client";
import { IsDateString, IsEmail, IsEnum, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from "class-validator";
import { PrismaService } from "../../database/prisma.service";
import { RequirePermissions } from "../../common/decorators";
import { PERMISSIONS } from "../../common/constants/permissions";
import { RECRUITMENT_STATUS_LABELS, isAllowedHrTransition, ALLOWED_HR_TRANSITIONS } from "../../common/constants/recruitment";
import { Ctx, Paged, type RequestContext } from "../../common/http";
import { conflict, notFound, unprocessable } from "../../common/errors";
import { PageQueryDto, pageArgs, pageMeta } from "../../common/pagination";
import { AccessScope } from "../../common/access-scope";
import type { AuthUser } from "../../common/auth-user";
import { AuditService } from "../audit/audit.module";
import { interviewReference } from "../interviews/interviews.service";
import { NotificationsService } from "../notifications/notifications.module";

const P = PERMISSIONS;

/** Candidate-facing stage. Everything after the AI interview reads "Under Recruiter Review" until HR communicates a result. */
export function candidateStage(status: RecruitmentStatus): { key: string; label: string } {
  switch (status) {
    case "APPLICATION_RECEIVED": return { key: "application_received", label: "Application Received" };
    case "AI_INTERVIEW_PENDING": return { key: "ai_interview_pending", label: "AI Interview Pending" };
    case "AI_INTERVIEW_IN_PROGRESS": return { key: "ai_interview_in_progress", label: "AI Interview In Progress" };
    case "AI_INTERVIEW_COMPLETED": return { key: "ai_interview_completed", label: "AI Interview Completed" };
    case "CANDIDATE_WITHDRAWN": return { key: "withdrawn", label: "Withdrawn" };
    default: return { key: "under_review", label: "Under Recruiter Review" };
  }
}
const MAX_JSON_KEYS = 50;
const smallObject = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length <= MAX_JSON_KEYS && JSON.stringify(v).length <= 10_000;

// ─────────────────────────── DTOs ───────────────────────────

class CreateCandidateDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiProperty({ enum: CandidateTrack }) @IsEnum(CandidateTrack) category!: CandidateTrack;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) location?: string;
  @ApiProperty({ format: "uuid", description: "Job role the candidate applied for" }) @IsUUID() jobRoleId!: string;
  @ApiPropertyOptional({ format: "date-time" }) @IsOptional() @IsDateString() submittedAt?: string;
  @ApiPropertyOptional({ description: "Track-specific application answers" }) @IsOptional() @IsObject() details?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsObject() availability?: Record<string, unknown>;
}

class UpdateCandidateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) location?: string;
}

const CANDIDATE_SORT = ["createdAt", "fullName"] as const;
class CandidateQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: CandidateTrack }) @IsOptional() @IsEnum(CandidateTrack) category?: CandidateTrack;
  @ApiPropertyOptional({ enum: CANDIDATE_SORT }) @IsOptional() @IsIn(CANDIDATE_SORT) sortBy: (typeof CANDIDATE_SORT)[number] = "createdAt";
}

const APPLICATION_SORT = ["submittedAt", "statusChangedAt", "createdAt"] as const;
class ApplicationQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: RecruitmentStatus }) @IsOptional() @IsEnum(RecruitmentStatus) status?: RecruitmentStatus;
  @ApiPropertyOptional({ enum: CandidateTrack }) @IsOptional() @IsEnum(CandidateTrack) category?: CandidateTrack;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() jobRoleId?: string;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() assignedRecruiterId?: string;
  @ApiPropertyOptional({ enum: InterviewStatus, description: "Applications whose latest-issued interview has this status" }) @IsOptional() @IsEnum(InterviewStatus) interviewStatus?: InterviewStatus;
  @ApiPropertyOptional({ format: "date-time", description: "Submitted on/after" }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ format: "date-time", description: "Submitted on/before" }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: APPLICATION_SORT }) @IsOptional() @IsIn(APPLICATION_SORT) sortBy: (typeof APPLICATION_SORT)[number] = "submittedAt";
}

class UpdateStatusDto {
  @ApiProperty({ enum: RecruitmentStatus }) @IsEnum(RecruitmentStatus) status!: RecruitmentStatus;
  @ApiPropertyOptional({ description: "Short reason stored on the timeline" }) @IsOptional() @IsString() @MaxLength(500) note?: string;
  @ApiPropertyOptional({ description: "Optional HR remark saved with the change" }) @IsOptional() @IsString() @MinLength(1) @MaxLength(4000) remark?: string;
}

class RemarkDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) body!: string;
}

class AssignDto {
  @ApiProperty({ format: "uuid", nullable: true }) @ValidateIf((_, v) => v !== null) @IsUUID() recruiterId!: string | null;
}

// ─────────────────────────── Service ───────────────────────────

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly scope: AccessScope,
  ) {}

  async listCandidates(q: CandidateQueryDto, user: AuthUser) {
    const scoped = this.scope.applicationWhere(user);
    const where: Prisma.CandidateWhereInput = {
      category: q.category,
      ...(Object.keys(scoped).length ? { applications: { some: scoped } } : {}),
      ...(q.search ? { OR: [{ fullName: { contains: q.search, mode: "insensitive" } }, { email: { contains: q.search, mode: "insensitive" } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.candidate.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortDir },
        ...pageArgs(q),
        select: { id: true, fullName: true, email: true, phone: true, category: true, location: true, isSample: true, createdAt: true, applications: { select: { id: true, status: true, jobRole: { select: { title: true } } }, orderBy: { submittedAt: "desc" }, take: 3 } },
      }),
      this.prisma.candidate.count({ where }),
    ]);
    return new Paged(rows, pageMeta(q, total));
  }

  async getCandidate(id: string, user: AuthUser) {
    const c = await this.prisma.candidate.findFirst({
      where: { id, ...this.candidateScope(user) },
      include: { applications: { where: this.scope.applicationWhere(user), include: { jobRole: { select: { id: true, title: true, track: true } } }, orderBy: { submittedAt: "desc" } } },
    });
    if (!c) throw notFound("Candidate");
    return c;
  }

  /** Staff-only manual entry. Public submissions arrive through the authenticated Careers integration. */
  async createCandidate(dto: CreateCandidateDto, ctx: RequestContext) {
    if ((dto.details && !smallObject(dto.details)) || (dto.availability && !smallObject(dto.availability))) {
      throw unprocessable("VALIDATION_FAILED", "details/availability must be small flat objects.");
    }
    const role = await this.prisma.jobRole.findUnique({ where: { id: dto.jobRoleId } });
    if (!role || !role.isActive) throw notFound("Job role");
    if (role.track !== dto.category) throw unprocessable("VALIDATION_FAILED", "The candidate category does not match the job role's track.");
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.create({ data: { fullName: dto.fullName.trim(), email: dto.email?.toLowerCase(), phone: dto.phone, category: dto.category, location: dto.location } });
      const application = await tx.application.create({
        data: {
          candidateId: candidate.id,
          jobRoleId: role.id,
          source: "MANUAL",
          submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : new Date(),
          details: (dto.details ?? {}) as Prisma.InputJsonValue,
          availability: (dto.availability ?? {}) as Prisma.InputJsonValue,
          events: { create: { type: "APPLICATION_RECEIVED", toStatus: "APPLICATION_RECEIVED", actorUserId: ctx.user.id } },
        },
      });
      await this.audit.record({ actorUserId: ctx.user.id, action: "candidate.created", entityType: "candidate", entityId: candidate.id, summary: { applicationId: application.id, jobRoleId: role.id, source: "MANUAL" }, requestId: ctx.requestId }, tx);
      return { ...candidate, applications: [application] };
    });
  }

  async updateCandidate(id: string, dto: UpdateCandidateDto, ctx: RequestContext) {
    await this.getCandidate(id, ctx.user);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.candidate.update({ where: { id }, data: { ...dto, email: dto.email?.toLowerCase() } });
      await this.audit.record({ actorUserId: ctx.user.id, action: "candidate.updated", entityType: "candidate", entityId: id, summary: { fields: Object.keys(dto) }, requestId: ctx.requestId }, tx);
      return c;
    });
  }

  async listApplications(q: ApplicationQueryDto, user: AuthUser) {
    const where: Prisma.ApplicationWhereInput = {
      AND: [
        this.scope.applicationWhere(user),
        { status: q.status, jobRoleId: q.jobRoleId, assignedRecruiterId: q.assignedRecruiterId },
        q.category ? { candidate: { category: q.category } } : {},
        q.interviewStatus ? { interviews: { some: { status: q.interviewStatus } } } : {},
        q.from || q.to ? { submittedAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } } : {},
        q.search ? { candidate: { OR: [{ fullName: { contains: q.search, mode: "insensitive" } }, { email: { contains: q.search, mode: "insensitive" } }] } } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortDir },
        ...pageArgs(q),
        include: {
          candidate: { select: { id: true, fullName: true, email: true, category: true, location: true, isSample: true } },
          jobRole: { select: { id: true, title: true, track: true } },
          assignedRecruiter: { select: { id: true, displayName: true } },
          interviews: { select: { id: true, status: true, submittedAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      }),
      this.prisma.application.count({ where }),
    ]);
    return new Paged(rows.map((r) => ({ ...r, statusLabel: RECRUITMENT_STATUS_LABELS[r.status] })), pageMeta(q, total));
  }

  async getApplication(id: string, user: AuthUser) {
    const a = await this.prisma.application.findFirst({
      where: { id, ...this.scope.applicationWhere(user) },
      include: {
        candidate: true,
        jobRole: true,
        assignedRecruiter: { select: { id: true, displayName: true, email: true } },
        interviews: { select: { id: true, status: true, invitedAt: true, startedAt: true, submittedAt: true, expiresAt: true }, orderBy: { createdAt: "desc" } },
        reviews: { select: { id: true, status: true, reviewedAt: true, interviewSessionId: true } },
      },
    });
    if (!a) throw notFound("Application");
    return { ...a, statusLabel: RECRUITMENT_STATUS_LABELS[a.status], allowedTransitions: ALLOWED_HR_TRANSITIONS[a.status] };
  }

  async timeline(id: string, user: AuthUser) {
    await this.getApplication(id, user);
    const [events, remarks] = await Promise.all([
      this.prisma.recruitmentEvent.findMany({ where: { applicationId: id }, orderBy: { createdAt: "asc" }, include: { actor: { select: { id: true, displayName: true, email: true } } } }),
      this.prisma.hrRemark.findMany({ where: { applicationId: id }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, displayName: true, email: true } } } }),
    ]);
    return { events, remarks };
  }

  /** Manual HR status change: validated against the allowed transitions, locked, audited, timelined. */
  async updateStatus(id: string, dto: UpdateStatusDto, ctx: RequestContext) {
    await this.getApplication(id, ctx.user);
    const updated = await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ status: RecruitmentStatus }[]>`SELECT status FROM applications WHERE id = ${id}::uuid FOR UPDATE`;
      if (!row) throw notFound("Application");
      const from = row.status;
      if (from === dto.status) throw conflict("INVALID_STATUS_TRANSITION", `The application is already "${RECRUITMENT_STATUS_LABELS[from]}".`);
      if (!isAllowedHrTransition(from, dto.status)) {
        throw conflict("INVALID_STATUS_TRANSITION", `Cannot move from "${RECRUITMENT_STATUS_LABELS[from]}" to "${RECRUITMENT_STATUS_LABELS[dto.status]}".`);
      }
      const app = await tx.application.update({ where: { id }, data: { status: dto.status, statusChangedAt: new Date() }, include: { candidate: { select: { fullName: true } } } });
      await tx.recruitmentEvent.create({ data: { applicationId: id, type: "STATUS_CHANGED", fromStatus: from, toStatus: dto.status, actorUserId: ctx.user.id, note: dto.note } });
      if (dto.remark) {
        await tx.hrRemark.create({ data: { applicationId: id, authorId: ctx.user.id, body: dto.remark } });
        await tx.recruitmentEvent.create({ data: { applicationId: id, type: "HR_REMARK_ADDED", actorUserId: ctx.user.id } });
      }
      if (dto.status === "SHORTLISTED") {
        await this.notifications.notifyStaff(
          { type: "CANDIDATE_SHORTLISTED", title: "Candidate shortlisted", message: `${app.candidate.fullName} was shortlisted.`, entityType: "application", entityId: id, dedupeKey: `shortlisted:${id}:${Date.now()}` },
          undefined,
          tx,
        );
      }
      await this.audit.record({ actorUserId: ctx.user.id, action: "application.status_changed", entityType: "application", entityId: id, summary: { from, to: dto.status, remarkAdded: !!dto.remark }, requestId: ctx.requestId }, tx);
      return app;
    });
    return { id: updated.id, status: updated.status, statusLabel: RECRUITMENT_STATUS_LABELS[updated.status], statusChangedAt: updated.statusChangedAt, allowedTransitions: ALLOWED_HR_TRANSITIONS[updated.status] };
  }

  async addRemark(id: string, dto: RemarkDto, ctx: RequestContext) {
    await this.getApplication(id, ctx.user);
    return this.prisma.$transaction(async (tx) => {
      const remark = await tx.hrRemark.create({ data: { applicationId: id, authorId: ctx.user.id, body: dto.body.trim() }, include: { author: { select: { id: true, displayName: true } } } });
      await tx.recruitmentEvent.create({ data: { applicationId: id, type: "HR_REMARK_ADDED", actorUserId: ctx.user.id } });
      await this.audit.record({ actorUserId: ctx.user.id, action: "application.remark_added", entityType: "application", entityId: id, summary: { remarkId: remark.id }, requestId: ctx.requestId }, tx);
      return remark;
    });
  }

  async assign(id: string, dto: AssignDto, ctx: RequestContext) {
    await this.getApplication(id, ctx.user);
    if (dto.recruiterId) {
      const staff = await this.prisma.user.findFirst({ where: { id: dto.recruiterId, status: "ACTIVE", roles: { some: { role: { code: { in: ["RECRUITER", "HR_MANAGER", "SUPER_ADMIN"] } } } } } });
      if (!staff) throw unprocessable("VALIDATION_FAILED", "The assignee must be an active recruiter or HR manager.");
    }
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.application.update({ where: { id }, data: { assignedRecruiterId: dto.recruiterId }, select: { id: true, assignedRecruiterId: true } });
      await this.audit.record({ actorUserId: ctx.user.id, action: "application.assigned", entityType: "application", entityId: id, summary: { recruiterId: dto.recruiterId }, requestId: ctx.requestId }, tx);
      return a;
    });
  }

  /** What a candidate may see about their own recruitment: no remarks, reviews, assessments or internal outcomes. */
  async portal(user: AuthUser) {
    if (!user.candidateId) return { candidate: null, applications: [] };
    const c = await this.prisma.candidate.findUnique({
      where: { id: user.candidateId },
      select: {
        id: true, fullName: true, category: true,
        applications: {
          orderBy: { submittedAt: "desc" },
          select: {
            id: true, status: true, submittedAt: true, statusChangedAt: true,
            jobRole: { select: { title: true, track: true } },
            interviews: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true, status: true, invitedAt: true, startedAt: true, completedAt: true, submittedAt: true, expiresAt: true,
                questionSetVersion: { select: { versionCode: true } },
                _count: { select: { questions: true, answers: true } },
              },
            },
          },
        },
      },
    });
    if (!c) return { candidate: null, applications: [] };
    return {
      candidate: { id: c.id, fullName: c.fullName, category: c.category },
      applications: c.applications.map((a) => ({
        id: a.id,
        reference: `APP-${a.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
        jobRole: a.jobRole,
        submittedAt: a.submittedAt,
        stage: candidateStage(a.status),
        stageChangedAt: a.statusChangedAt,
        interviews: a.interviews.map((i) => ({
          id: i.id,
          reference: interviewReference(i.id),
          status: i.status,
          questionSetVersion: i.questionSetVersion.versionCode,
          totalQuestions: i._count.questions,
          completedQuestions: i._count.answers,
          invitedAt: i.invitedAt,
          startedAt: i.startedAt,
          completedAt: i.completedAt,
          submittedAt: i.submittedAt,
          expiresAt: i.expiresAt,
        })),
      })),
    };
  }

  private candidateScope(user: AuthUser): Prisma.CandidateWhereInput {
    const scoped = this.scope.applicationWhere(user);
    return Object.keys(scoped).length ? { applications: { some: scoped } } : {};
  }
}

// ─────────────────────────── Controllers ───────────────────────────

@ApiTags("candidates")
@ApiBearerAuth()
@Controller("candidates")
class CandidatesController {
  constructor(private readonly svc: CandidatesService) {}

  @Get()
  @RequirePermissions(P.CANDIDATES_READ)
  list(@Query() q: CandidateQueryDto, @Ctx() { user }: RequestContext) {
    return this.svc.listCandidates(q, user);
  }

  /** Candidate portal: the signed-in candidate's own applications and interviews (no HR data). */
  @Get("me")
  @RequirePermissions(P.INTERVIEWS_TAKE)
  @ApiOperation({ summary: "The signed-in candidate's own application(s) and interview summary. Candidate-safe stages only." })
  me(@Ctx() { user }: RequestContext) {
    return this.svc.portal(user);
  }

  @Get(":id")
  @RequirePermissions(P.CANDIDATES_READ)
  get(@Param("id", ParseUUIDPipe) id: string, @Ctx() { user }: RequestContext) {
    return this.svc.getCandidate(id, user);
  }

  @Post()
  @RequirePermissions(P.CANDIDATES_WRITE)
  @ApiOperation({ summary: "Staff-only manual candidate entry (creates the candidate and their application)." })
  create(@Body() dto: CreateCandidateDto, @Ctx() ctx: RequestContext) {
    return this.svc.createCandidate(dto, ctx);
  }

  @Patch(":id")
  @RequirePermissions(P.CANDIDATES_WRITE)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateCandidateDto, @Ctx() ctx: RequestContext) {
    return this.svc.updateCandidate(id, dto, ctx);
  }
}

@ApiTags("applications")
@ApiBearerAuth()
@Controller("applications")
class ApplicationsController {
  constructor(private readonly svc: CandidatesService) {}

  @Get()
  @RequirePermissions(P.APPLICATIONS_READ)
  list(@Query() q: ApplicationQueryDto, @Ctx() { user }: RequestContext) {
    return this.svc.listApplications(q, user);
  }

  @Get(":id")
  @RequirePermissions(P.APPLICATIONS_READ)
  get(@Param("id", ParseUUIDPipe) id: string, @Ctx() { user }: RequestContext) {
    return this.svc.getApplication(id, user);
  }

  @Get(":id/timeline")
  @RequirePermissions(P.APPLICATIONS_READ)
  timeline(@Param("id", ParseUUIDPipe) id: string, @Ctx() { user }: RequestContext) {
    return this.svc.timeline(id, user);
  }

  @Patch(":id/status")
  @RequirePermissions(P.APPLICATIONS_UPDATE_STATUS)
  @ApiOperation({ summary: "Change the recruitment status (validated against allowed transitions; audited)." })
  status(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto, @Ctx() ctx: RequestContext) {
    return this.svc.updateStatus(id, dto, ctx);
  }

  @Patch(":id/assignee")
  @RequirePermissions(P.APPLICATIONS_UPDATE_STATUS)
  assign(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignDto, @Ctx() ctx: RequestContext) {
    return this.svc.assign(id, dto, ctx);
  }

  @Post(":id/remarks")
  @HttpCode(201)
  @RequirePermissions(P.HR_REMARKS_WRITE)
  remark(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RemarkDto, @Ctx() ctx: RequestContext) {
    return this.svc.addRemark(id, dto, ctx);
  }
}

@Module({ controllers: [CandidatesController, ApplicationsController], providers: [CandidatesService], exports: [CandidatesService] })
export class CandidatesModule {}

