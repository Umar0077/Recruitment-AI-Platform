"use client";
/**
 * Lightweight input-level monitoring with the Web Audio API.
 * Analysis only — nothing is recorded, stored, or uploaded.
 * A dedicated voice-activity / denoising model can be added here later.
 */

export interface LevelMeter {
  /** Latest normalised level (0–1). Read it from a render loop instead of React state. */
  readonly level: number;
  stop(): void;
}

export function createLevelMeter(
  stream: MediaStream,
  opts: { onLowInput?: (low: boolean) => void; lowThreshold?: number; lowAfterMs?: number } = {},
): LevelMeter {
  let ctx: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;
  const threshold = opts.lowThreshold ?? 0.035;
  const lowAfter = opts.lowAfterMs ?? 5000;
  let level = 0;
  let raf = 0;
  let quietSince = performance.now();
  let lowReported = false;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    level = 0;
    cancelAnimationFrame(raf);
    try { source?.disconnect(); } catch { /* Already disconnected by the browser. */ }
    try { analyser?.disconnect(); } catch { /* Already disconnected by the browser. */ }
    try { if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {}); } catch { /* Closing diagnostics cannot block stream cleanup. */ }
  };
  const meter: LevelMeter = { get level() { return level; }, stop };

  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return meter;
    ctx = new Ctx();
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser); // not connected to speakers: no feedback loop
  } catch { stop(); return meter; }
  const input = analyser;
  const data = new Float32Array(input.fftSize);

  const tick = () => {
    if (stopped) return;
    try { input.getFloatTimeDomainData(data); } catch { stop(); return; }
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i]! * data[i]!;
    const rms = Math.sqrt(sum / data.length);
    // Map RMS (~0–0.3 for speech) to a friendly 0–1 meter value.
    level = Math.min(1, rms * 5.5);
    const now = performance.now();
    if (level > threshold) {
      quietSince = now;
      if (lowReported) { lowReported = false; opts.onLowInput?.(false); }
    } else if (!lowReported && now - quietSince > lowAfter) {
      lowReported = true;
      opts.onLowInput?.(true);
    }
    if (!stopped) raf = requestAnimationFrame(tick);
  };
  // A blocked/suspended AudioContext affects only diagnostics, not the microphone stream.
  try { void ctx.resume().then(() => { if (!stopped) tick(); }, stop); } catch { stop(); }
  return meter;
}
