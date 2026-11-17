"use client";
/** Browser recognition only. Availability and vendor processing depend on browser/device. */
import type { STTProvider } from "./stt-provider";
import type { RecognitionOptions, SpeechSnapshot, STTCallbacks, STTErrorCode } from "./types";

interface RecognitionAlternative { transcript: string; confidence?: number }
interface RecognitionResult { isFinal: boolean; length: number; [i: number]: RecognitionAlternative }
interface RecognitionEvent { resultIndex: number; results: { length: number; [i: number]: RecognitionResult } }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onstart: (() => void) | null; onend: (() => void) | null;
  onaudiostart: (() => void) | null; onaudioend: (() => void) | null;
  onspeechstart: (() => void) | null; onspeechend: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionCtor = new () => Recognition;
type Segment = { text: string; final: boolean; confidence?: number };
const join = (parts: Segment[]) => parts.map(p => p.text.trim()).filter(Boolean).join(" ");
const ERROR_MAP: Record<string, STTErrorCode> = { "not-allowed": "permission-denied", "service-not-allowed": "permission-denied", "audio-capture": "no-microphone", "no-speech": "no-speech", network: "network", "language-not-supported": "language-not-supported", aborted: "aborted" };
const MESSAGES: Record<STTErrorCode, string> = {
  "permission-denied": "Microphone access was blocked. Allow it in your browser or type your answer.",
  "no-microphone": "No working microphone was found. Check your input device.",
  "no-speech": "Recognition stopped without hearing speech. Your captured words are kept; review them or retry.",
  network: "The browser's speech service could not be reached. Your captured words are kept.",
  "language-not-supported": "This browser cannot recognize the selected language. Choose another or type your answer.",
  aborted: "Listening stopped. Your captured words are kept.",
  timeout: "Speech recognition did not respond in time. Review any captured words, then retry or type.",
  unknown: "Speech recognition stopped unexpectedly. Review any captured words or retry.",
};
function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const browser = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

