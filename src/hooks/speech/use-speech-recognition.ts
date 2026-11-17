"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSTT, isSpeechRecognitionSupported } from "@/services/speech/browser-stt";
import type { SpeechSnapshot, STTErrorCode, STTStatus } from "@/services/speech/types";
import { useAudioSettings } from "./use-audio-settings";
const EMPTY: SpeechSnapshot = { finalText: "", interimText: "", originalText: "", hasUnfinalized: false };

export function useSpeechRecognition() {
  const stt = useMemo(() => getBrowserSTT(), []);
  const lang = useAudioSettings(s => s.lang), maxAlternatives = useAudioSettings(s => s.maxAlternatives), maxRestarts = useAudioSettings(s => s.maxRestarts);
  const [supported, setSupported] = useState(true), [status, setStatus] = useState<STTStatus>("idle");
  const [snapshot, setSnapshot] = useState<SpeechSnapshot>(EMPTY);
  const [speechDetected, setSpeechDetected] = useState(false), [audioActive, setAudioActive] = useState(false);
  const [error, setError] = useState<{ code: STTErrorCode; message: string } | null>(null);
  const alive = useRef(true), generation = useRef(0);
  const pendingStart = useRef<Promise<boolean> | null>(null);
  const settleStart = useRef<((started: boolean) => void) | null>(null);
  const timings = useRef<{ startupMs?: number; finalizationMs?: number }>({});
  useEffect(() => {
    const session = generation;
    alive.current = true; setSupported(isSpeechRecognitionSupported());
    return () => { alive.current = false; session.current++; settleStart.current?.(false); stt.abort(); };
  }, [stt]);
  const start = useCallback((): Promise<boolean> => {
    if (pendingStart.current) return pendingStart.current;
    if (stt.isActive) return Promise.resolve(true);
    if (!stt.isSupported()) { setStatus("unsupported"); return Promise.resolve(false); }
    const id = ++generation.current, began = performance.now();
    const current = () => alive.current && id === generation.current;
    setError(null); setSnapshot(EMPTY); setStatus("starting"); setSpeechDetected(false);
    const promise = new Promise<boolean>(resolve => {
      let settled = false;
      const settle = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
      settleStart.current = settle;
      stt.start({ lang, maxAlternatives, maxRestarts,
        onStart: () => { if (current()) { timings.current.startupMs = performance.now() - began; setStatus("listening"); settle(true); } },
        onSnapshot: value => { if (current()) setSnapshot(value); },
        onSpeechActivity: value => { if (current()) setSpeechDetected(value); },
        onAudioActivity: value => { if (current()) setAudioActive(value); },
        onError: (code, message) => { if (current()) { setError({ code, message }); setStatus("error"); } settle(false); },
        onEnd: () => { if (current()) { setSnapshot(stt.snapshot); setStatus(value => value === "error" ? value : "idle"); } settle(false); },
      });
    });
    pendingStart.current = promise;
    void promise.finally(() => { if (pendingStart.current === promise) { pendingStart.current = null; settleStart.current = null; } });
    return promise;
  }, [stt, lang, maxAlternatives, maxRestarts]);
  const stop = useCallback(async () => {
    const id = generation.current, began = performance.now(); setStatus("stopping");
    const text = await stt.stop();
    if (alive.current && id === generation.current) { timings.current.finalizationMs = performance.now() - began; setSnapshot(stt.snapshot); setStatus(value => value === "error" ? value : "idle"); }
    return text;
  }, [stt]);
  const abort = useCallback(() => { settleStart.current?.(false); stt.abort(); if (alive.current) { setStatus("idle"); setSpeechDetected(false); setAudioActive(false); } }, [stt]);
  const getSnapshot = useCallback(() => stt.snapshot, [stt]);
  return { supported, status, interim: snapshot.interimText, finalText: snapshot.finalText, originalText: snapshot.originalText, hasUnfinalized: snapshot.hasUnfinalized, speechDetected, audioActive, error, start, stop, abort, getSnapshot, timings };
}
