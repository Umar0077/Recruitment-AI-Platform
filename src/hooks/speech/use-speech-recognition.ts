"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserSTT, isSpeechRecognitionSupported } from "@/services/speech/browser-stt";
import type { STTErrorCode, STTStatus } from "@/services/speech/types";
import { useAudioSettings } from "./use-audio-settings";

/** Candidate speech-to-text. Interim text is provisional; only finalText is ever saved. */
export function useSpeechRecognition() {
  const stt = useMemo(() => getBrowserSTT(), []);
  const lang = useAudioSettings((s) => s.lang);
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<STTStatus>("idle");
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<{ code: STTErrorCode; message: string } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setSupported(isSpeechRecognitionSupported());
    return () => {
      alive.current = false;
      stt.abort();
    };
  }, [stt]);

  const start = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (!stt.isSupported()) return resolve(false);
        if (stt.isActive) return resolve(true); // ignore double clicks
        setError(null);
        setInterim("");
        setFinalText("");
        setStatus("starting");
        let settled = false;
        stt.start({
          lang,
          onStart: () => { if (!alive.current) return; setStatus("listening"); if (!settled) { settled = true; resolve(true); } },
          onInterim: (t) => alive.current && setInterim(t),
          onFinal: (t) => alive.current && setFinalText(t),
          onError: (code, message) => {
            if (!alive.current) return;
            setError({ code, message });
            if (code !== "no-speech") setStatus("error");
            if (!settled) { settled = true; resolve(false); }
          },
          onEnd: (t) => {
            if (!alive.current) return;
            setFinalText(t);
            setInterim("");
            setStatus((s) => (s === "error" ? s : "idle"));
          },
        });
      }),
    [stt, lang],
  );

  const stop = useCallback(async () => {
    setStatus("stopping");
    const text = await stt.stop();
    if (alive.current) {
      setFinalText(text);
      setInterim("");
      setStatus("idle");
    }
    return text;
  }, [stt]);

  const abort = useCallback(() => { stt.abort(); setStatus("idle"); setInterim(""); }, [stt]);

  return { supported, status, interim, finalText, error, start, stop, abort };
}