/** One owner at a time, including the asynchronous starting/stopping phases. */
const owner: { current: BrowserSTT | null } = { current: null };
export class BrowserSTT implements STTProvider {
  readonly id = "browser-web-speech";
  private rec: Recognition | null = null;
  private wanted = false;
  private generation = 0;
  private earlier: Segment[] = [];
  private segments: Segment[] = [];
  private callbacks: STTCallbacks = {};
  private options: RecognitionOptions = { lang: "en-US" };
  private restarts = 0;
  private started = false;
  private fatal = false;
  private stopResolvers: ((text: string) => void)[] = [];
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  isActive = false;
  isSupported() { return !!getCtor(); }
  get snapshot(): SpeechSnapshot {
    const all = [...this.earlier, ...this.segments].filter(Boolean);
    return { rawFinalText: all.filter(p => p.final).map(p => p.text).join(" "), lowConfidence: all.some(p => p.final && p.confidence !== undefined && p.confidence > 0 && p.confidence < 0.6), finalText: join(all.filter(p => p.final)), interimText: join(all.filter(p => !p.final)), originalText: join(all), hasUnfinalized: all.some(p => !p.final && !!p.text.trim()) };
  }
  private publish() {
    const snapshot = this.snapshot;
    this.callbacks.onSnapshot?.(snapshot);
    this.callbacks.onFinal?.(snapshot.finalText);
    this.callbacks.onInterim?.(snapshot.interimText);
  }
  start({ lang, maxAlternatives = 3, maxRestarts = 3, ...callbacks }: RecognitionOptions & STTCallbacks) {
    if (this.isActive) return;
    owner.current?.abort();
    const Ctor = getCtor();
    this.callbacks = callbacks;
    this.options = { lang, maxAlternatives: Math.max(1, Math.min(3, maxAlternatives)), maxRestarts: Math.max(0, Math.min(6, maxRestarts)) };
    this.earlier = []; this.segments = []; this.restarts = 0; this.started = false; this.fatal = false;
    this.generation++; this.wanted = true; this.isActive = true; owner.current = this;
    if (!Ctor) { this.fail("unknown"); return; }
    this.launch(Ctor);
  }
  private detach(rec: Recognition) {
    rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
    rec.onaudiostart = rec.onaudioend = rec.onspeechstart = rec.onspeechend = null;
  }
  private launch(Ctor: RecognitionCtor) {
    const generation = this.generation;
    let rec: Recognition;
    try { rec = new Ctor(); } catch { this.fail("unknown"); return; }
    this.rec = rec; this.segments = [];
    const current = () => this.rec === rec && generation === this.generation;
    rec.lang = this.options.lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = this.options.maxAlternatives ?? 3;
    rec.onstart = () => {
      if (!current()) return;
      clearTimeout(this.startTimer);
      if (!this.started) { this.started = true; this.callbacks.onStart?.(); }
    };
    rec.onaudiostart = () => { if (current()) this.callbacks.onAudioActivity?.(true); };
    rec.onaudioend = () => { if (current()) this.callbacks.onAudioActivity?.(false); };
    rec.onspeechstart = () => { if (current()) this.callbacks.onSpeechActivity?.(true); };
    rec.onspeechend = () => { if (current()) this.callbacks.onSpeechActivity?.(false); };
    rec.onresult = event => {
      if (!current()) return;
      // resultIndex marks the first CHANGED result; retain earlier interim results too.
      this.segments.length = event.results.length;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result) this.segments[i] = { text: result[0]?.transcript ?? "", final: result.isFinal, confidence: result[0]?.confidence };
      }
      this.publish();
    };
    rec.onerror = event => {
      if (!current()) return;
      const code = ERROR_MAP[event.error] ?? "unknown";
      if (code === "no-speech" && this.wanted && this.restarts < (this.options.maxRestarts ?? 3)) {
        clearTimeout(this.startTimer);
        this.startTimer = setTimeout(() => { if (current()) this.fail("timeout"); }, 2500);
        return;
      }
      this.fail(code);
    };
    rec.onend = () => {
      if (!current()) return;
      clearTimeout(this.startTimer); this.detach(rec); this.rec = null;
      this.earlier.push(...this.segments.filter(Boolean)); this.segments = [];
      this.callbacks.onAudioActivity?.(false); this.callbacks.onSpeechActivity?.(false);
      if (this.wanted && !this.fatal && this.restarts < (this.options.maxRestarts ?? 3)) {
        this.restarts++; this.launch(Ctor); return;
      }
      if (this.wanted) this.callbacks.onError?.("no-speech", MESSAGES["no-speech"]);
      this.finish();
    };
    this.startTimer = setTimeout(() => { if (current()) this.fail("timeout"); }, 8000);
    try { rec.start(); } catch { this.fail("unknown"); }
  }
  private fail(code: STTErrorCode) {
    this.fatal = true; this.wanted = false;
    this.callbacks.onError?.(code, MESSAGES[code]);
    const rec = this.rec;
    if (rec) { this.detach(rec); this.rec = null; try { rec.abort(); } catch { /* already ended */ } }
    this.finish();
  }
  private finish() {
    clearTimeout(this.startTimer); clearTimeout(this.stopTimer);
    this.startTimer = undefined; this.stopTimer = undefined;
    this.isActive = false; this.wanted = false;
    if (owner.current === this) owner.current = null;
    this.publish();
    this.callbacks.onAudioActivity?.(false); this.callbacks.onSpeechActivity?.(false);
    const text = this.snapshot.originalText;
    this.callbacks.onEnd?.(text);
    this.stopResolvers.splice(0).forEach(resolve => resolve(text));
  }
  stop(): Promise<string> {
    this.wanted = false;
    if (!this.isActive) return Promise.resolve(this.snapshot.originalText);
    return new Promise(resolve => {
      this.stopResolvers.push(resolve);
      if (this.stopTimer) return;
      // A timeout is a failure fallback, never evidence that the engine finalized words.
      this.stopTimer = setTimeout(() => this.fail("timeout"), 2500);
      try { this.rec?.stop(); } catch { this.fail("unknown"); }
    });
  }
  abort() {
    if (!this.isActive) return;
    this.generation++; this.wanted = false;
    const rec = this.rec;
    if (rec) { this.detach(rec); this.rec = null; try { rec.abort(); } catch { /* already ended */ } }
    this.finish();
  }
}
/** Each hook owns its callbacks; the provider arbitrates the one browser microphone session. */
export const getBrowserSTT = () => new BrowserSTT();
export const isSpeechRecognitionSupported = () => !!getCtor();
