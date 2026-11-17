"use client";
import type { TTSProvider } from "./tts-provider";
import type { SpeakOptions, SpeakResult, TTSVoice } from "./types";

const FEMALE = /\b(female|woman|zira|aria|jenny|sonia|libby|natasha|neerja|heera|swara|samantha|karen|moira|tessa|victoria|serena|fiona|kate|susan|hazel|emma|ava|allison|joanna|salli|kimberly|ivy|kendra|catherine|clara|michelle|ana|nancy|sara|veena|isha|lekha)\b/i;
const MALE = /\b(male|david|mark|guy|ryan|george|prabhat|ravi|daniel|alex|fred|thomas|rishi|aaron|arthur|oliver|eric|christopher|roger|brian|james|william|liam|madhur)\b/i;
function describe(voice: SpeechSynthesisVoice): TTSVoice {
  return { id: voice.voiceURI, name: voice.name, lang: voice.lang, likelyFemale: FEMALE.test(voice.name) && !MALE.test(voice.name), quality: /(natural|neural|online|enhanced|premium)/i.test(voice.name) ? "natural" : "standard", local: voice.localService };
}
export function rankVoices(voices: TTSVoice[], selectedLanguage = "en-US"): TTSVoice[] {
  const lang = selectedLanguage.toLowerCase().replace("_", "-");
  const score = (v: TTSVoice) => (v.likelyFemale ? 10 : 0) + (v.quality === "natural" ? 4 : 0) + (v.lang.toLowerCase().replace("_", "-") === lang ? 20 : 0) - (MALE.test(v.name) ? 6 : 0);
  return voices.filter(v => /^en(?:[-_]|$)/i.test(v.lang)).sort((a, b) => score(b) - score(a));
}
export function splitSentences(text: string) {
  return text.replace(/\s+/g, " ").split(/(?<=[.?!])\s+(?=[A-Z"'‘“])/).map(s => s.trim()).filter(Boolean);
}
const owner: { current: BrowserTTS | null } = { current: null };
export class BrowserTTS implements TTSProvider {
  readonly id = "browser-speech-synthesis";
  private generation = 0;
  private voicesCache: SpeechSynthesisVoice[] = [];
  private voiceLoad: Promise<TTSVoice[]> | null = null;
  private finishCurrent: ((result: SpeakResult) => void) | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private deadline = 0;
  private remaining = 0;
  private paused = false;
  private onTimeout: (() => void) | null = null;
  isSupported() { return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined"; }
  get canPause() { return this.isSupported() && typeof this.synth.pause === "function" && typeof this.synth.resume === "function"; }
  private get synth() { return window.speechSynthesis; }
  loadVoices(): Promise<TTSVoice[]> {
    if (!this.isSupported()) return Promise.resolve([]);
    this.voicesCache = this.synth.getVoices();
    if (this.voicesCache.length) return Promise.resolve(this.voicesCache.map(describe));
    if (this.voiceLoad) return this.voiceLoad;
    const promise = new Promise<TTSVoice[]>(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return; settled = true;
        clearTimeout(timer); this.synth.removeEventListener("voiceschanged", finish);
        this.voicesCache = this.synth.getVoices(); resolve(this.voicesCache.map(describe));
      };
      const timer = setTimeout(finish, 1500);
      this.synth.addEventListener("voiceschanged", finish);
    });
    this.voiceLoad = promise;
    void promise.finally(() => { if (this.voiceLoad === promise) this.voiceLoad = null; });
    return promise;
  }
  private armTimeout(ms: number) {
    clearTimeout(this.timeout); this.remaining = ms; this.deadline = performance.now() + ms;
    if (!this.paused) this.timeout = setTimeout(() => this.onTimeout?.(), ms);
  }
  speak(text: string, options: SpeakOptions = {}): Promise<SpeakResult> {
    if (!this.isSupported()) return Promise.resolve("failed");
    if (owner.current && owner.current !== this) owner.current.cancel();
    this.cancel();
    const generation = ++this.generation, sentences = splitSentences(text);
    if (!sentences.length) return Promise.resolve("completed");
    owner.current = this; this.paused = false;
    this.voicesCache = this.synth.getVoices();
    const best = rankVoices(this.voicesCache.map(describe), options.lang)[0];
    const voice = this.voicesCache.find(v => v.voiceURI === options.voiceId) ?? this.voicesCache.find(v => v.voiceURI === best?.id);
    return new Promise(resolve => {
      let index = 0, utterance: SpeechSynthesisUtterance | null = null, finished = false;
      const detach = () => { if (utterance) { utterance.onstart = utterance.onend = utterance.onerror = null; } };
      const finish = (result: SpeakResult) => {
        if (finished) return; finished = true; detach(); clearTimeout(this.timeout);
        this.finishCurrent = null; this.onTimeout = null;
        if (owner.current === this) owner.current = null;
        resolve(result);
      };
      this.finishCurrent = finish;
      this.onTimeout = () => { finish("failed"); this.synth.cancel(); };
      const next = () => {
        if (finished || generation !== this.generation) return finish("cancelled");
        if (index >= sentences.length) return finish("completed");
        detach();
        const u = new window.SpeechSynthesisUtterance(sentences[index]); utterance = u;
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? options.lang ?? "en-US";
        u.rate = Math.min(1.5, Math.max(0.5, options.rate ?? 0.95));
        u.pitch = Math.min(2, Math.max(0, options.pitch ?? 1));
        u.volume = Math.min(1, Math.max(0, options.volume ?? 1));
        u.onstart = () => {
          if (finished || generation !== this.generation) return;
          // Missing-event watchdog only fails playback; completion always comes from onend.
          this.armTimeout(180000);
          if (index === 0) options.onStart?.();
        };
        u.onend = () => { if (!finished && generation === this.generation) { index++; next(); } };
        u.onerror = event => { if (!finished) finish(event.error === "not-allowed" ? "blocked" : event.error === "interrupted" || event.error === "canceled" ? "cancelled" : "failed"); };
        this.armTimeout(8000);
        try { this.synth.speak(u); } catch { finish("failed"); }
      };
      try { this.synth.resume(); next(); } catch { finish("failed"); }
    });
  }
  pause() {
    if (owner.current !== this || !this.canPause || this.paused) return;
    this.paused = true; this.remaining = Math.max(1, this.deadline - performance.now()); clearTimeout(this.timeout); this.synth.pause();
  }
  resume() {
    if (owner.current !== this || !this.canPause || !this.paused) return;
    this.paused = false; this.armTimeout(this.remaining); this.synth.resume();
  }
  cancel() {
    this.generation++; const ownsAudio = owner.current === this;
    this.finishCurrent?.("cancelled");
    if (ownsAudio && this.isSupported()) this.synth.cancel();
  }
}
export const getBrowserTTS = () => new BrowserTTS();
