import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AnswerSource, HrReviewStatus, InterviewStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import { Equals, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";
import { PageQueryDto } from "../../common/pagination";

export class CreateInterviewDto {
  @ApiProperty({ format: "uuid" }) @IsUUID() applicationId!: string;
}

export class SaveAnswerDto {
  /** The text the candidate reviewed and confirmed. */
  @ApiProperty({ minLength: 1, maxLength: 10000 }) @IsString() @MinLength(1) @MaxLength(10000) transcript!: string;
  @ApiProperty({ enum: AnswerSource }) @IsEnum(AnswerSource) source!: AnswerSource;
  @ApiProperty({ minimum: 0, maximum: 3600 }) @Type(() => Number) @IsInt() @Min(0) @Max(3600) responseDurationSec!: number;
  /** Raw speech-recognition output before candidate edits (kept separately as PROVISIONAL). */
  @ApiPropertyOptional({ maxLength: 10000 }) @IsOptional() @IsString() @MaxLength(10000) provisionalTranscript?: string;
  @ApiPropertyOptional({ example: "browser-web-speech" }) @IsOptional() @IsString() @MaxLength(60) engine?: string;
  @ApiPropertyOptional({ example: "en-US" }) @IsOptional() @IsString() @MaxLength(20) language?: string;
}

export const INTERVIEW_SORT_FIELDS = ["createdAt", "invitedAt", "completedAt", "submittedAt", "expiresAt"] as const;

export class InterviewListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: InterviewStatus }) @IsOptional() @IsEnum(InterviewStatus) status?: InterviewStatus;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() jobRoleId?: string;
  @ApiPropertyOptional({ format: "uuid" }) @IsOptional() @IsUUID() applicationId?: string;
  @ApiPropertyOptional({ enum: HrReviewStatus }) @IsOptional() @IsEnum(HrReviewStatus) reviewStatus?: HrReviewStatus;
  /** true = review still open (PENDING_REVIEW, IN_REVIEW or FURTHER_REVIEW_REQUIRED) — same definition as analytics "reviews pending". */
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() reviewOpen?: boolean;
  @ApiPropertyOptional({ format: "date-time" }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ format: "date-time" }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: INTERVIEW_SORT_FIELDS, default: "createdAt" }) @IsOptional() @IsIn(INTERVIEW_SORT_FIELDS) sortBy: (typeof INTERVIEW_SORT_FIELDS)[number] = "createdAt";
}

export class StartInterviewDto {
  /** Required (true) the first time a PENDING interview is started; recorded with the STARTED event. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Equals(true, { message: "consent must be true" }) consent?: boolean;
}
