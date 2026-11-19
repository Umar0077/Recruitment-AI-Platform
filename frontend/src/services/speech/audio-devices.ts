"use client";
/**
 * Microphone access with browser audio processing.
 * Echo cancellation, noise suppression, and auto gain are *requested*; the UI reports only
 * what the browser says it actually applied (track.getSettings()), never an assumption.
 */
import type { AppliedProcessing, AudioProcessingSupport, MicrophoneDevice, MicrophoneStatus } from "./types";

export function getProcessingSupport(): AudioProcessingSupport {
  let c: MediaTrackSupportedConstraints = {};
  try { c = typeof navigator !== "undefined" && navigator.mediaDevices?.getSupportedConstraints ? navigator.mediaDevices.getSupportedConstraints() : {}; } catch { /* Browser diagnostics are optional. */ }
  return { echoCancellation: !!c.echoCancellation, noiseSuppression: !!c.noiseSuppression, autoGainControl: !!c.autoGainControl };
}

export const isMicrophoneApiAvailable = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export async function openMicrophone(deviceId?: string): Promise<{ stream: MediaStream; applied: AppliedProcessing; deviceId?: string; label: string }> {
  const support = getProcessingSupport();
  const audio: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    ...(support.echoCancellation ? { echoCancellation: { ideal: true } } : {}),
    ...(support.noiseSuppression ? { noiseSuppression: { ideal: true } } : {}),
    ...(support.autoGainControl ? { autoGainControl: { ideal: true } } : {}),
    channelCount: { ideal: 1 },
  };
  const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
  try {
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState === "ended") throw new DOMException("No active audio input", "NotFoundError");
    const s = track.getSettings?.() ?? {};
    return {
      stream,
      applied: { echoCancellation: s.echoCancellation, noiseSuppression: s.noiseSuppression, autoGainControl: s.autoGainControl },
      deviceId: s.deviceId,
      label: track.label || "Microphone",
    };
  } catch (error) { stopStream(stream); throw error; }
}

export function stopStream(stream?: MediaStream | null) {
  stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* Continue releasing the other tracks. */ } });
}

export async function listMicrophones(): Promise<MicrophoneDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === "audioinput" && d.deviceId !== "communications")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  } catch { return []; }
}

export function onDeviceChange(cb: () => void) {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!media?.addEventListener) return () => {};
  media.addEventListener("devicechange", cb);
  return () => media.removeEventListener("devicechange", cb);
}

export function mapMicrophoneError(e: unknown): { status: MicrophoneStatus; message: string } {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return { status: "denied", message: "Microphone access was blocked or dismissed. Allow it from the camera/microphone icon in the address bar, then retry." };
  if (name === "NotFoundError" || name === "OverconstrainedError") return { status: "no-device", message: "No microphone was found. Connect one (or pick another device) and retry." };
  if (name === "NotReadableError" || name === "AbortError") return { status: "in-use", message: "The microphone is busy or was disconnected. Close other apps that use it and retry." };
  return { status: "error", message: "The microphone couldn't be started. Please retry." };
}
