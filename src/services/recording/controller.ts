import { ApiError, apiRequest } from "@/lib/api/client";
import { RecordingUpload } from "./upload";
import { SessionMonitor } from "./monitor";
import { recordingFormat, type RecordingPolicy, type RecordingSnapshot, type RecordingEvent, type CaptureState } from "./types";

const stop = (stream?: MediaStream) => stream?.getTracks().forEach(track => track.stop());
export function contain(width: number, height: number, x: number, y: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / width, boxHeight / height);
  return [x + (boxWidth - width * scale) / 2, y + (boxHeight - height * scale) / 2, width * scale, height * scale] as const;
}
export class RecordingController {
  snapshot: RecordingSnapshot = { state: "NOT_REQUESTED", message: "", uploadedBytes: 0, capturedBytes: 0, surface: "unknown", systemAudio: false, mimeType: "" };
  devices?: MediaStream;
  private screen?: MediaStream;
  private output?: MediaStream;
  private context?: AudioContext;
  private videos: HTMLVideoElement[] = [];
  private drawTimer?: ReturnType<typeof setInterval>;
  private limitTimer?: ReturnType<typeof setTimeout>;
  private permissionTimer?: ReturnType<typeof setTimeout>;
  private recorder?: MediaRecorder;
  private upload?: RecordingUpload;
  private id?: string;
  private epoch = 0;
  private starting = false;
  private disposed = false;
  private startedAt = 0;
  private duration = 0;
  private pausedAt = 0;
  private pausedMs = 0;
  private stopping?: Promise<void>;
  private stopped?: Promise<void>;
  private stoppedResolve?: () => void;
  private monitor?: SessionMonitor;
  private events: RecordingEvent[] = [];
  private sending = false;
  private abort = new AbortController();
  private fatal = false;
  constructor(readonly sessionId: string, readonly policy: RecordingPolicy, private changed: (snapshot: RecordingSnapshot) => void, private notice: () => void) {}
  private set(state: CaptureState, message = "") { this.snapshot = { ...this.snapshot, state, message }; if (!this.disposed) this.changed(this.snapshot); }
  /** Called directly from the consented button click, before any asynchronous API call. */
  async prepare(canvas: HTMLCanvasElement, systemAudio: boolean) {
    if (this.disposed || !["NOT_REQUESTED", "CANCELLED", "FAILED"].includes(this.snapshot.state) || this.id) return;
    const mimeType = recordingFormat();
    if (!this.policy.available || !navigator.mediaDevices?.getDisplayMedia || !mimeType || !canvas.captureStream || !window.AudioContext) { this.set("FAILED", "This browser cannot record this interview. Continue without recording or request an alternative assessment."); return; }
    const epoch = ++this.epoch;
    this.set("PERMISSION_PENDING", "Choose only the screen, window or tab you consent to share.");
    this.permissionTimer = setTimeout(() => { if (epoch === this.epoch) { this.epoch++; this.release(); this.set("FAILED", "Permission was not completed. Retry when ready or continue without recording."); } }, 60000);
    const accept = (stream: MediaStream) => { if (epoch !== this.epoch || this.disposed) { stop(stream); throw new Error("Capture cancelled."); } return stream; };
    try {
      this.screen = accept(await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: this.policy.width }, height: { ideal: this.policy.height }, frameRate: { ideal: this.policy.fps } }, audio: systemAudio }));
      const surface = this.screen.getVideoTracks()[0]?.getSettings().displaySurface ?? "unknown";
      if (this.policy.screenRequirement === "full_display" && surface !== "monitor") throw new Error("Please share an entire display, or use the alternative assessment path.");
      this.snapshot = { ...this.snapshot, surface, systemAudio: systemAudio && this.screen.getAudioTracks().length > 0, mimeType };
      this.watchTracks(this.screen, "SCREEN_SHARE_STOPPED", epoch);
      this.set("SCREEN_READY", "Screen selected. Enable your camera and microphone to prepare the preview; recording has not started.");
    } catch (e) { if (epoch === this.epoch) { this.release(); this.set("FAILED", (e as { name?: string })?.name === "NotAllowedError" ? "Screen-sharing permission was declined. Retry or continue without recording." : e instanceof Error ? e.message : "Screen capture is unavailable."); } }
    finally { clearTimeout(this.permissionTimer); }
  }
  /** A separate explicit click requests camera/microphone access after screen selection. */
  async enableDevices(canvas: HTMLCanvasElement) {
    if (this.disposed || this.snapshot.state !== "SCREEN_READY" || !this.screen?.getVideoTracks().some(t => t.readyState === "live")) return;
    const epoch = this.epoch;
    this.set("PERMISSION_PENDING", "Allow camera and microphone access for the preview.");
    this.permissionTimer = setTimeout(() => { if (epoch === this.epoch) { this.epoch++; this.release(); this.set("FAILED", "Device permission was not completed. Retry when ready."); } }, 60000);
    const accept = (stream: MediaStream) => { if (epoch !== this.epoch || this.disposed) { stop(stream); throw new Error("Capture cancelled."); } return stream; };
    try {
      this.devices = accept(await navigator.mediaDevices.getUserMedia({ video: this.policy.cameraEnabled ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: this.policy.fps } } : false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }));
      this.context = new AudioContext();
      const mix = this.context.createMediaStreamDestination(), limiter = this.context.createDynamicsCompressor();
      limiter.connect(mix);
      for (const stream of [this.devices, ...(this.snapshot.systemAudio && this.screen.getAudioTracks().length ? [this.screen] : [])]) {
        const source = this.context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        const gain = this.context.createGain(); gain.gain.value = 0.7; source.connect(gain).connect(limiter);
      }
      canvas.width = this.policy.width; canvas.height = this.policy.height;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Recording preview is unavailable.");
      this.videos = [this.screen, ...(this.policy.cameraEnabled ? [this.devices] : [])].map(stream => { const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream; return video; });
      await Promise.all(this.videos.map(video => video.play()));
      if (epoch !== this.epoch || this.disposed) { this.release(); return; }
      const draw = () => {
        ctx.fillStyle = "#080e20"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        this.videos.forEach((video, i) => { if (!video.videoWidth) return; const box = i ? [canvas.width - 276, canvas.height - 176, 256, 144] : [0, 0, canvas.width, canvas.height]; ctx.drawImage(video, ...contain(video.videoWidth, video.videoHeight, box[0], box[1], box[2], box[3])); });
        ctx.fillStyle = "rgba(0,0,0,.8)"; ctx.fillRect(12, 12, 470, 38); ctx.fillStyle = "#fff"; ctx.font = "18px sans-serif";
        ctx.fillText(`${this.snapshot.state === "RECORDING" ? "REC" : this.snapshot.state} · ${this.sessionId.slice(0, 8)} · ${new Date().toISOString().slice(11, 19)} UTC`, 22, 37);
      };
      draw(); this.drawTimer = setInterval(draw, 1000 / this.policy.fps);
      this.output = new MediaStream([...canvas.captureStream(this.policy.fps).getVideoTracks(), ...mix.stream.getAudioTracks()]);
      this.watchTracks(this.devices, "DEVICE_INTERRUPTED", epoch);
      this.set("CAPTURE_READY", "Preview only — recording has not started.");
    } catch (e) { if (epoch === this.epoch) { this.release(); this.set("FAILED", (e as { name?: string })?.name === "NotAllowedError" ? "Permission was declined. Retry or continue without recording." : e instanceof Error ? e.message : "Capture is unavailable."); } }
    finally { clearTimeout(this.permissionTimer); }
  }
  private watchTracks(stream: MediaStream, type: string, epoch: number) {
    for (const track of stream.getTracks()) track.addEventListener("ended", () => {
      if (epoch !== this.epoch || this.disposed) return;
      this.snapshot = { ...this.snapshot, interrupted: true };
      this.monitor?.record(type === "DEVICE_INTERRUPTED" ? track.kind === "audio" ? "MICROPHONE_INTERRUPTED" : "CAMERA_INTERRUPTED" : type);
      if (this.recorder) { this.set("INTERRUPTED", "Screen sharing or a required device has stopped. Your interview recording is interrupted."); void this.finish().catch(() => undefined); }
      else { this.epoch++; this.release(); this.set("FAILED", "A shared device stopped. Retry screen sharing when ready."); }
    }, { once: true });
  }
  async start(monitoring: boolean) {
    if (this.starting || this.recorder || this.disposed || this.snapshot.state !== "CAPTURE_READY" || !this.output) return;
    this.starting = true;
    try {
      if (!this.screen?.getVideoTracks().every(t => t.readyState === "live") || !this.devices?.getAudioTracks().some(t => t.readyState === "live") || this.policy.cameraEnabled && !this.devices?.getVideoTracks().some(t => t.readyState === "live")) throw new Error("A required recording device is no longer active. Retry setup.");
      await this.context?.resume();
      const { data } = await apiRequest<{ id: string; status: string }>("/recordings", { method: "POST", timeoutMs: 50000, body: { sessionId: this.sessionId, clientId: crypto.randomUUID(), consent: true, policyReference: this.policy.policyReference, cameraConsent: this.policy.cameraEnabled, monitoringConsent: monitoring, systemAudioConsent: this.snapshot.systemAudio, displaySurface: this.snapshot.surface, contentType: this.snapshot.mimeType } });
      this.id = data.id;
      if (data.status !== "RECORDING") throw new Error("This recording attempt is no longer active. Retry setup.");
      if (this.disposed || !this.output?.getTracks().every(track => track.readyState === "live")) { void this.cancel(); return; }
      this.upload = new RecordingUpload(this.policy.partBytes, this.policy.maxBytes, async (partNumber, blob) => {
        const { data: part } = await apiRequest<{ url: string }>(`/recordings/${this.id}/parts`, { method: "POST", body: { partNumber, sizeBytes: blob.size }, signal: this.abort.signal });
        const response = await fetch(part.url, { method: "PUT", body: blob, credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(30000)]) });
        if (!response.ok || !response.headers.get("ETag")) throw new Error("Part upload was not confirmed.");
      }, () => this.progress());
      if (monitoring && this.policy.monitoringEnabled) this.monitor = new SessionMonitor(() => this.snapshot.state, event => { if (this.events.length < 100) this.events.push(event); void this.sendEvents(); }, this.notice);
      this.recorder = new MediaRecorder(this.output, { mimeType: this.snapshot.mimeType, videoBitsPerSecond: this.policy.videoBitsPerSecond, audioBitsPerSecond: 96000 });
      this.stopped = new Promise(resolve => { this.stoppedResolve = resolve; });
      this.recorder.ondataavailable = event => { try { this.upload?.append(event.data); } catch (e) { this.fatal = true; this.set("FAILED", (e as Error).message); this.stopCapture(); } };
      this.recorder.onstop = () => { this.stoppedResolve?.(); this.release(); };
      this.recorder.onerror = () => { this.fatal = true; this.set("FAILED", "The browser could not finish the recording. Your confirmed answers are safe."); this.stopCapture(); };
      this.startedAt = Date.now(); this.recorder.start(1000); this.set("RECORDING");
      this.monitor?.start(); this.monitor?.record("SCREEN_SHARE_STARTED"); this.monitor?.record("RECORDING_STARTED");
      this.limitTimer = setTimeout(() => { this.set("INTERRUPTED", "Recording time limit reached."); void this.finish().catch(() => undefined); }, 4 * 3600000);
    } catch (e) { this.set("FAILED", e instanceof ApiError || e instanceof Error ? e.message : "Recording could not start. Cancel this attempt and retry or continue without recording."); this.release(); }
    finally { this.starting = false; }
  }
  private progress() {
    if (!this.upload || this.disposed) return;
    this.snapshot = { ...this.snapshot, uploadedBytes: this.upload.uploaded, capturedBytes: this.upload.total };
    if (this.recorder?.state === "recording" && (this.upload.error || this.upload.pendingBytes >= this.policy.partBytes * 2)) { this.recorder.pause(); this.pausedAt = Date.now(); this.set("PAUSED", "Recording paused while pending media uploads. Retry the upload, then resume recording."); }
    else this.changed(this.snapshot);
  }
  retry() { this.upload?.retry(); }
  resume() { if (this.recorder?.state === "paused" && !this.upload?.error && (this.upload?.pendingBytes ?? 0) < this.policy.partBytes * 2) { this.pausedMs += Date.now() - this.pausedAt; this.pausedAt = 0; this.recorder.resume(); this.set("RECORDING"); } }
  private stopCapture() {
    clearTimeout(this.limitTimer); this.monitor?.stop();
    this.duration ||= Math.min(4 * 3600000, Math.max(0, Date.now() - this.startedAt - this.pausedMs - (this.pausedAt ? Date.now() - this.pausedAt : 0)));
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    else this.stoppedResolve?.();
    // Release source devices immediately, even if upload is offline or MediaRecorder never fires stop.
    this.release();
  }
  finish(): Promise<void> {
    if (this.snapshot.state === "UPLOADED") return Promise.resolve();
    if (this.stopping) return this.stopping;
    if (!this.recorder || !this.upload) { this.release(); return this.snapshot.state === "FAILED" || this.id ? Promise.reject(new Error("Recording was not saved. Cancel this attempt or continue with your confirmed answers.")) : Promise.resolve(); }
    this.stopping = (async () => {
      this.set("FINALIZING"); this.monitor?.record("RECORDING_COMPLETED"); this.stopCapture();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([this.stopped, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("The browser did not finalize the recording. Your confirmed answers are safe.")), 10000); })]); } finally { clearTimeout(timer); }
      if (this.fatal) throw new Error("Recording is incomplete and cannot be marked saved. Cancel it or continue with your confirmed answers.");
      this.set("UPLOADING"); await this.upload!.finish();
      await apiRequest(`/recordings/${this.id}/complete`, { method: "POST", timeoutMs: 50000, body: { partsCount: this.upload!.partsCount, durationMs: this.duration }, signal: this.abort.signal });
      this.set("UPLOADED", "Recording segment saved. Private storage has confirmed the upload.");
    })().catch(e => { this.monitor?.record("UPLOAD_FAILED"); this.set("FAILED", e instanceof Error ? e.message : "Recording upload is incomplete."); throw e; }).finally(() => { this.stopping = undefined; });
    return this.stopping;
  }
  private async sendEvents() {
    if (this.sending || !this.id || this.disposed) return; this.sending = true;
    try { while (this.events.length && !this.disposed) { await apiRequest(`/recordings/${this.id}/events`, { method: "POST", body: this.events[0], signal: this.abort.signal, notifyAuthFailure: false }); this.events.shift(); } } catch { /* Bounded queue retries on the next observation; navigation may lose tail events. */ } finally { this.sending = false; }
  }
  private release() {
    clearInterval(this.drawTimer); clearTimeout(this.permissionTimer); stop(this.screen); stop(this.devices); stop(this.output);
    this.screen = undefined; this.devices = undefined; this.output = undefined;
    this.videos.forEach(video => { video.pause(); video.srcObject = null; }); this.videos = [];
    void this.context?.close().catch(() => undefined); this.context = undefined;
  }
  async cancel() {
    this.epoch++; this.abort.abort(); this.monitor?.stop(); this.upload?.cancel(); this.stopCapture(); this.release();
    if (this.id) await apiRequest(`/recordings/${this.id}`, { method: "DELETE" });
    this.set("CANCELLED", "Capture stopped and this incomplete recording was cancelled.");
  }
  dispose() { this.disposed = true; this.epoch++; this.monitor?.record("PAGE_EXITED"); this.monitor?.stop(); this.abort.abort(); this.upload?.cancel(); this.stopCapture(); this.release(); }
}
