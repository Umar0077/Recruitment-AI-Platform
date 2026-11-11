import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { AccountStatus, Prisma, RoleCode } from "@prisma/client";
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsOptional, IsUUID, ValidateIf } from "class-validator";
import { PrismaService } from "../../database/prisma.service";
import { RequirePermissions } from "../../common/decorators";
import { PERMISSIONS } from "../../common/constants/permissions";
import { Ctx, Paged, type RequestContext } from "../../common/http";
import { conflict, notFound, unprocessable } from "../../common/errors";
import { PageQueryDto, pageArgs, pageMeta } from "../../common/pagination";
import { AuditService } from "../audit/audit.module";

class UserQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: RoleCode }) @IsOptional() @IsEnum(RoleCode) role?: RoleCode;
  @ApiPropertyOptional({ enum: AccountStatus }) @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
}
class SetRolesDto {
  @ApiProperty({ enum: RoleCode, isArray: true }) @IsArray() @ArrayUnique() @ArrayMaxSize(5) @IsEnum(RoleCode, { each: true }) roles!: RoleCode[];
}
class SetStatusDto {
  @ApiProperty({ enum: AccountStatus }) @IsEnum(AccountStatus) status!: AccountStatus;
}
class LinkCandidateDto {
  @ApiProperty({ format: "uuid", nullable: true }) @ValidateIf((_, v) => v !== null) @IsUUID() candidateId!: string | null;
}

const userSelect = {
  id: true, email: true, emailVerified: true, displayName: true, status: true, lastLoginAt: true, createdAt: true,
  roles: { select: { role: { select: { code: true } }, assignedAt: true } },
  identities: { select: { provider: true } },
  candidate: { select: { id: true, fullName: true } },
} satisfies Prisma.UserSelect;

/** Role assignment is the ONLY way to obtain staff access. Restricted to SUPER_ADMIN (users:manage). */
@Injectable()
class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(q: UserQueryDto) {
    const where: Prisma.UserWhereInput = {
      status: q.status,
      ...(q.role ? { roles: { some: { role: { code: q.role } } } } : {}),
      ...(q.search ? { OR: [{ email: { contains: q.search, mode: "insensitive" } }, { displayName: { contains: q.search, mode: "insensitive" } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: { createdAt: q.sortDir }, ...pageArgs(q), select: userSelect }),
      this.prisma.user.count({ where }),
    ]);
    return new Paged(rows.map(this.shape), pageMeta(q, total));
  }

  async setRoles(id: string, dto: SetRolesDto, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw notFound("User");
    const before = user.roles.map((r) => r.role.code);
    if (id === ctx.user.id && before.includes("SUPER_ADMIN") && !dto.roles.includes("SUPER_ADMIN")) {
      throw conflict("CONFLICT", "You cannot remove your own Super Admin role.");
    }
    if (dto.roles.includes("CANDIDATE") && dto.roles.some((r) => r !== "CANDIDATE")) {
      throw unprocessable("VALIDATION_FAILED", "A candidate account cannot also hold staff roles. Use a separate staff account.");
    }
    return this.prisma.$transaction(async (tx) => {
      if (before.includes("SUPER_ADMIN") && !dto.roles.includes("SUPER_ADMIN")) {
        const admins = await tx.userRole.count({ where: { role: { code: "SUPER_ADMIN" }, user: { status: "ACTIVE" } } });
        if (admins <= 1) throw conflict("CONFLICT", "At least one active Super Admin must remain.");
      }
      const roles = await tx.role.findMany({ where: { code: { in: dto.roles } } });
      await tx.userRole.deleteMany({ where: { userId: id, roleId: { notIn: roles.map((r) => r.id) } } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id, assignedById: ctx.user.id })), skipDuplicates: true });
      await this.audit.record({ actorUserId: ctx.user.id, action: "user.roles_changed", entityType: "user", entityId: id, summary: { from: before, to: dto.roles }, requestId: ctx.requestId }, tx);
      return this.shape(await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect }));
    });
  }

  async setStatus(id: string, dto: SetStatusDto, ctx: RequestContext) {
    if (id === ctx.user.id && dto.status !== "ACTIVE") throw conflict("CONFLICT", "You cannot disable your own account.");
    const user = await this.prisma.user.findUnique({ where: { id }, select: { status: true } });
    if (!user) throw notFound("User");
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { status: dto.status }, select: userSelect });
      await this.audit.record({ actorUserId: ctx.user.id, action: "user.status_changed", entityType: "user", entityId: id, summary: { from: user.status, to: dto.status }, requestId: ctx.requestId }, tx);
      return this.shape(u);
    });
  }

  /** Manual candidate ↔ login link, for cases auto-linking by verified email cannot resolve. */
  async linkCandidate(id: string, dto: LinkCandidateDto, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw notFound("User");
    if (!user.roles.some((r) => r.role.code === "CANDIDATE")) throw unprocessable("VALIDATION_FAILED", "Only candidate accounts can be linked to a candidate record.");
    return this.prisma.$transaction(async (tx) => {
      if (user.candidate) await tx.candidate.update({ where: { id: user.candidate.id }, data: { userId: null } });
      if (dto.candidateId) {
        const res = await tx.candidate.updateMany({ where: { id: dto.candidateId, userId: null }, data: { userId: id } });
        if (!res.count) throw conflict("CONFLICT", "That candidate does not exist or is already linked to another account.");
      }
      await this.audit.record({ actorUserId: ctx.user.id, action: "user.candidate_linked", entityType: "user", entityId: id, summary: { from: user.candidate?.id ?? null, to: dto.candidateId }, requestId: ctx.requestId }, tx);
      return this.shape(await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect }));
    });
  }

  private shape = (u: Prisma.UserGetPayload<{ select: typeof userSelect }>) => ({
    ...u,
    roles: u.roles.map((r) => r.role.code),
    identities: u.identities.map((i) => i.provider),
  });
}

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  list(@Query() q: UserQueryDto) {
    return this.svc.list(q);
  }

  @Patch(":id/roles")
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  roles(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetRolesDto, @Ctx() ctx: RequestContext) {
    return this.svc.setRoles(id, dto, ctx);
  }

  @Patch(":id/status")
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  status(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetStatusDto, @Ctx() ctx: RequestContext) {
    return this.svc.setStatus(id, dto, ctx);
  }

  @Patch(":id/candidate")
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  link(@Param("id", ParseUUIDPipe) id: string, @Body() dto: LinkCandidateDto, @Ctx() ctx: RequestContext) {
    return this.svc.linkCandidate(id, dto, ctx);
  }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
