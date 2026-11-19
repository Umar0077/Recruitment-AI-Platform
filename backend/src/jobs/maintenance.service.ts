import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { InterviewStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import type { EnvironmentVariables } from "../config/env.validation";

const OPEN: InterviewStatus[] = ["PENDING", "IN_PROGRESS", "INTERRUPTED"];
export const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Periodic, idempotent housekeeping:
 *  - expire open interviews past their 48-hour window;
 *  - create the 24-hour reminder notification once per session (dedupeKey + reminderSentAt).
 * Expiry is ALSO enforced on every candidate request, so a missed run never extends a deadline.
 * Runs in the API process when JOBS_IN_PROCESS=true (local, no Redis), or in the BullMQ worker.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Maintenance");
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<EnvironmentVariables, true>) {}

  onApplicationBootstrap() {
    if (!this.config.get("JOBS_IN_PROCESS", { infer: true }) || this.config.get("NODE_ENV", { infer: true }) === "test") return;
    this.timer = setInterval(() => void this.runOnce(), MAINTENANCE_INTERVAL_MS);
    this.timer.unref();
    this.logger.log("In-process maintenance enabled (every 5 minutes)");
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce() {
    if (this.running) return { expired: 0, reminders: 0 };
    this.running = true;
    try {
      const expired = await this.expireOverdue();
      const reminders = await this.sendDueReminders();
      if (expired || reminders) this.logger.log({ expired, reminders }, "Maintenance run");
      return { expired, reminders };
    } catch (err) {
      this.logger.error({ err }, "Maintenance run failed");
      return { expired: 0, reminders: 0 };
    } finally {
      this.running = false;
    }
  }

  async expireOverdue(limit = 500) {
    const due = await this.prisma.interviewSession.findMany({ where: { status: { in: OPEN }, expiresAt: { lt: new Date() } }, select: { id: true }, take: limit });
    let count = 0;
    for (const { id } of due) {
      count += await this.prisma.$transaction(async (tx) => {
        const [s] = await tx.$queryRaw<{ status: InterviewStatus; expires_at: Date }[]>`SELECT status, expires_at FROM interview_sessions WHERE id = ${id}::uuid FOR UPDATE`;
        if (!s || !OPEN.includes(s.status) || s.expires_at >= new Date()) return 0;
        await tx.interviewSession.update({ where: { id }, data: { status: "EXPIRED", currentQuestionId: null, progressEvents: { create: { type: "EXPIRED" } } } });
        return 1;
      });
    }
    return count;
  }

  /** In-app reminder to the candidate's linked account. No email/SMS is sent until a provider is configured. */
  async sendDueReminders(limit = 500) {
    const now = new Date();
    const due = await this.prisma.interviewSession.findMany({
      where: { status: { in: OPEN }, reminderSentAt: null, reminderDueAt: { lte: now }, expiresAt: { gt: now } },
      select: { id: true, expiresAt: true, candidate: { select: { userId: true } }, jobRole: { select: { title: true } } },
      take: limit,
    });
    let count = 0;
    for (const s of due) {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.interviewSession.updateMany({ where: { id: s.id, reminderSentAt: null }, data: { reminderSentAt: now } });
        if (!res.count || !s.candidate.userId) return;
        await tx.notification.createMany({
          data: [{
            recipientId: s.candidate.userId,
            type: "SESSION_EXPIRING",
            title: "Your interview is waiting",
            message: `Please complete your ${s.jobRole.title} interview before ${s.expiresAt.toISOString()}.`,
            entityType: "interview_session",
            entityId: s.id,
            dedupeKey: `reminder:${s.id}`,
          }],
          skipDuplicates: true,
        });
        count++;
      });
    }
    return count;
  }
}

@Global()
@Module({ providers: [MaintenanceService], exports: [MaintenanceService] })
export class MaintenanceModule {}
