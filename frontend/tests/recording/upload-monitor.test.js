import { Blob } from "node:buffer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { RecordingUpload } from "@/services/recording/upload";
import { SessionMonitor } from "@/services/recording/monitor";
beforeEach(() => vi.stubGlobal("Blob", Blob));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("uploads bounded contiguous parts, including only one short final part", async () => {
  const send = vi.fn().mockResolvedValue(undefined), uploader = new RecordingUpload(5, 100, send, vi.fn());
  uploader.append(new Blob(["12345678"])); uploader.append(new Blob(["9abc"])); await uploader.finish();
  expect(send.mock.calls.map(([n, b]) => [n, b.size])).toEqual([[1, 5], [2, 5], [3, 2]]);
  expect(uploader.uploaded).toBe(12); expect(uploader.partsCount).toBe(3); expect(uploader.pendingBytes).toBe(0);
});
it("bounds retained memory and total size even if MediaRecorder emits a large delayed blob", () => {
  const uploader = new RecordingUpload(5, 100, () => new Promise(() => {}), vi.fn());
  expect(() => uploader.append(new Blob([new Uint8Array(21)]))).toThrow(/limit/); expect(uploader.total).toBe(0);
  const limited = new RecordingUpload(5, 10, vi.fn(), vi.fn()); expect(() => limited.append(new Blob([new Uint8Array(11)]))).toThrow(/limit/);
});
it("retains failed parts for explicit retry without changing their number", async () => {
  vi.useFakeTimers(); const send = vi.fn().mockRejectedValue(new Error("offline"));
  const uploader = new RecordingUpload(5, 100, send, vi.fn()); uploader.append(new Blob(["12345"]));
  await vi.advanceTimersByTimeAsync(2000); expect(uploader.error).toBeTruthy(); expect(uploader.uploaded).toBe(0);
  send.mockResolvedValue(undefined); await uploader.finish(); expect(uploader.uploaded).toBe(5); expect(send.mock.calls.every(([n]) => n === 1)).toBe(true);
});
it("does not retain media after cancellation", async () => {
  const uploader = new RecordingUpload(5, 100, vi.fn(), vi.fn()); uploader.append(new Blob(["123"])); uploader.cancel();
  await expect(uploader.finish()).rejects.toThrow(/No recording/);
});
it("observes focus only after start, deduplicates, measures duration and detaches", () => {
  vi.useFakeTimers(); vi.spyOn(document, "hasFocus").mockReturnValue(true); const events = [], notice = vi.fn();
  const monitor = new SessionMonitor(() => "RECORDING", e => events.push(e), notice);
  window.dispatchEvent(new Event("blur")); expect(events).toHaveLength(0); monitor.start(); monitor.start();
  window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("blur")); vi.advanceTimersByTime(3000); window.dispatchEvent(new Event("focus"));
  expect(events.map(e => e.type)).toEqual(["FOCUS_LOST", "FOCUS_RESTORED"]); expect(events[1].durationMs).toBe(3000); expect(notice).toHaveBeenCalledTimes(1);
  monitor.stop(); window.dispatchEvent(new Event("blur")); expect(events).toHaveLength(2); vi.restoreAllMocks();
});
it("deduplicates tab visibility and fullscreen observations", () => {
  let hidden = false, fullscreen = null; vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden); Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreen });
  const events = []; const monitor = new SessionMonitor(() => "RECORDING", e => events.push(e), vi.fn()); monitor.start();
  hidden = true; document.dispatchEvent(new Event("visibilitychange")); document.dispatchEvent(new Event("visibilitychange")); hidden = false; document.dispatchEvent(new Event("visibilitychange"));
  fullscreen = document.body; document.dispatchEvent(new Event("fullscreenchange")); fullscreen = null; document.dispatchEvent(new Event("fullscreenchange"));
  expect(events.map(e => e.type)).toEqual(["TAB_HIDDEN", "TAB_VISIBLE", "FULLSCREEN_ENTERED", "FULLSCREEN_EXITED"]); monitor.stop(); vi.restoreAllMocks();
});
