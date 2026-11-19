import { Body, CanActivate, Controller, ExecutionContext, HttpStatus, Injectable, Module, Post, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiHeader, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CandidateTrack, Prisma } from "@prisma/client";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { IsDateString, IsEmail, IsEnum, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { PrismaService } from "../../database/prisma.service";
import { Public } from "../../common/decorators";
import { AppError, notFound, unprocessable } from "../../common/errors";
import type { EnvironmentVariables } from "../../config/env.validation";
import { AuditService } from "../audit/audit.module";

const SYSTEM = "careers-website";
const sha = (s: string) => createHash("sha256").update(s).digest();

/** Server-to-server auth: constant-time comparison of the X-Integration-Key header. Disabled if no key is configured. */
@Injectable()
class IntegrationKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}
  canActivate(ctx: ExecutionContext) {
    const expected = this.config.get("CAREERS_INTEGRATION_KEY", { infer: true });
    if (!expected) throw new AppError("FEATURE_DISABLED", "The Careers integration is not configured.", HttpStatus.SERVICE_UNAVAILABLE);
    const got = ctx.switchToHttp().getRequest<Request>().header("x-integration-key") ?? "";
    if (!got || !timingSafeEqual(sha(got), sha(expected))) throw new AppError("UNAUTHENTICATED", "Invalid integration key.", HttpStatus.UNAUTHORIZED);
    return true;
  }
}

class CareersApplicationDto {
  @ApiProperty({ description: "Unique application id in the Careers Website (idempotency key)" }) @IsString() @Matches(/^[A-Za-z0-9._:-]{1,100}$/) externalApplicationRef!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z0-9._:-]{1,100}$/) externalCandidateId?: string;
  @ApiProperty({ description: "Job role code (e.g. FE-CLOSER) or the role's externalJobId" }) @IsString() @MaxLength(100) jobRef!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @ApiProperty() @IsEmail() @MaxLength(200) email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional({ enum: CandidateTrack }) @IsOptional() @IsEnum(CandidateTrack) category?: CandidateTrack;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) location?: string;
  @ApiProperty({ format: "date-time" }) @IsDateString() submittedAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() details?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsObject() availability?: Record<string, unknown>;
}

const small = (v?: Record<string, unknown>) => !v || (Object.keys(v).length <= 50 && JSON.stringify(v).length <= 10_000);

@ApiTags("integrations")
@Public()
@UseGuards(IntegrationKeyGuard)
@Controller("integrations/careers")
class CareersController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Receives an application from the Careers Website. Repeat deliveries of the same ref return the original record. */
  @Post("applications")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: "X-Integration-Key", required: true })
  @ApiOperation({ summary: "Idempotent application intake (server-to-server only)." })
  async receive(@Body() dto: CareersApplicationDto) {
    if (!small(dto.details) || !small(dto.availability)) throw unprocessable("VALIDATION_FAILED", "details/availability are too large.");
    const existing = await this.prisma.application.findUnique({ where: { source_externalApplicationRef: { source: "CAREERS_WEBSITE", externalApplicationRef: dto.externalApplicationRef } }, select: { id: true, candidateId: true, status: true } });
    if (existing) return { created: false, applicationId: existing.id, candidateId: existing.candidateId, status: existing.status };

    const role = await this.prisma.jobRole.findFirst({ where: { isActive: true, OR: [{ code: dto.jobRef }, { externalJobId: dto.jobRef }] } });
    if (!role) throw notFound("Job role");
    if (dto.category && dto.category !== role.track) throw unprocessable("VALIDATION_FAILED", "category does not match the job role's track.");

    try {
      return await this.prisma.$transaction(async (tx) => {
        let candidate = dto.externalCandidateId ? await tx.candidate.findUnique({ where: { externalCandidateId: dto.externalCandidateId } }) : null;
        candidate ??= await tx.candidate.create({
          data: { externalCandidateId: dto.externalCandidateId, fullName: dto.fullName.trim(), email: dto.email.toLowerCase(), phone: dto.phone, category: role.track, location: dto.location },
        });
        const app = await tx.application.create({
          data: {
            candidateId: candidate.id,
            jobRoleId: role.id,
            source: "CAREERS_WEBSITE",
            externalApplicationRef: dto.externalApplicationRef,
            submittedAt: new Date(dto.submittedAt),
            details: (dto.details ?? {}) as Prisma.InputJsonValue,
            availability: (dto.availability ?? {}) as Prisma.InputJsonValue,
            events: { create: { type: "APPLICATION_RECEIVED", toStatus: "APPLICATION_RECEIVED", note: SYSTEM } },
          },
        });
        await tx.integrationReference.createMany({
          data: [
            { system: SYSTEM, entityType: "application", externalId: dto.externalApplicationRef, entityId: app.id },
            ...(dto.externalCandidateId ? [{ system: SYSTEM, entityType: "candidate", externalId: dto.externalCandidateId, entityId: candidate.id }] : []),
          ],
          skipDuplicates: true,
        });
        await this.audit.record({ actorUserId: null, action: "application.received", entityType: "application", entityId: app.id, summary: { system: SYSTEM, jobRoleId: role.id } }, tx);
        return { created: true, applicationId: app.id, candidateId: candidate.id, status: app.status };
      });
    } catch (e) {
      // Concurrent duplicate delivery: the unique (source, ref) constraint won — return the stored record.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const a = await this.prisma.application.findUnique({ where: { source_externalApplicationRef: { source: "CAREERS_WEBSITE", externalApplicationRef: dto.externalApplicationRef } } });
        if (a) return { created: false, applicationId: a.id, candidateId: a.candidateId, status: a.status };
      }
      throw e;
    }
  }
}

@Module({ controllers: [CareersController], providers: [IntegrationKeyGuard] })
export class CareersIntegrationModule {}
