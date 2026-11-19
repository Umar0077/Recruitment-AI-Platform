import React, { StrictMode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceInterview } from "@/components/interview/voice-interview";
import { useAudioSettings } from "@/hooks/speech/use-audio-settings";
import { useTextToSpeech } from "@/hooks/speech/use-text-to-speech";
import { useSpeechRecognition } from "@/hooks/speech/use-speech-recognition";
import { cleanTranscript } from "@/services/speech/transcript";
const { mic } = vi.hoisted(() => ({ mic: { open: vi.fn(), close: vi.fn(), getLevel: () => 0, devices: [], support: {}, applied: {}, status: "off", stream: { current: null } } }));
vi.mock("@/hooks/speech/use-microphone", () => ({ useMicrophone: () => mic }));
vi.mock("next/dynamic", () => ({ default: () => () => <div /> }));
vi.mock("@/components/ui/overlays", () => ({ Tooltip: ({ children }) => children, Drawer: ({ open, children }) => open ? <div>{children}</div> : null, Select: ({ label, value, onValueChange, options }) => <select aria-label={label} value={value} onChange={e => onValueChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> }));
vi.mock("@/components/interview/parts", () => ({ AudioWaveform: () => null, CameraPreview: () => null, InterviewProgress: () => null, ResponseTimer: ({ remaining, total }) => <span data-testid="timer">{remaining}/{total}</span> }));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/ui/brand", () => ({ BrandMark: () => <svg />, AppLogo: () => null }));
vi.mock("@/components/ui/powered-by", () => ({ PoweredByConnectivo: () => null }));
vi.mock("@/components/motion", () => ({ EASE: [0,0,1,1] }));
vi.mock("motion/react", () => ({ AnimatePresence: ({ children }) => children, useReducedMotion: () => true, motion: { div: ({ children, initial, animate, exit, transition, ...props }) => <div {...props}>{children}</div>, span: ({ children, initial, animate, exit, transition, ...props }) => <span {...props}>{children}</span> } }));
let recs, spoken, synth;
class Recognition { constructor() { recs.push(this); } start = vi.fn(); stop = vi.fn(); abort = vi.fn(); }
class Utterance { constructor(text) { this.text = text; } }
const question = { id: "fictional-q1", number: 1, category: "Practice", text: "Describe a fictional project.", responseSeconds: 2 };
const segment = (text, final = false) => Object.assign([{ transcript: text }], { isFinal: final });
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const setup = props => render(<VoiceInterview variant="embedded" questions={[question]} candidateName="Fictional tester" roleTitle="Practice" responseSeconds={99} onComplete={vi.fn()} {...props} />);
async function begin() { fireEvent.click(screen.getByRole("button", { name: "Start Voice Interview" })); await flush(); }
async function answer(text = "i used react", final = false) {
  fireEvent.click(screen.getByRole("button", { name: "Start recording answer" })); await flush(); await act(async () => recs[0].onstart());
  act(() => recs[0].onresult({ resultIndex: 0, results: [segment(text, final)] }));
  fireEvent.click(screen.getByRole("button", { name: "Stop recording answer" })); await act(async () => recs[0].onend());
}
beforeEach(() => {
  vi.useFakeTimers(); recs = []; spoken = []; mic.open.mockReset().mockResolvedValue(true); mic.close.mockReset();
  useAudioSettings.setState({ muted: true, lang: "en-US", maxRestarts: 0, maxAlternatives: 3, rate: .95, pitch: 1, volume: 1 });
  window.SpeechRecognition = Recognition; window.SpeechSynthesisUtterance = Utterance;
  synth = Object.assign(new EventTarget(), { getVoices: () => [{ voiceURI: "aria", name: "Aria", lang: "en-US" }], speak: vi.fn(u => spoken.push(u)), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() }); window.speechSynthesis = synth;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); delete window.SpeechRecognition; delete window.SpeechSynthesisUtterance; delete window.speechSynthesis; vi.useRealTimers(); });
