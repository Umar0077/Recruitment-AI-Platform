"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrowserTTS, rankVoices } from "@/services/speech/browser-tts";
import type { SpeakResult, TTSStatus, TTSVoice } from "@/services/speech/types";
import { useAudioSettings } from "./use-audio-settings";

export const VOICE_SAMPLE = "Hello, and welcome to your InterviewOS assessment. Please make sure you can hear my voice clearly before continuing.";

/**
 * Interviewer voice. One utterance at a time; any new speak() cancels the previous one,
 * and playback stops automatically when the component unmounts.
 */
export function useTextToSpeech() {
  const tts = useMemo(() => getBrowserTTS(), []);
  const [supported, setSupported] = useState(true);
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [status, setStatus] = useState<TTSStatus>("preparing");
  const voiceId = useAudioSettings((s) => s.voiceId);
  const rate = useAudioSettings((s) => s.rate);
  const volume = useAudioSettings((s) => s.volume);
  const setSettings = useAudioSettings((s) => s.set);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!tts.isSupported()) {
      setSupported(false);
      setStatus("unsupported");
      return;
    }
    let alive = true;
    void tts.loadVoices().then((list) => {
      if (!alive) return;
      setVoices(rankVoices(list));
      setStatus("ready");
    });
    return () => {
      alive = false;
      mounted.current = false;
      tts.cancel();
    };
  }, [tts]);

  // Saved voice if it exists on this device, otherwise the best-ranked English voice.
  const voice = useMemo(() => voices.find((v) => v.id === voiceId) ?? voices[0], [voices, voiceId]);

  const speak = useCallback(
    async (text: string): Promise<SpeakResult> => {
      if (!tts.isSupported()) return "failed";
      setStatus("preparing");
      const result = await tts.speak(text, { voiceId: voice?.id, rate, volume, onStart: () => mounted.current && setStatus("speaking") });
      if (mounted.current) setStatus(result === "completed" ? "complete" : result === "cancelled" ? "ready" : "failed");
      return result;
    },
    [tts, voice?.id, rate, volume],
  );

  const pause = useCallback(() => { tts.pause(); setStatus("paused"); }, [tts]);
  const resume = useCallback(() => { tts.resume(); setStatus("speaking"); }, [tts]);
  const cancel = useCallback(() => { tts.cancel(); setStatus("ready"); }, [tts]);

  return { supported, voices, voice, status, speak, pause, resume, cancel, setVoice: (id: string) => setSettings({ voiceId: id }), canPause: tts.canPause };
}

export const TTS_STATUS_LABEL: Record<TTSStatus, string> = {
  unsupported: "Voice unavailable",
  preparing: "Preparing Voice",
  ready: "Ready to Speak",
  speaking: "AI Speaking",
  paused: "Playback Paused",
  complete: "Playback Complete",
  failed: "Playback Failed",
};
