"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getProcessingSupport, listMicrophones, mapMicrophoneError, onDeviceChange, openMicrophone, stopStream, isMicrophoneApiAvailable } from "@/services/speech/audio-devices";
import { createLevelMeter, type LevelMeter } from "@/services/speech/audio-quality";
import type { AppliedProcessing, MicrophoneDevice, MicrophoneStatus } from "@/services/speech/types";
import { useAudioSettings } from "./use-audio-settings";

/**
 * Microphone stream + level meter. Opens only when open() is called from a user action,
 * and always releases the device on close() or unmount.
 */
export function useMicrophone(sharedStream?: MediaStream) {
  const shared = useRef(sharedStream); shared.current = sharedStream;
  const [status, setStatus] = useState<MicrophoneStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MicrophoneDevice[]>([]);
  const [applied, setApplied] = useState<AppliedProcessing>({});
  const [label, setLabel] = useState("");
  const [lowInput, setLowInput] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<LevelMeter | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const activeDevice = useRef<string | undefined>(undefined);
  const detachEnded = useRef<(() => void) | null>(null);
  const permissionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ generation: number; deviceId?: string; promise: Promise<boolean>; resolve: (value: boolean) => void } | null>(null);
  const micDeviceId = useAudioSettings((s) => s.micDeviceId);
  const setSettings = useAudioSettings((s) => s.set);
  const support = useRef(typeof window !== "undefined" ? getProcessingSupport() : { echoCancellation: false, noiseSuppression: false, autoGainControl: false });

  const refreshDevices = useCallback(async () => {
    const next = await listMicrophones();
    if (mounted.current) setDevices(next);
  }, []);

  const release = useCallback(() => {
    detachEnded.current?.();
    detachEnded.current = null;
    try { meterRef.current?.stop(); } catch { /* Optional diagnostics must not retain the microphone. */ }
    meterRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    activeDevice.current = undefined;
  }, []);

  const close = useCallback(() => {
    clearTimeout(permissionTimer.current);
    generation.current++;
    pending.current?.resolve(false);
    pending.current = null;
    release();
    if (mounted.current) {
      setLowInput(false);
      setStatus((s) => (s === "active" || s === "requesting" ? "off" : s));
    }
  }, [release]);

  const open = useCallback(
    (deviceId = micDeviceId): Promise<boolean> => {
      if (!mounted.current) return Promise.resolve(false);
      if (pending.current && pending.current.deviceId === deviceId) return pending.current.promise;
      if (streamRef.current?.getAudioTracks().some((track) => track.readyState === "live") && activeDevice.current === deviceId) return Promise.resolve(true);
      if (!isMicrophoneApiAvailable()) {
        setStatus("error");
        setError("This browser can't access a microphone.");
        return Promise.resolve(false);
      }
      close();
      const token = generation.current;
      setStatus("requesting");
      setError(null);
      let resolve!: (value: boolean) => void;
      const promise = new Promise<boolean>((done) => { resolve = done; });
      pending.current = { generation: token, deviceId, promise, resolve };
      const current = () => mounted.current && generation.current === token;
      permissionTimer.current = setTimeout(() => {
        if (!current()) return;
        close();
        setStatus("error");
        setError("Microphone permission was not completed. Allow access in your browser, then retry, or type your answer.");
      }, 15000);
      void (async () => {
        try {
          const source = shared.current?.getAudioTracks().find(track => track.readyState === "live");
          // Clone the recording source for metering; closing this hook never stops the recording's track.
          const res = source ? { stream: new MediaStream([source.clone()]), applied: source.getSettings(), deviceId: source.getSettings().deviceId, label: source.label } : await openMicrophone(deviceId).catch((e) => {
            // Retry an unplugged saved device only while this request is still wanted.
            if (current() && deviceId && (e as DOMException)?.name === "OverconstrainedError") return openMicrophone(undefined);
            throw e;
          });
          if (!current()) { stopStream(res.stream); return false; }
          streamRef.current = res.stream;
          activeDevice.current = res.deviceId ?? deviceId;
          try {
            meterRef.current = createLevelMeter(res.stream, { onLowInput: (low) => { if (current()) setLowInput(low); } });
          } catch { /* AudioContext support is optional; a valid stream remains usable. */ }
          setApplied(res.applied);
          setLabel(res.label);
          if (res.deviceId && res.deviceId !== micDeviceId) setSettings({ micDeviceId: res.deviceId });
          const track = res.stream.getAudioTracks()[0];
          const ended = () => {
            if (!current()) return;
            close();
            setStatus("in-use");
            setError("The microphone was disconnected.");
          };
          track?.addEventListener("ended", ended);
          detachEnded.current = () => track?.removeEventListener("ended", ended);
          setStatus("active");
          void refreshDevices();
          return true;
        } catch (e) {
          if (current()) {
            release();
            const m = mapMicrophoneError(e);
            setStatus(m.status);
            setError(m.message);
          }
          return false;
        }
      })().then((value) => {
        if (pending.current?.generation === token) { clearTimeout(permissionTimer.current); pending.current = null; }
        resolve(value);
      });
      return promise;
    },
    [close, micDeviceId, refreshDevices, release, setSettings],
  );

  useEffect(() => {
    mounted.current = true;
    void refreshDevices();
    const off = onDeviceChange(() => void refreshDevices());
    return () => {
      mounted.current = false;
      off();
      close();
    };
  }, [close, refreshDevices]);

  const getLevel = useCallback(() => meterRef.current?.level ?? 0, []);
  const selectDevice = useCallback(
    async (id: string) => {
      setSettings({ micDeviceId: id });
      if (streamRef.current || pending.current) await open(id);
    },
    [open, setSettings],
  );

  return { status, error, devices, applied, label, lowInput, support: support.current, open, close, getLevel, selectDevice, stream: streamRef };
}
