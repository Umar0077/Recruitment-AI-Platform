import { Controller, Get, Module, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { InterviewStatus, Prisma } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsOptional, Max, Min } from "class-validator";
import { PrismaService } from "../../database/prisma.service";
import { RequirePermissions } from "../../common/decorators";
import { PERMISSIONS } from "../../common/constants/permissions";
import { RECRUITMENT_STATUS_LABELS, RECRUITMENT_STATUS_ORDER } from "../../common/constants/recruitment";
import type { EnvironmentVariables } from "../../config/env.validation";

class OverviewQueryDto {
  @ApiPropertyOptional({ format: "date-time" }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ format: "date-time" }) @IsOptional() @IsDateString() to?: string;
  /** Sample (seed) records are excluded by default in production and included elsewhere. */
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() includeSample?: boolean;
}

class ActivityQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 52, default: 12 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(52) weeks = 12;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() includeSample?: boolean;
}

/** Aggregates only — counts and durations computed by SQL. No individual candidate data. */
@ApiTags("analytics")
@ApiBearerAuth()
@Controller("analytics")
class AnalyticsController {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<EnvironmentVariables, true>) {}

  /**
   * Weekly activity for the last N weeks (Monday-start weeks, UTC), computed in SQL:
   * applications submitted, interviews submitted, and HR reviews marked REVIEWED.
   */
  @Get("activity")
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  async activity(@Query() q: ActivityQueryDto) {
    const includeSample = q.includeSample ?? this.config.get("NODE_ENV", { infer: true }) !== "production";
    const weeks = q.weeks;
    const rows = await this.prisma.$queryRaw<{ week_start: Date; applications: number; interviews: number; reviews: number }[]>`
      WITH w AS (
        SELECT generate_series(date_trunc('week', now()) - make_interval(weeks => ${weeks - 1}::int), date_trunc('week', now()), interval '1 week') AS week_start
      )
      SELECT w.week_start,
        (SELECT count(*)::int FROM applications a JOIN candidates c ON c.id = a.candidate_id
          WHERE a.submitted_at >= w.week_start AND a.submitted_at < w.week_start + interval '1 week' AND (${includeSample} OR c.is_sample = false)) AS applications,
        (SELECT count(*)::int FROM interview_sessions s
          WHERE s.submitted_at >= w.week_start AND s.submitted_at < w.week_start + interval '1 week' AND (${includeSample} OR s.is_sample = false)) AS interviews,
        (SELECT count(*)::int FROM hr_reviews r
          WHERE r.status = 'REVIEWED' AND r.reviewed_at >= w.week_start AND r.reviewed_at < w.week_start + interval '1 week') AS reviews
      FROM w ORDER BY w.week_start`;
    return { includeSample, weeks: rows.map((r) => ({ weekStart: r.week_start, applications: r.applications, interviews: r.interviews, reviews: r.reviews })) };
  }

  @Get("overview")
  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  async overview(@Query() q: OverviewQueryDto) {
    const includeSample = q.includeSample ?? this.config.get("NODE_ENV", { infer: true }) !== "production";
    const range = q.from || q.to ? { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } : undefined;
    const sample = includeSample ? {} : { isSample: false };
    const appWhere: Prisma.ApplicationWhereInput = { submittedAt: range, candidate: sample };
    const ivWhere: Prisma.InterviewSessionWhereInput = { createdAt: range, ...sample };

    const [candidates, byStatus, byTrack, ivByStatus, reviewsPending, durations] = await Promise.all([
      this.prisma.candidate.count({ where: { ...sample, createdAt: range } }),
      this.prisma.application.groupBy({ by: ["status"], where: appWhere, _count: { _all: true } }),
      this.prisma.candidate.groupBy({ by: ["category"], where: { ...sample, createdAt: range }, _count: { _all: true } }),
      this.prisma.interviewSession.groupBy({ by: ["status"], where: ivWhere, _count: { _all: true } }),
      this.prisma.hrReview.count({ where: { status: { in: ["PENDING_REVIEW", "IN_REVIEW", "FURTHER_REVIEW_REQUIRED"] }, interviewSession: ivWhere } }),
      this.prisma.$queryRaw<{ avg_seconds: number | null; median_seconds: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (submitted_at - started_at)))::float8 AS avg_seconds,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (submitted_at - started_at)))::float8 AS median_seconds
        FROM interview_sessions
        WHERE status = 'SUBMITTED' AND started_at IS NOT NULL
          AND (${includeSample} OR is_sample = false)
          AND (${range?.gte ?? null}::timestamptz IS NULL OR created_at >= ${range?.gte ?? null}::timestamptz)
          AND (${range?.lte ?? null}::timestamptz IS NULL OR created_at <= ${range?.lte ?? null}::timestamptz)`,
    ]);

    const iv = Object.fromEntries(Object.values(InterviewStatus).map((s) => [s, 0])) as Record<InterviewStatus, number>;
    for (const g of ivByStatus) iv[g.status] = g._count._all;
    const issued = Object.values(iv).reduce((a, b) => a + b, 0);
    const finished = iv.SUBMITTED;
    const statusCounts = new Map(byStatus.map((g) => [g.status, g._count._all]));

    return {
      includeSample,
      range: { from: q.from ?? null, to: q.to ?? null },
      candidates: { total: candidates, byTrack: Object.fromEntries(byTrack.map((g) => [g.category, g._count._all])) },
      applications: {
        total: byStatus.reduce((n, g) => n + g._count._all, 0),
        byStatus: RECRUITMENT_STATUS_ORDER.map((s) => ({ status: s, label: RECRUITMENT_STATUS_LABELS[s], count: statusCounts.get(s) ?? 0 })),
      },
      interviews: {
        issued,
        byStatus: iv,
        completionRate: issued ? Number((finished / issued).toFixed(4)) : null,
        averageDurationSeconds: durations[0]?.avg_seconds != null ? Math.round(durations[0].avg_seconds) : null,
        medianDurationSeconds: durations[0]?.median_seconds != null ? Math.round(durations[0].median_seconds) : null,
      },
      reviews: { pending: reviewsPending },
    };
  }
}

@Module({ controllers: [AnalyticsController] })
export class AnalyticsModule {}
