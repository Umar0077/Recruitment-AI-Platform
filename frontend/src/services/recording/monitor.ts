import type { CaptureState, RecordingEvent } from "./types";
/** Observations only. Permission prompts, assistive tools and OS windows can all change focus. */
export class SessionMonitor {
  private off: (() => void)[] = [];
  constructor(private state: () => CaptureState, private emit: (event: RecordingEvent) => void, private notice: () => void) {}
  record(type: string, durationMs?: number) { this.emit({ id: crypto.randomUUID(), type, occurredAt: new Date().toISOString(), captureState: this.state(), ...(durationMs === undefined ? {} : { durationMs }) }); }
  start() {
    if (this.off.length) return;
    let hidden = document.hidden, focused = document.hasFocus(), hiddenAt = Date.now(), lostAt = Date.now(), fullscreen = !!document.fullscreenElement;
    const visibility = () => { if (hidden === document.hidden) return; hidden = document.hidden; if (hidden) { hiddenAt = Date.now(); this.record("TAB_HIDDEN"); } else { this.record("TAB_VISIBLE", Date.now() - hiddenAt); this.notice(); } };
    const blur = () => { if (!focused) return; focused = false; lostAt = Date.now(); this.record("FOCUS_LOST"); };
    const focus = () => { if (focused) return; focused = true; this.record("FOCUS_RESTORED", Date.now() - lostAt); this.notice(); };
    const full = () => { const next = !!document.fullscreenElement; if (next !== fullscreen) this.record(next ? "FULLSCREEN_ENTERED" : "FULLSCREEN_EXITED"); fullscreen = next; };
    const exit = () => this.record("PAGE_EXITED");
    const listen = (target: EventTarget, name: string, fn: () => void) => { target.addEventListener(name, fn); this.off.push(() => target.removeEventListener(name, fn)); };
    listen(document, "visibilitychange", visibility); listen(window, "blur", blur); listen(window, "focus", focus); listen(document, "fullscreenchange", full); listen(window, "pagehide", exit);
  }
  stop() { this.off.splice(0).forEach(off => off()); }
}
