"use client";
/**
 * Web Speech API recognition (SpeechRecognition / webkitSpeechRecognition).
 * Availability varies: Chrome and Edge desktop support it; Safari partially; Firefox does not.
 * In Chrome, audio is sent to the browser vendor's speech service for transcription.
 *
 * Finals are stored by result index, so repeated "final" events for the same segment
 * never duplicate words. Recognition that ends on its own (e.g. after a pause) restarts
 * transparently while the candidate is still answering, keeping earlier words.
 */
import type { STTProvider } from "./stt-provider";
import type { STTCallbacks, STTErrorCode } from "./types";

interface RecognitionAlternative { transcript: string }
interface RecognitionResult { isFinal: boolean; length: number; [i: number]: RecognitionAlternative }
interface RecognitionEvent { resultIndex: number; results: { length: number; [i: number]: RecognitionResult } }
interface RecognitionErrorEvent { error: string; message?: string }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MAP: Record<string, STTErrorCode> = {
  "not-allowed": "permission-denied",
  "service-not-allowed": "permission-denied",
  "audio-capture": "no-microphone",
  "no-speech": "no-speech",
  network: "network",
  "language-not-supported": "language-not-supported",
  aborted: "aborted",
};

const MESSAGES: Record<STTErrorCode, string> = {
  "permission-denied": "Microphone access was blocked, so speech can't be transcribed.",
  "no-microphone": "No working microphone was found.",
  "no-speech": "We didn't hear any speech. Check your microphone and try again.",
  network: "Speech recognition needs an internet connection in this browser and couldn't reach its service.",
  "language-not-supported": "This browser can't recognise the selected language.",
  aborted: "Listening stopped.",
  unknown: "Speech recognition stopped unexpectedly.",
};

const joinText = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

export class BrowserSTT implements STTProvider {
  readonly id = "browser-web-speech";
  private rec: Recognition | null = null;
  private wanted = false; // candidate still wants to be listening
  private earlierText = ""; // text from previous (auto-restarted) recognition sessions
  private finals: string[] = []; // finals for the current session, by result index
  private restarts = 0;
  private callbacks: STTCallbacks = {};
  private stopResolvers: ((t: string) => void)[] = [];
  private fatal = false;
  isActive = false;

  isSupported() {
    return !!getCtor();
  }

  private text() {
    return joinText(this.earlierText, ...this.finals);
  }

  start({ lang, ...callbacks }: { lang: string } & STTCallbacks) {
    const Ctor = getCtor();
    if (!Ctor) {
      callbacks.onError?.("unknown", "Speech recognition isn't available in this browser.");
      return;
    }
    if (this.isActive) this.abort();
    this.callbacks = callbacks;
    this.earlierText = "";
    this.restarts = 0;
    this.fatal = false;
    this.wanted = true;
    this.launch(Ctor, lang);
  }

  private launch(Ctor: RecognitionCtor, lang: string) {
    const rec = new Ctor();
    this.rec = rec;
    this.finals = [];
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      this.isActive = true;
      if (this.restarts === 0) this.callbacks.onStart?.();
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) this.finals[i] = t;
        else interim += ` ${t}`;
      }
      this.callbacks.onFinal?.(this.text());
      this.callbacks.onInterim?.(interim.trim());
    };
    rec.onerror = (e) => {
      const code = ERROR_MAP[e.error] ?? "unknown";
      if (code === "aborted") return;
      // "no-speech" is recoverable: keep listening if the candidate hasn't stopped.
      if (code === "no-speech" && this.wanted && this.restarts < 6) return;
      if (code !== "no-speech") this.fatal = true;
      this.callbacks.onError?.(code, MESSAGES[code]);
    };
    rec.onend = () => {
      // Fold this session's finals into the running transcript before any restart.
      this.earlierText = this.text();
      this.finals = [];
      if (this.wanted && !this.fatal && this.restarts < 6) {
        this.restarts++;
        try {
          this.launch(Ctor, lang);
          return;
        } catch {
          /* fall through to end */
        }
      }
      this.isActive = false;
      this.wanted = false;
      this.rec = null;
      const finalText = this.earlierText;
      this.callbacks.onInterim?.("");
      this.callbacks.onEnd?.(finalText);
      this.stopResolvers.splice(0).forEach((r) => r(finalText));
    };
    rec.start();
  }

  stop(): Promise<string> {
    this.wanted = false;
    if (!this.rec) return Promise.resolve(this.text());
    return new Promise((resolve) => {
      this.stopResolvers.push(resolve);
      try {
        this.rec?.stop();
      } catch {
        resolve(this.text());
      }
      // Safety net: some engines never fire onend after stop().
      window.setTimeout(() => {
        if (this.stopResolvers.includes(resolve)) {
          this.stopResolvers = this.stopResolvers.filter((r) => r !== resolve);
          this.isActive = false;
          resolve(this.text());
        }
      }, 2500);
    });
  }

  abort() {
    this.wanted = false;
    this.fatal = true;
    try {
      this.rec?.abort();
    } catch {
      /* already stopped */
    }
    this.rec = null;
    this.isActive = false;
  }
}

let instance: BrowserSTT | null = null;
export const getBrowserSTT = () => (instance ??= new BrowserSTT());
export const isSpeechRecognitionSupported = () => !!getCtor();
