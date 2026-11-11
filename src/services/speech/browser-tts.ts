"use client";
/**
 * Browser speechSynthesis provider.
 * - Voices load asynchronously and differ per OS/browser, so nothing is hardcoded.
 * - Text is spoken sentence by sentence: this gives natural pauses and avoids Chrome's
 *   habit of silently stopping long utterances.
 * - A generation token makes stale callbacks harmless after cancel/replay.
 */
import type { TTSProvider } from "./tts-provider";
import type { SpeakOptions, SpeakResult, TTSVoice } from "./types";

// Names that clearly identify female voices on common platforms (Windows, macOS/iOS, Android, Chrome).
const FEMALE = /\b(female|woman|zira|aria|jenny|sonia|libby|maisie|natasha|neerja|heera|swara|samantha|karen|moira|tessa|victoria|serena|fiona|kate|susan|hazel|emma|ava|allison|joanna|salli|kimberly|ivy|kendra|catherine|clara|michelle|ana|nancy|sara|veena|isha|lekha)\b/i;
const MALE = /\b(male|david|mark|guy|ryan|george|prabhat|ravi|daniel|alex|fred|thomas|rishi|aaron|arthur|oliver|eric|christopher|roger|brian|james|william|liam|madhur)\b/i;
const NATURAL = /(natural|neural|online|enhanced|premium)/i;

function describe(v: SpeechSynthesisVoice): TTSVoice {
  // Chrome's built-in "Google US English" and "Google UK English Female" voices are female.
  const googleFemale = /google (us english|uk english female)/i.test(v.name);
  return {
    id: v.voiceURI,
    name: v.name,
    lang: v.lang,
    likelyFemale: googleFemale || (FEMALE.test(v.name) && !MALE.test(v.name)),
    quality: NATURAL.test(v.name) || /^google/i.test(v.name) ? "natural" : "standard",
    local: v.localService,
  };
}

/** Preference order: clearly female → natural quality → regional English suited to Pakistan → others. */
export function rankVoices(voices: TTSVoice[]): TTSVoice[] {
  const score = (v: TTSVoice) => {
    const lang = v.lang.toLowerCase().replace("_", "-");
    let s = 0;
    if (v.likelyFemale) s += 10;
    if (v.quality === "natural") s += 4;
    if (lang === "en-in" || lang === "en-gb") s += 3;
    else if (lang === "en-us") s += 2;
    else if (lang.startsWith("en")) s += 1;
    if (MALE.test(v.name)) s -= 6;
    return s;
  };
  return voices.filter((v) => v.lang.toLowerCase().startsWith("en")).sort((a, b) => score(b) - score(a));
}

export function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+(?=[A-Z"'‘“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export class BrowserTTS implements TTSProvider {
  readonly id = "browser-speech-synthesis";
  readonly canPause = true;
  private generation = 0;
  private voicesCache: SpeechSynthesisVoice[] = [];

  isSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined";
  }

  private get synth() {
    return window.speechSynthesis;
  }

  loadVoices(): Promise<TTSVoice[]> {
    if (!this.isSupported()) return Promise.resolve([]);
    return new Promise((resolve) => {
      const done = () => {
        this.voicesCache = this.synth.getVoices();
        resolve(this.voicesCache.map(describe));
      };
      if (this.synth.getVoices().length) return done();
      const onChange = () => {
        this.synth.removeEventListener("voiceschanged", onChange);
        done();
      };
      this.synth.addEventListener("voiceschanged", onChange);
      // Some browsers never fire voiceschanged; resolve with whatever exists after a short wait.
      window.setTimeout(() => {
        this.synth.removeEventListener("voiceschanged", onChange);
        done();
      }, 1500);
    });
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<SpeakResult> {
    if (!this.isSupported()) return "failed";
    this.cancel();
    const gen = ++this.generation;
    if (!this.voicesCache.length) this.voicesCache = this.synth.getVoices();
    const voice = this.voicesCache.find((v) => v.voiceURI === options.voiceId);
    const sentences = splitSentences(text);
    // Chrome can get stuck "paused" after a previous pause; resuming first is harmless elsewhere.
    this.synth.resume();

    for (let i = 0; i < sentences.length; i++) {
      if (gen !== this.generation) return "cancelled";
      const result = await new Promise<SpeakResult | "next">((resolve) => {
        const u = new SpeechSynthesisUtterance(sentences[i]);
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        } else u.lang = "en-US";
        u.rate = options.rate ?? 0.97;
        u.pitch = 1; // keep the voice's natural pitch
        u.volume = options.volume ?? 1;
        u.onstart = () => {
          if (i === 0 && gen === this.generation) options.onStart?.();
        };
        u.onend = () => resolve(gen === this.generation ? "next" : "cancelled");
        u.onerror = (e) => {
          if (gen !== this.generation || e.error === "interrupted" || e.error === "canceled") return resolve("cancelled");
          resolve(e.error === "not-allowed" ? "blocked" : "failed");
        };
        this.synth.speak(u);
      });
      if (result !== "next") return result;
      // Brief, natural pause between sentences.
      if (i < sentences.length - 1) await new Promise((r) => setTimeout(r, 160));
    }
    return gen === this.generation ? "completed" : "cancelled";
  }

  pause() {
    if (this.isSupported()) this.synth.pause();
  }
  resume() {
    if (this.isSupported()) this.synth.resume();
  }
  cancel() {
    this.generation++;
    if (this.isSupported()) this.synth.cancel();
  }
}

let instance: BrowserTTS | null = null;
export const getBrowserTTS = () => (instance ??= new BrowserTTS());
