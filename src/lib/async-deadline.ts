/** Bound read-only SDK work that may never settle; no artificial minimum delay. */
export async function withDeadline<T>(work: Promise<T>, ms: number, error: Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(error), ms); })]); }
  finally { clearTimeout(timer); }
}