describe("candidate answer lifecycle with mocked browser events", () => {
  it("preserves original, previews formatting, requires confirmation, and submits one snapshot", async () => {
    let resolveSave; const save = vi.fn(() => new Promise(resolve => { resolveSave = resolve; })); setup({ onAnswerConfirmed: save }); await begin(); await answer();
    expect(screen.getByRole("textbox", { name: "Your answer" }).value).toBe("i used react"); expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use formatted version" })); expect(screen.getByRole("textbox").value).toBe("I used react.");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "I used React in a fictional project." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Submit" })); fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
    expect(save).toHaveBeenCalledTimes(1); expect(save.mock.calls[0].slice(1)).toEqual(["I used React in a fictional project.", expect.any(Number), "voice", { originalTranscript: "", interimTranscript: "i used react", cleanedTranscript: "I used react.", hasUnfinalized: true, language: "en-US", cleanupVersion: "format-v2-final-separated" }]);
    expect(screen.getByRole("textbox").readOnly).toBe(true); expect(screen.getByRole("button", { name: "Start recording answer" }).disabled).toBe(true);
    await act(async () => resolveSave()); await act(async () => { await vi.advanceTimersByTimeAsync(5); });
  });
  it("keeps the draft after synchronous or asynchronous save failure", async () => {
    const save = vi.fn().mockImplementationOnce(() => { throw new Error("Fictional network error"); }).mockRejectedValueOnce(new Error("Fictional retry error")); setup({ onAnswerConfirmed: save }); await begin(); await answer("kept words", true);
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Submit" })); await flush(); expect(screen.getByRole("textbox").value).toBe("kept words");
    fireEvent.click(screen.getByRole("button", { name: "Retry Saving" })); await flush(); expect(save).toHaveBeenCalledTimes(2); expect(screen.getByRole("textbox").value).toBe("kept words");
  });
  it("retains voice provenance when re-recording is cancelled and the candidate finishes by typing", async () => {
    const save = vi.fn().mockResolvedValue(undefined); setup({ onAnswerConfirmed: save }); await begin(); await answer("original spoken words", true);
    let resolveMic; mic.open.mockImplementationOnce(() => new Promise(resolve => { resolveMic = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Record answer again" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel microphone start" }));
    await act(async () => resolveMic(false));
    fireEvent.click(screen.getByRole("button", { name: "Prefer to type? Type your answer instead" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Candidate edited answer." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Submit" })); await flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0].slice(1)).toEqual(["Candidate edited answer.", expect.any(Number), "typed", { originalTranscript: "original spoken words", interimTranscript: undefined, cleanedTranscript: "Original spoken words.", hasUnfinalized: false, language: "en-US", cleanupVersion: "format-v2-final-separated" }]);
  });
  it("returns exhausted or failed recognition to review, including interim words", async () => {
    setup(); await begin(); fireEvent.click(screen.getByRole("button", { name: "Start recording answer" })); await flush(); await act(async () => recs[0].onstart());
    act(() => recs[0].onresult({ resultIndex: 0, results: [segment("not yet final")] })); await act(async () => recs[0].onend());
    expect(screen.getByRole("textbox").value).toBe("not yet final"); expect(screen.queryByRole("button", { name: "Stop recording answer" })).toBeNull();
  });
  it("uses each question's time limit and retains words on timeout", async () => {
    setup(); await begin(); expect(screen.getByTestId("timer").textContent).toBe("2/2"); fireEvent.click(screen.getByRole("button", { name: "Start recording answer" })); await flush(); await act(async () => recs[0].onstart());
    act(() => recs[0].onresult({ resultIndex: 0, results: [segment("last words")] })); await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); expect(recs[0].stop).toHaveBeenCalledTimes(1); await act(async () => recs[0].onend()); expect(screen.getByRole("textbox").value).toBe("last words");
  });
  it("does not start recognition after a pending microphone start is cancelled", async () => {
    let resolve; mic.open.mockImplementation(() => new Promise(r => { resolve = r; })); setup(); await begin(); fireEvent.click(screen.getByRole("button", { name: "Start recording answer" })); fireEvent.click(screen.getByRole("button", { name: "Cancel microphone start" })); await act(async () => resolve(true)); expect(recs).toHaveLength(0); expect(mic.close).toHaveBeenCalled();
  });
  it("invokes TTS from the click, blocks mic until end, and ignores cancelled replay completion", async () => {
    useAudioSettings.setState({ muted: false }); setup(); fireEvent.click(screen.getByRole("button", { name: "Start Voice Interview" })); expect(spoken).toHaveLength(1); expect(screen.getByRole("button", { name: "Start recording answer" }).disabled).toBe(true);
    act(() => spoken[0].onstart()); const lateEnd = spoken[0].onend; fireEvent.click(screen.getByRole("button", { name: "Replay" })); await flush(); lateEnd(); expect(screen.getByRole("button", { name: "Start recording answer" }).disabled).toBe(true);
    await act(async () => spoken[1].onend()); expect(screen.getByRole("button", { name: "Start recording answer" }).disabled).toBe(false);
  });
  it("offers Enable Audio after autoplay denial and recovers from mute", async () => {
    useAudioSettings.setState({ muted: false }); setup(); await begin(); await act(async () => spoken[0].onerror({ error: "not-allowed" })); fireEvent.click(screen.getByRole("button", { name: "Enable Audio" })); act(() => spoken[1].onstart());
    fireEvent.click(screen.getByRole("button", { name: "Mute interviewer" })); await flush(); expect(screen.getByRole("button", { name: "Start recording answer" }).disabled).toBe(false);
  });
  it("never allows voice testing to overlap candidate recognition", async () => {
    setup(); await begin(); fireEvent.click(screen.getByRole("button", { name: "Start recording answer" })); await flush(); await act(async () => recs[0].onstart()); fireEvent.click(screen.getByRole("button", { name: "Audio settings" })); expect(screen.getByRole("button", { name: "Test Interviewer Voice" }).disabled).toBe(true);
  });
});
describe("hook and formatting safeguards", () => {
  it("keeps TTS ready in Strict Mode and ignores an old cancelled result", async () => {
    const { result, unmount } = renderHook(() => useTextToSpeech(), { wrapper: StrictMode }); await flush(); expect(result.current.status).toBe("ready"); let one, two;
    act(() => { one = result.current.speak("One."); two = result.current.speak("Two."); }); await act(async () => { await one; }); expect(result.current.status).toBe("preparing"); act(() => spoken[1].onstart()); expect(result.current.status).toBe("speaking"); unmount(); expect(await two).toBe("cancelled");
  });
  it("settles recognition startup on unmount and detaches late callbacks", async () => {
    const { result, unmount } = renderHook(() => useSpeechRecognition()); let pending; act(() => { pending = result.current.start(); }); unmount(); expect(await pending).toBe(false); expect(recs[0].onstart).toBeNull();
  });
  it("formats without correcting technical mistakes or removing uncertainty", () => {
    expect(cleanTranscript("  i think  postgres is a frontend framework  ")).toBe("I think postgres is a frontend framework."); expect(cleanTranscript("maybe react? ")).toBe("Maybe react?"); expect(cleanTranscript("um um node js")).toBe("Um um node js."); expect(cleanTranscript(" ")).toBe("");
  });
});
