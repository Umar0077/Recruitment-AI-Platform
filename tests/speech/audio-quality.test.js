import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLevelMeter } from "@/services/speech/audio-quality";
let context, callbacks;
beforeEach(() => {
  callbacks = [];
  vi.stubGlobal("requestAnimationFrame", vi.fn(fn => { callbacks.push(fn); return callbacks.length; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  context = { state: "suspended", resume: vi.fn().mockResolvedValue(), close: vi.fn().mockResolvedValue(), source: { connect: vi.fn(), disconnect: vi.fn() }, analyser: { fftSize: 1024, disconnect: vi.fn(), getFloatTimeDomainData: vi.fn(data => data.fill(0.1)) } };
  class Context { constructor() { return { ...context, createMediaStreamSource: () => context.source, createAnalyser: () => context.analyser }; } }
  vi.stubGlobal("AudioContext", Context);
});
afterEach(() => vi.unstubAllGlobals());
describe("optional audio diagnostics lifecycle", () => {
  it("closes once, disconnects both nodes and ignores stale animation callbacks", async () => {
    const meter = createLevelMeter({}); await Promise.resolve(); expect(meter.level).toBeGreaterThan(0); expect(callbacks).toHaveLength(1);
    meter.stop(); meter.stop(); callbacks[0]();
    expect(meter.level).toBe(0); expect(context.close).toHaveBeenCalledTimes(1); expect(context.source.disconnect).toHaveBeenCalledTimes(1); expect(context.analyser.disconnect).toHaveBeenCalledTimes(1); expect(callbacks).toHaveLength(1);
  });
  it("contains resume and close rejections without an unhandled rejection", async () => {
    context.resume.mockRejectedValue(new Error("Blocked")); context.close.mockRejectedValue(new Error("Already closed"));
    const meter = createLevelMeter({}); await Promise.resolve(); await Promise.resolve();
    expect(context.close).toHaveBeenCalledTimes(1); expect(callbacks).toHaveLength(0); expect(meter.level).toBe(0);
  });
  it("does not start metering if closed while context resume is pending", async () => {
    let resume; context.resume.mockReturnValue(new Promise(resolve => { resume = resolve; }));
    const meter = createLevelMeter({}); meter.stop(); resume(); await Promise.resolve(); expect(callbacks).toHaveLength(0);
  });
  it("contains setup and read failures while releasing AudioContext resources", async () => {
    context.source.connect.mockImplementation(() => { throw new Error("Disconnected"); });
    expect(createLevelMeter({}).level).toBe(0); expect(context.close).toHaveBeenCalledTimes(1);
    context.source.connect.mockReset(); context.analyser.getFloatTimeDomainData.mockImplementation(() => { throw new Error("Device lost"); });
    createLevelMeter({}); await Promise.resolve(); expect(context.close).toHaveBeenCalledTimes(2); expect(callbacks).toHaveLength(0);
  });
});
