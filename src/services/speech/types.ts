/** Shared speech types. Providers (browser today, server/neural later) implement these contracts. */

export type TTSStatus = "unsupported" | "preparing" | "ready" | "speaking" | "paused" | "complete" | "failed";

export interface TTSVoice {
  id: string; // voiceURI
  name: string;
  lang: string;
  /** True only when the voice name clearly identifies a female voice. Never inferred from pitch. */
  likelyFemale: boolean;
  /** "natural" for voices advertised as neural/natural/online, otherwise "standard". */
  quality: "natural" | "standard";
  local: boolean;
}

export interface SpeakOptions {
  voiceId?: string;
  rate?: number; // 0.5–1.5, interview default ~0.97
  volume?: number; // 0–1
  onStart?: () => void;
}

export type SpeakResult = "completed" | "cancelled" | "failed" | "blocked";

export type STTStatus = "unsupported" | "idle" | "starting" | "listening" | "stopping" | "error";

export type STTErrorCode = "permission-denied" | "no-microphone" | "no-speech" | "network" | "language-not-supported" | "aborted" | "unknown";

export interface STTCallbacks {
  onStart?: () => void;
  /** Provisional text for the current utterance — never saved as an answer. */
  onInterim?: (interim: string) => void;
  /** Cumulative finalized transcript for this recording. */
  onFinal?: (finalText: string) => void;
  onError?: (code: STTErrorCode, message: string) => void;
  onEnd?: (finalText: string) => void;
}

export type MicrophoneStatus = "off" | "requesting" | "active" | "denied" | "no-device" | "in-use" | "error";

export interface AudioProcessingSupport {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

/** What the browser actually applied to the track (undefined = browser did not report it). */
export interface AppliedProcessing {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface MicrophoneDevice {
  deviceId: string;
  label: string;
}

export interface AudioSettings {
  voiceId?: string;
  rate: number;
  volume: number;
  muted: boolean;
  micDeviceId?: string;
  lang: string;
}
