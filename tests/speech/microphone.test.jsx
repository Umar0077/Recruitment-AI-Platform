import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMicrophone } from "@/hooks/speech/use-microphone";
import { useAudioSettings } from "@/hooks/speech/use-audio-settings";
import { createLevelMeter } from "@/services/speech/audio-quality";
import { openMicrophone } from "@/services/speech/audio-devices";

vi.mock("@/services/speech/audio-quality", () => ({ createLevelMeter: vi.fn() }));
let media;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function stream(id = "fictional-mic") {
  const track = Object.assign(new EventTarget(), { readyState: "live", label: "Fictional microphone", getSettings: () => ({ deviceId: id }), stop: vi.fn() });
  vi.spyOn(track, "removeEventListener");
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}
beforeEach(() => {
  useAudioSettings.setState({ micDeviceId: undefined });
  media = Object.assign(new EventTarget(), { getUserMedia: vi.fn(), enumerateDevices: vi.fn().mockResolvedValue([]), getSupportedConstraints: () => ({}) });
  vi.stubGlobal("navigator", { mediaDevices: media });
  createLevelMeter.mockReturnValue({ level: 0, stop: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("microphone ownership and pending permission requests", () => {
  it("bounds unanswered permission prompts and releases a late stream", async () => {
    vi.useFakeTimers();
    const request = deferred(), input = stream(); media.getUserMedia.mockReturnValue(request.promise);
    const hook = renderHook(useMicrophone); let opening;
    act(() => { opening = hook.result.current.open(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(await opening).toBe(false); expect(hook.result.current.status).toBe("error");
    expect(hook.result.current.error).toMatch(/permission was not completed/);
    await act(async () => { request.resolve(input); await request.promise; });
    expect(input.track.stop).toHaveBeenCalledTimes(1); expect(hook.result.current.stream.current).toBeNull();
  });
  it("shares duplicate requests and releases the stream on unmount", async () => {
    const request = deferred(), input = stream(); media.getUserMedia.mockReturnValue(request.promise);
    const hook = renderHook(useMicrophone); let first, second;
    act(() => { first = hook.result.current.open(); second = hook.result.current.open(); });
    expect(first).toBe(second); expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    await act(async () => { request.resolve(input); expect(await first).toBe(true); });
    hook.unmount(); expect(input.track.stop).toHaveBeenCalledTimes(1); expect(input.track.removeEventListener).toHaveBeenCalledWith("ended", expect.any(Function));
  });
  it("settles cancellation immediately and stops a permission result arriving after unmount", async () => {
    const request = deferred(), input = stream(); media.getUserMedia.mockReturnValue(request.promise);
    const hook = renderHook(useMicrophone); let opening;
    act(() => { opening = hook.result.current.open(); }); hook.unmount(); expect(await opening).toBe(false);
    await act(async () => { request.resolve(input); await request.promise; });
    expect(input.track.stop).toHaveBeenCalledTimes(1); expect(createLevelMeter).not.toHaveBeenCalled();
  });
  it("a cancelled old result cannot replace a newer microphone", async () => {
    const oldRequest = deferred(), oldInput = stream("old"), nextInput = stream("next");
    media.getUserMedia.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(nextInput);
    const hook = renderHook(useMicrophone); let old;
    act(() => { old = hook.result.current.open("old"); hook.result.current.close(); });
    await act(async () => { expect(await hook.result.current.open("next")).toBe(true); oldRequest.resolve(oldInput); await oldRequest.promise; });
    expect(await old).toBe(false); expect(hook.result.current.stream.current).toBe(nextInput); expect(oldInput.track.stop).toHaveBeenCalledTimes(1); expect(nextInput.track.stop).not.toHaveBeenCalled();
  });
  it("retains a working stream when optional metering or enumeration fails", async () => {
    const input = stream(); media.getUserMedia.mockResolvedValue(input); media.enumerateDevices.mockRejectedValue(new Error("Unavailable")); createLevelMeter.mockImplementation(() => { throw new Error("AudioContext unavailable"); });
    const hook = renderHook(useMicrophone);
    await act(async () => { expect(await hook.result.current.open()).toBe(true); });
    expect(hook.result.current.status).toBe("active"); expect(hook.result.current.getLevel()).toBe(0); expect(input.track.stop).not.toHaveBeenCalled();
  });
  it("cleans up ended handlers and diagnostics on device disconnection", async () => {
    const input = stream(), meter = { level: 0, stop: vi.fn() }; createLevelMeter.mockReturnValue(meter); media.getUserMedia.mockResolvedValue(input);
    const hook = renderHook(useMicrophone); await act(async () => { await hook.result.current.open(); });
    act(() => { input.track.dispatchEvent(new Event("ended")); });
    expect(hook.result.current.status).toBe("in-use"); expect(hook.result.current.stream.current).toBeNull(); expect(meter.stop).toHaveBeenCalledTimes(1); expect(input.track.removeEventListener).toHaveBeenCalled();
    act(() => { input.track.dispatchEvent(new Event("ended")); }); expect(meter.stop).toHaveBeenCalledTimes(1);
  });
  it("does not retry the default device after cancellation", async () => {
    const request = deferred(); media.getUserMedia.mockReturnValue(request.promise);
    const hook = renderHook(useMicrophone); let opening;
    act(() => { opening = hook.result.current.open("missing"); hook.result.current.close(); });
    await act(async () => { request.reject(new DOMException("Unplugged", "OverconstrainedError")); expect(await opening).toBe(false); });
    expect(media.getUserMedia).toHaveBeenCalledTimes(1); expect(hook.result.current.status).toBe("off");
  });
  it("falls back once for a removed saved device while request remains active", async () => {
    const input = stream(); media.getUserMedia.mockRejectedValueOnce(new DOMException("Unplugged", "OverconstrainedError")).mockResolvedValueOnce(input);
    const hook = renderHook(useMicrophone); await act(async () => { expect(await hook.result.current.open("missing")).toBe(true); });
    expect(media.getUserMedia).toHaveBeenCalledTimes(2); expect(media.getUserMedia.mock.calls[1][0].audio.deviceId).toBeUndefined();
  });
  it("releases malformed streams when track metadata cannot be read", async () => {
    const input = stream(); input.track.getSettings = () => { throw new Error("Track ended"); }; media.getUserMedia.mockResolvedValue(input);
    await expect(openMicrophone()).rejects.toThrow("Track ended"); expect(input.track.stop).toHaveBeenCalledTimes(1);
  });
});
