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
export function useMicrophone() {
  const [status, setStatus] = useState<MicrophoneStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MicrophoneDevice[]>([]);
  const [applied, setApplied] = useState<AppliedProcessing>({});
  const [label, setLabel] = useState("");
  const [lowInput, setLowInput] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<LevelMeter | null>(null);
  const micDeviceId = useAudioSettings((s) => s.micDeviceId);
  const setSettings = useAudioSettings((s) => s.set);
  const support = useRef(typeof window !== "undefined" ? getProcessingSupport() : { echoCancellation: false, noiseSuppression: false, autoGainControl: false });

  const refreshDevices = useCallback(async () => setDevices(await listMicrophones()), []);

  const close = useCallback(() => {
    meterRef.current?.stop();
    meterRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setLowInput(false);
    setStatus((s) => (s === "active" || s === "requesting" ? "off" : s));
  }, []);

  const open = useCallback(
    async (deviceId = micDeviceId) => {
      if (!isMicrophoneApiAvailable()) {
        setStatus("error");
        setError("This browser can't access a microphone.");
        return false;
      }
      close();
      setStatus("requesting");
      setError(null);
      try {
        const res = await openMicrophone(deviceId).catch((e) => {
          // A saved device may have been unplugged — fall back to the default microphone once.
          if (deviceId && (e as DOMException)?.name === "OverconstrainedError") return openMicrophone(undefined);
          throw e;
        });
        streamRef.current = res.stream;
        meterRef.current = createLevelMeter(res.stream, { onLowInput: setLowInput });
        setApplied(res.applied);
        setLabel(res.label);
        if (res.deviceId && res.deviceId !== micDeviceId) setSettings({ micDeviceId: res.deviceId });
        res.stream.getAudioTracks()[0]?.addEventListener("ended", () => {
          setStatus("in-use");
          setError("The microphone was disconnected.");
        });
        setStatus("active");
        void refreshDevices();
        return true;
      } catch (e) {
        const m = mapMicrophoneError(e);
        setStatus(m.status);
        setError(m.message);
        return false;
      }
    },
    [close, micDeviceId, refreshDevices, setSettings],
  );

  useEffect(() => {
    void refreshDevices();
    const off = onDeviceChange(() => void refreshDevices());
    return () => {
      off();
      close();
    };
  }, [close, refreshDevices]);

  const getLevel = useCallback(() => meterRef.current?.level ?? 0, []);
  const selectDevice = useCallback(
    async (id: string) => {
      setSettings({ micDeviceId: id });
      if (streamRef.current) await open(id);
    },
    [open, setSettings],
  );

  return { status, error, devices, applied, label, lowInput, support: support.current, open, close, getLevel, selectDevice, stream: streamRef };
}
