import { BadRequestException } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { PageQueryDto } from "../../common/pagination";

export type UsageRange = "today" | "7d" | "30d" | "month";
export class UsageOverviewQuery {
  @IsOptional() @IsIn(["today", "7d", "30d", "month"])
  range: UsageRange = "30d";
}
export class UsageHistoryQuery extends PageQueryDto {
  @IsOptional() @IsIn(["today", "7d", "30d", "month"])
  range: UsageRange = "30d";
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
  @IsOptional() @IsString() @MaxLength(200)
  model?: string;
  @IsOptional() @IsString() @MaxLength(100)
  feature?: string;
  @IsOptional() @IsIn(["success", "failed", "pending"])
  status?: "success" | "failed" | "pending";
}
export const DAY_MS = 86400000;
export function utcDay(now: Date) { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); }
export function usageWindow(range: UsageRange, now = new Date(), from?: string, to?: string) {
  const day = utcDay(now), end = new Date(day.getTime() + DAY_MS);
  if (from || to) {
    if (!from || !to) throw new BadRequestException("Both from and to are required.");
    const start = new Date(`${from}T00:00:00.000Z`), last = new Date(`${to}T00:00:00.000Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(last.getTime()) || start.toISOString().slice(0, 10) !== from || last.toISOString().slice(0, 10) !== to || start > last || last.getTime() - start.getTime() >= 366 * DAY_MS) throw new BadRequestException("Use valid UTC dates spanning at most 366 days.");
    return { from: start, to: new Date(last.getTime() + DAY_MS) };
  }
  const start = range === "month" ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) : new Date(day.getTime() - ({ today: 0, "7d": 6, "30d": 29 }[range]) * DAY_MS);
  return { from: start, to: end };
}
