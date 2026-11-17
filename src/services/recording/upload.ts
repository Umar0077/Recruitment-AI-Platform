/** Bounded, sequential multipart queue. Retries retain only pending parts in memory, never on disk. */
export class RecordingUpload {
  private buffer = new Blob();
  private queue: { number: number; blob: Blob }[] = [];
  private running?: Promise<void>;
  private next = 1;
  private cancelled = false;
  error: Error | null = null;
  total = 0;
  uploaded = 0;
  constructor(readonly partBytes: number, readonly maxBytes: number, private send: (number: number, blob: Blob) => Promise<void>, private changed: () => void) {}
  get pendingBytes() { return this.total - this.uploaded; }
  get partsCount() { return this.next - 1; }
  append(blob: Blob) {
    if (this.cancelled || !blob.size) return;
    // A browser may emit a large Blob after suspension. Fail visibly rather than retain an unbounded recording.
    if (this.total + blob.size > this.maxBytes || this.pendingBytes + blob.size > this.partBytes * 4) throw new Error("Recording buffer or size limit reached. Stop and save the available recording, or request an alternative assessment.");
    this.total += blob.size;
    this.buffer = new Blob([this.buffer, blob]);
    while (this.buffer.size >= this.partBytes) {
      this.queue.push({ number: this.next++, blob: this.buffer.slice(0, this.partBytes) });
      this.buffer = this.buffer.slice(this.partBytes);
    }
    this.changed(); this.pump();
  }
  private pump() {
    if (this.running || this.error || this.cancelled) return;
    this.running = (async () => {
      while (this.queue.length && !this.cancelled) {
        const part = this.queue[0];
        let failure: unknown;
        for (let attempt = 0; attempt < 3 && !this.cancelled; attempt++) {
          try { await this.send(part.number, part.blob); failure = undefined; break; }
          catch (e) { failure = e; if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt)); }
        }
        if (this.cancelled) return;
        if (failure) { this.error = new Error("Recording upload paused. Check your connection and retry; confirmed interview answers are safe."); break; }
        this.queue.shift(); this.uploaded += part.blob.size; this.changed();
      }
    })().finally(() => { this.running = undefined; this.changed(); });
  }
  retry() { this.error = null; this.pump(); }
  async finish() {
    if (this.buffer.size) { this.queue.push({ number: this.next++, blob: this.buffer }); this.buffer = new Blob(); }
    this.retry();
    await this.running;
    if (this.error) throw this.error;
    if (this.cancelled || !this.total) throw new Error("No recording was saved.");
  }
  cancel() { this.cancelled = true; this.queue = []; this.buffer = new Blob(); }
}
