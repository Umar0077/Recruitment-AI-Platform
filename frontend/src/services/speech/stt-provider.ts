import type { RecognitionOptions, SpeechSnapshot, STTCallbacks } from "./types";

/**
 * Speech-to-text contract. The browser Web Speech API implements it today; a backend
 * transcription service (streaming audio from getUserMedia) can implement it later
 * without changing the interview UI.
 */
export interface STTProvider {
  readonly id: string;
  isSupported(): boolean;
  /** Starts one recording. Only one recording may run at a time. */
  start(options: RecognitionOptions & STTCallbacks): void;
  /** Stops after the engine flushes. Snapshot identifies any retained, unfinalized words. */
  stop(): Promise<string>;
  /** Stops immediately, discarding pending results. */
  abort(): void;
  readonly isActive: boolean;
  readonly snapshot: SpeechSnapshot;
}
