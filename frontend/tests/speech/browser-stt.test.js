import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserSTT } from "@/services/speech/browser-stt";
let instances, provider;
class Recognition {
  constructor() { instances.push(this); }
  start = vi.fn(); stop = vi.fn(); abort = vi.fn();
}
const segment = (text, final = false) => Object.assign([{ transcript: text }], { isFinal: final });
const results = (rec, index, ...values) => rec.onresult?.({ resultIndex: index, results: values });
beforeEach(() => { vi.useFakeTimers(); instances = []; window.SpeechRecognition = Recognition; provider = new BrowserSTT(); });
afterEach(() => { provider.abort(); delete window.SpeechRecognition; vi.useRealTimers(); });
describe("browser STT lifecycle and transcript integrity", () => {
  it("retains raw final spacing and separates unfinalized words with a confidence review hint", () => {
    provider.start({ lang: "en-IN" }); const r = instances[0];
    const final = Object.assign([{ transcript: "  I did not sell 12.5%  ", confidence: 0.4 }], { isFinal: true });
    results(r, 0, final, segment("maybe thirty"));
    expect(provider.snapshot).toMatchObject({ rawFinalText: "  I did not sell 12.5%  ", interimText: "maybe thirty", lowConfidence: true });
    results(r, 0, Object.assign([{ transcript: "CRM", confidence: 0 }], { isFinal: true }));
    expect(provider.snapshot.lowConfidence).toBe(false);
  });
  it("locks the starting phase and configures continuous interim English recognition", () => {
    provider.start({ lang: "en-US" }); provider.start({ lang: "en-GB" }); expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({ continuous: true, interimResults: true, maxAlternatives: 3, lang: "en-US" }); expect(provider.isActive).toBe(true);
  });
  it("replaces interim segments and deduplicates repeated finals by result index", () => {
    provider.start({ lang: "en-US" }); const r = instances[0]; r.onstart();
    results(r, 0, segment("I work")); results(r, 0, segment("I work with React", true)); results(r, 0, segment("I work with React", true));
    expect(provider.snapshot).toMatchObject({ finalText: "I work with React", interimText: "", hasUnfinalized: false });
  });
  it("retains unchanged interim indexes and removes interim results when the list shrinks", () => {
    provider.start({ lang: "en-GB" }); const r = instances[0];
    results(r, 0, segment("First", true), segment("second"), segment("third"));
    results(r, 2, segment("First", true), segment("second"), segment("third revised")); expect(provider.snapshot.interimText).toBe("second third revised");
    results(r, 1, segment("First", true)); expect(provider.snapshot.originalText).toBe("First");
  });
  it("preserves long-answer order through bounded restarts, including explicitly provisional words", () => {
    provider.start({ lang: "en-IN", maxRestarts: 1 }); const first = instances[0]; first.onstart(); results(first, 0, segment("Earlier words", true), segment("unfinished")); first.onend();
    const second = instances[1]; second.onstart(); results(second, 0, segment("Later words", true)); second.onend();
    expect(provider.snapshot).toMatchObject({ originalText: "Earlier words unfinished Later words", finalText: "Earlier words Later words", hasUnfinalized: true }); expect(provider.isActive).toBe(false); expect(instances).toHaveLength(2);
  });
  it("waits for final results after stop and never restarts intentional stops", async () => {
    provider.start({ lang: "en-US" }); const r = instances[0]; r.onstart(); results(r, 0, segment("tail"));
    const stop = provider.stop(); results(r, 0, segment("tail words", true)); r.onend(); expect(await stop).toBe("tail words"); expect(instances).toHaveLength(1);
  });
  it("settles stop when the browser never emits end, preserving unfinalized words", async () => {
    const error = vi.fn(); provider.start({ lang: "en-US", onError: error }); const r = instances[0]; r.onstart(); results(r, 0, segment("unsure words"));
    const stop = provider.stop(); await vi.advanceTimersByTimeAsync(2500); expect(await stop).toBe("unsure words"); expect(provider.snapshot.hasUnfinalized).toBe(true); expect(error).toHaveBeenCalledWith("timeout", expect.any(String)); expect(r.abort).toHaveBeenCalled();
  });
  it("settles an aborted stop and detaches callbacks so old sessions cannot corrupt new text", async () => {
    provider.start({ lang: "en-US" }); const old = instances[0], late = old.onresult; old.onstart(); const stopped = provider.stop(); provider.abort(); expect(await stopped).toBe("");
    provider.start({ lang: "en-US" }); const next = instances[1]; next.onstart(); results(next, 0, segment("New answer", true)); late({ resultIndex: 0, results: [segment("Stale answer", true)] });
    expect(provider.snapshot.originalText).toBe("New answer"); expect(old.onresult).toBeNull(); const stop = provider.stop(); next.onend(); expect(await stop).toBe("New answer");
  });
  it("times out a missing start event and releases the microphone owner", async () => {
    const end = vi.fn(), error = vi.fn(); provider.start({ lang: "en-US", onEnd: end, onError: error }); await vi.advanceTimersByTimeAsync(8000);
    expect(end).toHaveBeenCalledTimes(1); expect(error).toHaveBeenCalledWith("timeout", expect.any(String)); expect(provider.isActive).toBe(false);
  });
  it.each(["not-allowed", "audio-capture", "network", "language-not-supported"])("does not auto-retry %s", code => {
    provider.start({ lang: "en-US" }); instances[0].onerror({ error: code }); expect(provider.isActive).toBe(false); expect(instances).toHaveLength(1);
  });
  it("bounds repeated no-speech restarts", () => {
    provider.start({ lang: "en-US", maxRestarts: 2 });
    for (let i = 0; i < 3; i++) { instances[i].onerror({ error: "no-speech" }); instances[i].onend?.(); }
    expect(instances).toHaveLength(3); expect(provider.isActive).toBe(false);
  });
  it("uses speech/audio events only as activity signals, never as stop commands", () => {
    const speech = vi.fn(), audio = vi.fn(); provider.start({ lang: "en-US", onSpeechActivity: speech, onAudioActivity: audio }); const r = instances[0];
    r.onaudiostart(); r.onspeechstart(); r.onspeechend(); r.onaudioend(); expect(speech.mock.calls).toEqual([[true], [false]]); expect(audio.mock.calls).toEqual([[true], [false]]); expect(r.stop).not.toHaveBeenCalled();
  });
});
