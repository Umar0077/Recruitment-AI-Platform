export type CaptureState = "NOT_REQUESTED" | "SCREEN_READY" | "PERMISSION_PENDING" | "CAPTURE_READY" | "RECORDING" | "PAUSED" | "INTERRUPTED" | "FINALIZING" | "UPLOADING" | "UPLOADED" | "FAILED" | "CANCELLED";
export interface RecordingPolicy {
  mode?: "approved" | "local_test"; blockers?: string[];
  available: boolean; reason: string | null; policyReference: string; retentionDays: number; supportEmail: string;
  screenRequirement: "selected_surface" | "full_display"; cameraEnabled: boolean; monitoringEnabled: boolean;
  partBytes: number; maxBytes: number; width: number; height: number; fps: number; videoBitsPerSecond: number;
}
export interface RecordingEvent { id: string; type: string; occurredAt: string; captureState: CaptureState; durationMs?: number }
export interface RecordingSnapshot { state: CaptureState; message: string; uploadedBytes: number; capturedBytes: number; surface: string; systemAudio: boolean; mimeType: string; interrupted?: boolean }
export const FORMATS = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
export function recordingFormat() { return typeof MediaRecorder === "undefined" ? undefined : FORMATS.find(type => MediaRecorder.isTypeSupported(type)); }
