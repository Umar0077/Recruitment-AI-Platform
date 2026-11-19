import { Controller, Get, Global, Injectable, Module, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PrismaService } from "../../database/prisma.service";
import { RequirePermissions } from "../../common/decorators";
import { PERMISSIONS } from "../../common/constants/permissions";
import { PageQueryDto, pageArgs, pageMeta } from "../../common/pagination";
import { Paged } from "../../common/http";

type Tx = Prisma.TransactionClient | PrismaService;

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  /** Safe change summary — ids, statuses, counts. Never tokens, passwords, or transcripts. */
  summary?: Prisma.InputJsonValue;
  requestId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  /** Pass the transaction client so the audit row commits (or rolls back) with the change itself. */
  record(entry: AuditEntry, tx: Tx = this.prisma) {
    return tx.auditLog.create({ data: { ...entry, summary: entry.summary ?? Prisma.JsonNull } });
  }
}

class AuditQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) action?: string;
}

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit-logs")
class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async list(@Query() q: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = { entityType: q.entityType, entityId: q.entityId, action: q.action };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: q.sortDir }, ...pageArgs(q), include: { actor: { select: { id: true, displayName: true, email: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return new Paged(rows, pageMeta(q, total));
  }
}

@Global()
@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
