"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AudioSettings } from "@/services/speech/types";

/** Candidate audio preferences. Non-sensitive; stored locally so they survive a refresh. */
interface AudioSettingsState extends AudioSettings {
  set: (patch: Partial<AudioSettings>) => void;
}

export const useAudioSettings = create<AudioSettingsState>()(
  persist(
    (set) => ({
      voiceId: undefined,
      rate: 0.97,
      volume: 1,
      muted: false,
      micDeviceId: undefined,
      lang: "en-US",
      set: (patch) => set(patch),
    }),
    { name: "interviewos-audio-settings", storage: createJSONStorage(() => localStorage) },
  ),
);

export const RECOGNITION_LANGUAGES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-IN", label: "English (India / South Asia)" },
];
