import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
export const CAPTURE_STATES = ["NOT_REQUESTED", "SCREEN_READY", "PERMISSION_PENDING", "CAPTURE_READY", "RECORDING", "PAUSED", "INTERRUPTED", "FINALIZING", "UPLOADING", "UPLOADED", "FAILED", "CANCELLED"] as const;
export const EVENT_TYPES = ["SCREEN_SHARE_STARTED", "SCREEN_SHARE_STOPPED", "CAMERA_INTERRUPTED", "MICROPHONE_INTERRUPTED", "TAB_HIDDEN", "TAB_VISIBLE", "FOCUS_LOST", "FOCUS_RESTORED", "FULLSCREEN_ENTERED", "FULLSCREEN_EXITED", "RECORDING_STARTED", "RECORDING_COMPLETED", "UPLOAD_FAILED", "PAGE_EXITED"] as const;
export const MEDIA_TYPES = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
export class BeginRecordingDto {
  @IsUUID() sessionId!: string;
  @IsUUID() clientId!: string;
  @IsIn([true]) consent!: boolean;
  @IsString() @MaxLength(200) policyReference!: string;
  @IsBoolean() monitoringConsent!: boolean;
  @IsBoolean() cameraConsent!: boolean;
  @IsBoolean() systemAudioConsent!: boolean;
  @IsIn(["monitor", "window", "browser", "unknown"]) displaySurface!: string;
  @IsIn(MEDIA_TYPES) contentType!: string;
}
export class PartDto {
  @IsInt() @Min(1) @Max(410) partNumber!: number;
  @IsInt() @Min(1) @Max(5 * 1024 * 1024) sizeBytes!: number;
}
export class CompleteRecordingDto {
  @IsInt() @Min(1) @Max(410) partsCount!: number;
  @IsInt() @Min(0) @Max(4 * 3600000) durationMs!: number;
}
export class RecordingEventDto {
  @IsUUID() id!: string;
  @IsIn(EVENT_TYPES) type!: string;
  @IsISO8601() occurredAt!: string;
  @IsIn(CAPTURE_STATES) captureState!: string;
  @IsOptional() @IsInt() @Min(0) @Max(86400000) durationMs?: number;
}
