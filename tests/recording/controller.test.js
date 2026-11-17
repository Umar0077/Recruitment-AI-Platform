import { Blob } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordingController, contain } from "@/services/recording/controller";
import { apiRequest } from "@/lib/api/client";
vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn(), ApiError: class extends Error {} }));
let sources, media, canvas, changes, controller, recorderCount;
const policy = { available: true, policyReference: "fictional-test-policy", retentionDays: 1, cameraEnabled: true, monitoringEnabled: true, screenRequirement: "selected_surface", width: 1280, height: 720, fps: 20, videoBitsPerSecond: 1800000, partBytes: 5 * 1024 * 1024, maxBytes: 20 * 1024 * 1024 };
function track(kind, surface) { return Object.assign(new EventTarget(), { kind, readyState: "live", getSettings: () => ({ displaySurface: surface }), stop: vi.fn(function () { this.readyState = "ended"; }) }); }
class Stream {
  constructor(tracks) { this.tracks = tracks; }
  getTracks() { return this.tracks; } getAudioTracks() { return this.tracks.filter(t => t.kind === "audio"); } getVideoTracks() { return this.tracks.filter(t => t.kind === "video"); }
}
class Recorder {
  static isTypeSupported(type) { return type.includes("vp8"); }
  constructor() { recorderCount++; this.state = "inactive"; }
  start() { this.state = "recording"; } pause() { this.state = "paused"; } resume() { this.state = "recording"; }
  stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable({ data: new Blob(["fictional media"]) }); this.onstop(); }); }
}
beforeEach(() => {
  sources = [new Stream([track("video", "browser")]), new Stream([track("video"), track("audio")])]; recorderCount = 0; changes = [];
  media = { getDisplayMedia: vi.fn().mockResolvedValue(sources[0]), getUserMedia: vi.fn().mockResolvedValue(sources[1]) };
  vi.stubGlobal("Blob", Blob); vi.stubGlobal("MediaStream", Stream); vi.stubGlobal("MediaRecorder", Recorder); vi.stubGlobal("navigator", { mediaDevices: media });
  const node = () => ({ connect: vi.fn(function () { return this; }), gain: { value: 1 }, stream: new Stream([track("audio")]) });
  vi.stubGlobal("AudioContext", class { createMediaStreamDestination = node; createDynamicsCompressor = node; createMediaStreamSource = node; createGain = node; resume = vi.fn().mockResolvedValue(); close = vi.fn().mockResolvedValue(); });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  canvas = { captureStream: () => new Stream([track("video")]), getContext: () => ({ fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn() }) };
  apiRequest.mockImplementation(async path => ({ data: path === "/recordings" ? { id: "fictional-recording", status: "RECORDING" } : path.endsWith("/parts") ? { url: "https://storage.example.test/part" } : { status: "UPLOADED" } }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ ETag: "fictional" }) }));
  controller = new RecordingController("fictional-session", policy, s => changes.push(s), vi.fn());
});
afterEach(() => { controller.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("does not request any device or record on construction", () => { expect(media.getDisplayMedia).not.toHaveBeenCalled(); expect(media.getUserMedia).not.toHaveBeenCalled(); expect(recorderCount).toBe(0); });
it("requires a separate explicit device action after screen selection", async () => {
  await controller.prepare(canvas, false);
  expect(controller.snapshot.state).toBe("SCREEN_READY"); expect(media.getUserMedia).not.toHaveBeenCalled();
  await Promise.all([controller.enableDevices(canvas), controller.enableDevices(canvas)]);
  expect(media.getUserMedia).toHaveBeenCalledTimes(1); expect(controller.snapshot.state).toBe("CAPTURE_READY");
});
it("releases devices returned after screen sharing stops during their permission prompt", async () => {
  await controller.prepare(canvas, false);
  let resolve; media.getUserMedia.mockReturnValue(new Promise(r => { resolve = r; }));
  const enabling = controller.enableDevices(canvas);
  sources[0].getVideoTracks()[0].dispatchEvent(new Event("ended")); resolve(sources[1]); await enabling;
  expect(controller.snapshot.state).toBe("FAILED"); expect(sources.every(s => s.getTracks().every(t => t.readyState === "ended"))).toBe(true);
});
it("refuses start when required microphone tracks have ended", async () => {
  await controller.prepare(canvas, false); await controller.enableDevices(canvas); sources[1].getAudioTracks()[0].readyState = "ended";
  await controller.start(true); expect(controller.snapshot.state).toBe("FAILED"); expect(controller.snapshot.message).toMatch(/no longer active/); expect(apiRequest).not.toHaveBeenCalled();
});
it("previews chosen sources and starts/stops only once despite repeated clicks", async () => {
  await controller.prepare(canvas, false); await controller.enableDevices(canvas); expect(controller.snapshot.state).toBe("CAPTURE_READY"); expect(recorderCount).toBe(0);
  expect(media.getDisplayMedia.mock.calls[0][0].audio).toBe(false);
  await Promise.all([controller.start(true), controller.start(true)]); expect(recorderCount).toBe(1);
  await Promise.all([controller.finish(), controller.finish()]); expect(controller.snapshot.state).toBe("UPLOADED");
  expect(apiRequest.mock.calls.filter(([p]) => p.endsWith("/complete"))).toHaveLength(1); expect(sources.every(s => s.getTracks().every(t => t.readyState === "ended"))).toBe(true);
});
it.each(["screen", "camera/microphone"])("handles %s denial without leaving devices active", async kind => {
  media[kind === "screen" ? "getDisplayMedia" : "getUserMedia"].mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  await controller.prepare(canvas, false); await controller.enableDevices(canvas); expect(controller.snapshot.state).toBe("FAILED"); expect(controller.snapshot.message).toMatch(/declined/); expect(recorderCount).toBe(0);
  if (kind !== "screen") expect(sources[0].getTracks()[0].stop).toHaveBeenCalled();
});
it("rejects a tab when full display is required and releases it", async () => {
  controller = new RecordingController("fictional", { ...policy, screenRequirement: "full_display" }, vi.fn(), vi.fn()); await controller.prepare(canvas, false); await controller.enableDevices(canvas);
  expect(controller.snapshot.state).toBe("FAILED"); expect(media.getUserMedia).not.toHaveBeenCalled(); expect(sources[0].getTracks()[0].stop).toHaveBeenCalled();
});
it("releases streams returned after cancellation while permission was pending", async () => {
  let resolve; media.getDisplayMedia.mockReturnValue(new Promise(r => { resolve = r; })); const preparing = controller.prepare(canvas, false); controller.dispose(); resolve(sources[0]); await preparing;
  expect(sources[0].getTracks()[0].stop).toHaveBeenCalled(); expect(media.getUserMedia).not.toHaveBeenCalled();
});
it("stops and saves available media after source interruption", async () => {
  await controller.prepare(canvas, false); await controller.enableDevices(canvas); await controller.start(true); sources[0].getVideoTracks()[0].dispatchEvent(new Event("ended")); await controller.finish();
  expect(changes.some(s => s.state === "INTERRUPTED")).toBe(true); expect(controller.snapshot.state).toBe("UPLOADED");
  expect(apiRequest.mock.calls.some(([p, o]) => p.endsWith("/events") && o.body.type === "SCREEN_SHARE_STOPPED")).toBe(true);
});
it("does not claim saved before backend completion verification, and can retry verification", async () => {
  await controller.prepare(canvas, false); await controller.enableDevices(canvas); await controller.start(false);
  const base = apiRequest.getMockImplementation(); apiRequest.mockImplementation((path, opts) => path.endsWith("/complete") ? Promise.reject(new Error("Storage verification failed")) : base(path, opts));
  await expect(controller.finish()).rejects.toThrow(); expect(controller.snapshot.state).toBe("FAILED"); expect(sources.every(s => s.getTracks().every(t => t.readyState === "ended"))).toBe(true);
  apiRequest.mockImplementation(base); await controller.finish(); expect(controller.snapshot.state).toBe("UPLOADED");
  expect(apiRequest.mock.calls.filter(([p]) => p.endsWith("/events"))).toHaveLength(0);
});
it("provides an unsupported format fallback before asking permissions", async () => { vi.spyOn(Recorder, "isTypeSupported").mockReturnValue(false); await controller.prepare(canvas, false); await controller.enableDevices(canvas); expect(controller.snapshot.state).toBe("FAILED"); expect(media.getDisplayMedia).not.toHaveBeenCalled(); });
it("contains camera and screen frames without stretching", () => { expect(contain(1920, 1080, 0, 0, 1280, 720)).toEqual([0, 0, 1280, 720]); expect(contain(640, 480, 0, 0, 256, 144)).toEqual([32, 0, 192, 144]); });
