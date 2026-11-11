"use client";
import { Check, Minus, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label, Switch } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { useAudioSettings, RECOGNITION_LANGUAGES } from "@/hooks/speech/use-audio-settings";
import { VOICE_SAMPLE } from "@/hooks/speech/use-text-to-speech";
import type { AppliedProcessing, AudioProcessingSupport, MicrophoneDevice, TTSVoice } from "@/services/speech/types";
import { cn } from "@/lib/utils";

export function voiceLabel(v: TTSVoice) {
  return `${v.name.replace(/^Microsoft /, "").replace(/ - English.*$/, "")} · ${v.lang}${v.likelyFemale ? " · female" : ""}`;
}

/**
 * Shows whether each processing feature was requested and what the browser reports applying.
 * "Not reported" is shown honestly rather than claiming the feature is active.
 */
export function ProcessingStatus({ support, applied, active }: { support: AudioProcessingSupport; applied: AppliedProcessing; active: boolean }) {
  const rows: [keyof AudioProcessingSupport, string][] = [
    ["noiseSuppression", "Noise suppression"],
    ["echoCancellation", "Echo cancellation"],
    ["autoGainControl", "Automatic gain"],
  ];
  return (
    <ul className="space-y-1.5 text-xs">
      {rows.map(([k, label]) => {
        const state = !support[k] ? "Not supported" : !active ? "Requested when mic starts" : applied[k] === true ? "On (browser confirmed)" : applied[k] === false ? "Off" : "Requested · not reported";
        const on = active && applied[k] === true;
        return (
          <li key={k} className="flex items-center justify-between gap-3">
            <span className="text-fg-secondary">{label}</span>
            <span className={cn("inline-flex items-center gap-1", on ? "text-emerald-600 dark:text-emerald-300" : "text-fg-muted")}>
              {on ? <Check className="size-3.5" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}
              {state}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AudioSettingsPanel({
  voices,
  voice,
  onTestVoice,
  devices,
  support,
  applied,
  micActive,
  onSelectDevice,
  showLanguage = true,
}: {
  voices: TTSVoice[];
  voice?: TTSVoice;
  onTestVoice: (text: string) => void;
  devices: MicrophoneDevice[];
  support: AudioProcessingSupport;
  applied: AppliedProcessing;
  micActive: boolean;
  onSelectDevice: (id: string) => void;
  showLanguage?: boolean;
}) {
  const s = useAudioSettings();
  const female = voices.filter((v) => v.likelyFemale);
  return (
    <div className="space-y-5">
      <div>
        <Label>Interviewer voice</Label>
        {voices.length === 0 ? (
          <p className="text-xs text-fg-muted">No English voices are available in this browser. Questions stay readable on screen.</p>
        ) : (
          <>
            <Select label="Interviewer voice" size="sm" value={voice?.id ?? ""} onValueChange={(id) => s.set({ voiceId: id })} options={voices.slice(0, 40).map((v) => ({ value: v.id, label: voiceLabel(v) }))} />
            <p className="mt-1.5 text-[11px] text-fg-muted">
              {female.length ? `${female.length} female English voice${female.length > 1 ? "s" : ""} found on this device.` : "No voice on this device is clearly labelled female — the clearest English voice is used."}
            </p>
          </>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={!voices.length} onClick={() => onTestVoice(VOICE_SAMPLE)}><Volume2 />Test Interviewer Voice</Button>
          <label className="flex items-center gap-2 text-xs text-fg-secondary">
            <Switch checked={s.muted} onCheckedChange={(v) => { s.set({ muted: v }); toast.info(v ? "Interviewer muted — questions will appear as text only." : "Interviewer voice on."); }} aria-label="Mute interviewer" />
            {s.muted ? <VolumeX className="size-3.5" aria-hidden /> : null}Mute interviewer
          </label>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tts-rate">Speech speed · {s.rate.toFixed(2)}×</Label>
          <input id="tts-rate" type="range" min={0.8} max={1.15} step={0.01} value={s.rate} onChange={(e) => s.set({ rate: Number(e.target.value) })} className="w-full" />
        </div>
        <div>
          <Label htmlFor="tts-volume">Voice volume · {Math.round(s.volume * 100)}%</Label>
          <input id="tts-volume" type="range" min={0.2} max={1} step={0.05} value={s.volume} onChange={(e) => s.set({ volume: Number(e.target.value) })} className="w-full" />
        </div>
      </div>
      <div>
        <Label>Microphone</Label>
        <Select
          label="Microphone"
          size="sm"
          value={s.micDeviceId && devices.some((d) => d.deviceId === s.micDeviceId) ? s.micDeviceId : devices[0]?.deviceId ?? "default"}
          onValueChange={onSelectDevice}
          options={devices.length ? devices.map((d) => ({ value: d.deviceId, label: d.label })) : [{ value: "default", label: "Default microphone (names appear after permission)" }]}
        />
      </div>
      {showLanguage && (
        <div>
          <Label>Speech recognition language</Label>
          <Select label="Recognition language" size="sm" value={s.lang} onValueChange={(v) => s.set({ lang: v })} options={RECOGNITION_LANGUAGES} />
        </div>
      )}
      <div className="rounded-xl border border-subtle bg-overlay/[0.02] p-3">
        <p className="mb-2 text-xs font-medium text-fg">Audio processing</p>
        <ProcessingStatus support={support} applied={applied} active={micActive} />
      </div>
    </div>
  );
}
