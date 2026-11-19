import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserTTS, rankVoices } from "@/services/speech/browser-tts";
let provider, synth, voices, spoken;
const english = { voiceURI: "aria", name: "Microsoft Aria Natural", lang: "en-US", localService: true };
class Utterance { constructor(text) { this.text = text; } }
beforeEach(() => {
  vi.useFakeTimers(); spoken = []; voices = [english];
  synth = Object.assign(new EventTarget(), { getVoices: () => voices, speak: vi.fn(u => spoken.push(u)), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() });
  window.speechSynthesis = synth; window.SpeechSynthesisUtterance = Utterance; provider = new BrowserTTS();
});
afterEach(() => { provider.cancel(); delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; vi.useRealTimers(); });
describe("browser TTS lifecycle", () => {
  it("speaks immediately with portable defaults and completes only on end", async () => {
    const start = vi.fn(), promise = provider.speak("Fictional question?", { onStart: start });
    expect(spoken).toHaveLength(1); expect(spoken[0]).toMatchObject({ rate: .95, pitch: 1, volume: 1, lang: "en-US", voice: english });
    spoken[0].onstart(); expect(start).toHaveBeenCalledTimes(1); spoken[0].onend(); expect(await promise).toBe("completed");
  });
  it("sequences sentences from end events without a fixed gap", async () => {
    const promise = provider.speak("First sentence. Second sentence?"); spoken[0].onstart(); spoken[0].onend(); expect(spoken).toHaveLength(2); spoken[1].onend(); expect(await promise).toBe("completed");
  });
  it("settles cancellation when the browser emits no cancellation event", async () => {
    const promise = provider.speak("Cancel me."); provider.cancel(); expect(await promise).toBe("cancelled"); expect(spoken[0].onend).toBeNull(); expect(synth.cancel).toHaveBeenCalledTimes(1);
  });
  it("ignores old completion after rapid replay", async () => {
    const first = provider.speak("First."), oldEnd = spoken[0].onend; const second = provider.speak("Second.");
    expect(await first).toBe("cancelled"); oldEnd(); expect(spoken).toHaveLength(2); spoken[1].onend(); expect(await second).toBe("completed");
  });
  it("isolates owners so unmounting an old hook cannot cancel the current voice", async () => {
    const first = provider.speak("One."), other = new BrowserTTS(), second = other.speak("Two."); expect(await first).toBe("cancelled"); const count = synth.cancel.mock.calls.length;
    provider.cancel(); expect(synth.cancel).toHaveBeenCalledTimes(count); other.cancel(); expect(await second).toBe("cancelled");
  });
  it.each([["not-allowed", "blocked"], ["interrupted", "cancelled"], ["synthesis-failed", "failed"]])("handles %s without hanging", async (error, result) => {
    const promise = provider.speak("Question."); spoken[0].onerror({ error }); expect(await promise).toBe(result);
  });
  it("fails missing start/end events rather than pretending playback completed", async () => {
    const first = provider.speak("No start."); await vi.advanceTimersByTimeAsync(8000); expect(await first).toBe("failed");
    const next = provider.speak("No end."); spoken[1].onstart(); await vi.advanceTimersByTimeAsync(180000); expect(await next).toBe("failed");
  });
  it("suspends the watchdog during a deliberate pause", async () => {
    const promise = provider.speak("Pause."); spoken[0].onstart(); provider.pause(); await vi.advanceTimersByTimeAsync(190000); expect(spoken[0].onend).toBeTypeOf("function"); provider.resume(); spoken[0].onend(); expect(await promise).toBe("completed");
  });
  it("loads late voices once and removes listeners", async () => {
    voices = []; const first = provider.loadVoices(), second = provider.loadVoices(); expect(first).toBe(second);
    voices = [english]; synth.dispatchEvent(new Event("voiceschanged")); expect(await first).toMatchObject([{ id: "aria", likelyFemale: true, quality: "natural" }]); expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds voice loading when no voices arrive", async () => {
    voices = []; const pending = provider.loadVoices(); await vi.advanceTimersByTimeAsync(1500); expect(await pending).toEqual([]);
  });
  it("falls back from an unavailable saved voice and honors explicit settings", async () => {
    const promise = provider.speak("Question.", { voiceId: "missing", rate: 1.1, pitch: .8, volume: .5 }); expect(spoken[0]).toMatchObject({ voice: english, rate: 1.1, pitch: .8, volume: .5 }); provider.cancel(); await promise;
  });
  it("does not assume unknown voices have a gender or quality", async () => {
    voices = [{ ...english, voiceURI: "google", name: "Google US English" }]; expect(await provider.loadVoices()).toMatchObject([{ likelyFemale: false, quality: "standard" }]);
    expect(rankVoices([{ id: "a", name: "French", lang: "fr-FR" }])).toEqual([]);
  });
  it("prefers the selected English locale before cross-locale voice quality", () => {
    const local = { id: "us", name: "English US", lang: "en-US", likelyFemale: false, quality: "standard" };
    const remote = { id: "uk", name: "Sonia Natural", lang: "en-GB", likelyFemale: true, quality: "natural" };
    expect(rankVoices([remote, local], "en-US")[0].id).toBe("us");
  });
});
