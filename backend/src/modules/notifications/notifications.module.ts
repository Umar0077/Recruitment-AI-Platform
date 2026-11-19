import { Controller, Get, Global, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { NotificationType, Prisma } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";
import { PrismaService } from "../../database/prisma.service";
import { Ctx, Paged, type RequestContext } from "../../common/http";
import { PageQueryDto, pageArgs, pageMeta } from "../../common/pagination";
import { notFound } from "../../common/errors";
import { STAFF_ROLES } from "../../common/constants/permissions";

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * In-app notifications only. No email/SMS/push is sent until a provider and an approved
 * notification policy are configured.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Notifies every active staff member holding one of `roles`. dedupeKey makes delivery idempotent. */
  async notifyStaff(
    input: { type: NotificationType; title: string; message: string; entityType?: string; entityId?: string; dedupeKey?: string },
    roles = STAFF_ROLES.filter((r) => r !== "REVIEWER"),
    tx: Tx = this.prisma,
  ) {
    const staff = await tx.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { code: { in: roles } } } } }, select: { id: true } });
    if (!staff.length) return 0;
    const res = await tx.notification.createMany({
      data: staff.map((s) => ({ ...input, recipientId: s.id, dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${s.id}` : undefined })),
      skipDuplicates: true,
    });
    return res.count;
  }
}

class NotificationQueryDto extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === "true" || value === true) @IsBoolean() unreadOnly?: boolean;
}

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in user's own notifications. */
  @Get()
  async list(@Ctx() { user }: RequestContext, @Query() q: NotificationQueryDto) {
    const where: Prisma.NotificationWhereInput = { recipientId: user.id, ...(q.unreadOnly ? { readAt: null } : {}) };
    const [rows, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
    ]);
    return new Paged(rows, { ...pageMeta(q, total), unread });
  }

  @Patch(":id/read")
  async markRead(@Ctx() { user }: RequestContext, @Param("id", ParseUUIDPipe) id: string) {
    const res = await this.prisma.notification.updateMany({ where: { id, recipientId: user.id }, data: { readAt: new Date() } });
    if (!res.count) throw notFound("Notification");
    return { id, read: true };
  }

  @Post("read-all")
  @HttpCode(200)
  async markAll(@Ctx() { user }: RequestContext) {
    const res = await this.prisma.notification.updateMany({ where: { recipientId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { updated: res.count };
  }
}

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
