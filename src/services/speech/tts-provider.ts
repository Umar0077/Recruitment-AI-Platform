import type { SpeakOptions, SpeakResult, TTSVoice } from "./types";

/**
 * Text-to-speech contract. The browser implementation is used for the demo; a server-side
 * neural voice (or locally hosted model) can implement the same interface later.
 */
export interface TTSProvider {
  readonly id: string;
  isSupported(): boolean;
  /** Resolves once the voice list is available (browsers load voices asynchronously). */
  loadVoices(): Promise<TTSVoice[]>;
  /** Speaks text, cancelling anything already playing. Only one utterance plays at a time. */
  speak(text: string, options?: SpeakOptions): Promise<SpeakResult>;
  pause(): void;
  resume(): void;
  cancel(): void;
  readonly canPause: boolean;
}
