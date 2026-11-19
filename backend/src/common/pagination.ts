import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const MAX_PAGE_SIZE = 100;

export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE)
  limit = 20;

  @ApiPropertyOptional({ maxLength: 100, description: "Free-text search" })
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ["asc", "desc"], default: "desc" })
  @IsOptional() @IsIn(["asc", "desc"])
  sortDir: "asc" | "desc" = "desc";
}

export const pageArgs = (q: PageQueryDto) => ({ skip: (q.page - 1) * q.limit, take: q.limit });
export const pageMeta = (q: PageQueryDto, total: number) => ({ page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) });
