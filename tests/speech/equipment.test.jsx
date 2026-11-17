import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Equipment from "@/app/candidate/interview/equipment/page";

const mocks = vi.hoisted(() => ({ mic: {}, stt: {}, tts: {}, router: { push: vi.fn(), prefetch: vi.fn() }, flow: { consent: true, stage: "equipment", answeredCount: 0, update: vi.fn() }, error: vi.fn(), updateFlow: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next/link", () => ({ default: ({ children, href, onClick }) => <a href={href} onClick={onClick}>{children}</a> }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, info: vi.fn() } }));
vi.mock("@/hooks/speech/use-microphone", () => ({ useMicrophone: () => mocks.mic }));
vi.mock("@/hooks/speech/use-speech-recognition", () => ({ useSpeechRecognition: () => mocks.stt }));
vi.mock("@/hooks/speech/use-text-to-speech", () => ({ useTextToSpeech: () => mocks.tts, VOICE_SAMPLE: "Fictional voice check" }));
vi.mock("@/lib/data/candidate-flow", () => ({ useCandidateFlow: () => mocks.flow }));
vi.mock("@/lib/demo/store", () => ({ useDemoStore: selector => selector({ updateFlow: mocks.updateFlow }) }));
vi.mock("@/lib/config/environment", () => ({ isApiMode: true }));
vi.mock("@/components/candidate/flow-gate", () => ({ useFlowGate: () => null }));
vi.mock("@/components/candidate/shell", () => ({ CandidateShell: ({ children }) => children, HelpDialog: () => null }));
vi.mock("@/components/ui/primitives", () => ({ GlassCard: ({ children }) => <div>{children}</div>, CardHeader: ({ title }) => <h2>{title}</h2> }));
vi.mock("@/components/interview/voice-controls", () => ({ LiveLevelMeter: () => null }));
vi.mock("@/components/interview/parts", () => ({ CameraPreview: () => null }));
vi.mock("@/components/interview/audio-settings", () => ({ AudioSettingsPanel: ({ onTestVoice, testDisabled }) => <button disabled={testDisabled} onClick={() => onTestVoice("Fictional settings sample")}>Settings voice sample</button> }));

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
let media, instances;
class FakeRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  constructor() { instances.push(this); }
  start = vi.fn(() => { this.state = "recording"; });
  stop = vi.fn(() => { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["fictional audio"]) }); this.onstop?.(); });
}
beforeEach(() => {
  vi.useFakeTimers(); instances = [];
  Object.assign(mocks.mic, { status: "active", lowInput: false, label: "Fictional mic", stream: { current: {} }, getLevel: () => 0, devices: [], support: {}, applied: {}, close: vi.fn(), open: vi.fn(), selectDevice: vi.fn() });
  Object.assign(mocks.stt, { supported: true, status: "idle", start: vi.fn().mockResolvedValue(true), stop: vi.fn().mockResolvedValue("fictional sentence"), abort: vi.fn() });
  Object.assign(mocks.tts, { supported: true, status: "ready", voices: [], speak: vi.fn().mockResolvedValue("completed"), cancel: vi.fn() });
  media = { getUserMedia: vi.fn() }; vi.stubGlobal("navigator", { mediaDevices: media, onLine: true });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  URL.createObjectURL = vi.fn().mockReturnValue("blob:fictional"); URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("equipment checks release local resources", () => {
  it("deduplicates camera permission requests and releases a stream arriving after unmount", async () => {
    const pending = deferred(), stop = vi.fn(); media.getUserMedia.mockReturnValue(pending.promise);
    const view = render(<Equipment />);
    fireEvent.click(screen.getByRole("button", { name: "Test camera" }));
    fireEvent.click(screen.getByRole("button", { name: "Test camera" }));
    expect(media.getUserMedia).toHaveBeenCalledTimes(1); view.unmount();
    await act(async () => { pending.resolve({ getTracks: () => [{ stop }] }); await pending.promise; });
    expect(stop).toHaveBeenCalledTimes(1); expect(mocks.error).not.toHaveBeenCalled();
  });
  it("cancels pending speech startup and never starts its five-second timer after leaving", async () => {
    const pending = deferred(); mocks.stt.start.mockReturnValue(pending.promise);
    const view = render(<Equipment />);
    fireEvent.click(screen.getByRole("button", { name: "Run speech check" }));
    fireEvent.click(screen.getByRole("button", { name: "Run speech check" }));
    expect(mocks.stt.start).toHaveBeenCalledTimes(1); view.unmount();
    await act(async () => { pending.resolve(true); await pending.promise; vi.advanceTimersByTime(6000); });
    expect(mocks.stt.abort).toHaveBeenCalled(); expect(mocks.stt.stop).not.toHaveBeenCalled();
  });
  it("locks voice/recording during recognition and cancels recognition timers explicitly", async () => {
    render(<Equipment />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Run speech check" })); });
    expect(screen.getByRole("button", { name: "Test Interviewer Voice" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Settings voice sample" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Record 5-second test" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Test Interviewer Voice" })); expect(mocks.tts.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel speech check" }));
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(mocks.stt.stop).not.toHaveBeenCalled(); expect(screen.getByRole("button", { name: "Test Interviewer Voice" }).disabled).toBe(false);
  });
  it("stops an active recorder and detaches delayed callbacks on unmount", async () => {
    const view = render(<Equipment />);
    fireEvent.click(screen.getByRole("button", { name: "Record 5-second test" }));
    const recorder = instances[0], delayedStop = recorder.onstop;
    expect(screen.getByRole("button", { name: "Settings voice sample" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Run speech check" }).disabled).toBe(true);
    view.unmount();
    await act(async () => { delayedStop(); vi.advanceTimersByTime(6000); });
    expect(recorder.stop).toHaveBeenCalledTimes(1); expect(recorder.onstop).toBeNull(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("revokes the local clip and stops camera, voice, speech and microphone before navigation", async () => {
    const stop = vi.fn(); media.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
    render(<Equipment />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Test camera" })); });
    fireEvent.click(screen.getByRole("button", { name: "Record 5-second test" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Continue to Practice" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fictional"); expect(stop).toHaveBeenCalledTimes(1);
    expect(mocks.stt.abort).toHaveBeenCalled(); expect(mocks.tts.cancel).toHaveBeenCalled(); expect(mocks.mic.close).toHaveBeenCalled();
    expect(mocks.router.push).toHaveBeenCalledWith("/candidate/interview/practice");
  });
  it("handles recorder failures and late TTS completion without stale notifications", async () => {
    const pending = deferred(); mocks.tts.speak.mockReturnValue(pending.promise);
    const view = render(<Equipment />);
    fireEvent.click(screen.getByRole("button", { name: "Record 5-second test" }));
    act(() => { instances[0].onerror(); });
    expect(mocks.error).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Record 5-second test" }).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Test Interviewer Voice" })); view.unmount();
    await act(async () => { pending.resolve("failed"); await pending.promise; });
    expect(mocks.error).toHaveBeenCalledTimes(1); expect(instances[0].stop).toHaveBeenCalledTimes(1);
  });
});
