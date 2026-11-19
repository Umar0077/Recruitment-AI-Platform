"use client";
import Link from "@/components/navigation/link";
import { useRouter } from "@/components/navigation/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, CameraOff, CheckCircle2, CircleDashed, FlaskConical, Loader2, Mic, MicOff, Play, RotateCcw, Square, Trash2, Volume2, Wifi, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CandidateShell, HelpDialog } from "@/components/candidate/shell";
import { Button } from "@/components/ui/button";
import { GlassCard, CardHeader } from "@/components/ui/primitives";
import { AudioSettingsPanel } from "@/components/interview/audio-settings";
import { LiveLevelMeter } from "@/components/interview/voice-controls";
import { CameraPreview } from "@/components/interview/parts";
import { useDemoStore } from "@/lib/demo/store";
import { useCandidateFlow } from "@/lib/data/candidate-flow";
import { useFlowGate } from "@/components/candidate/flow-gate";
import { isApiMode } from "@/lib/config/environment";
import { useMicrophone } from "@/hooks/speech/use-microphone";
import { useTextToSpeech, VOICE_SAMPLE } from "@/hooks/speech/use-text-to-speech";
import { useSpeechRecognition } from "@/hooks/speech/use-speech-recognition";
import { cn } from "@/lib/utils";

type Check = "idle" | "checking" | "ok" | "warn" | "fail";

export default function EquipmentPage() {
  return (
    <CandidateShell step={2} wide>
      <Equipment />
    </CandidateShell>
  );
}

function Row({ icon: Icon, label, state, detail }: { icon: typeof Mic; label: string; state: Check; detail: string }) {
  const meta = {
    idle: { icon: CircleDashed, cls: "text-fg-disabled", text: "Not checked" },
    checking: { icon: Loader2, cls: "animate-spin text-brand-cyan", text: "Checking…" },
    ok: { icon: CheckCircle2, cls: "text-success", text: "Ready" },
    warn: { icon: AlertTriangle, cls: "text-warning", text: "Check this" },
    fail: { icon: XCircle, cls: "text-danger", text: "Needs attention" },
  }[state];
  return (
    <li className={cn("flex items-center gap-4 rounded-xl border p-4 transition-colors", state === "ok" ? "border-emerald-500/25 bg-emerald-500/[0.05]" : state === "fail" ? "border-danger/25 bg-danger/[0.05]" : "border-subtle bg-overlay/[0.02]")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-overlay/[0.04] text-brand-cyan"><Icon className="size-5" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        <span className="block text-xs text-fg-muted">{detail}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-fg-secondary"><meta.icon className={cn("size-4", meta.cls)} aria-hidden /><span className="hidden sm:inline">{meta.text}</span><span className="sr-only sm:hidden">{meta.text}</span></span>
    </li>
  );
}

function Equipment() {
  const router = useRouter();
  const f = useCandidateFlow();
  const updateFlow = useDemoStore((s) => s.updateFlow);
  const mic = useMicrophone();
  const tts = useTextToSpeech();
  const stt = useSpeechRecognition();
  const [help, setHelp] = useState(false);
  const [voiceHeard, setVoiceHeard] = useState(false);
  const [sttCheck, setSttCheck] = useState<Check>("idle");
  const [demoMode, setDemoMode] = useState(false);
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [camState, setCamState] = useState<Check>("idle");
  const [recording, setRecording] = useState(false);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const mounted = useRef(true), cameraRequest = useRef(0), cameraPending = useRef(false);
  const cameraStream = useRef<MediaStream | null>(null), recordingUrl = useRef<string | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null), speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechSequence = useRef(0), speechBusy = useRef(false), voiceSequence = useRef(0), voiceBusy = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [online, setOnline] = useState(true);
  const abortSpeech = stt.abort, cancelVoice = tts.cancel, closeMicrophone = mic.close;

  useEffect(() => { setOnline(navigator.onLine); }, []);

  const clearClip = useCallback(() => {
    audio.current?.pause();
    if (recordingUrl.current) URL.revokeObjectURL(recordingUrl.current);
    recordingUrl.current = null;
    if (mounted.current) setRecUrl(null);
  }, []);
  const discardRecording = useCallback(() => {
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    const current = recorder.current;
    recorder.current = null;
    if (current) {
      current.ondataavailable = null; current.onstop = null; current.onerror = null;
      try { if (current.state !== "inactive") current.stop(); } catch { /* Already closed by the device. */ }
    }
    if (mounted.current) setRecording(false);
  }, []);
  const cancelSpeechCheck = useCallback(() => {
    speechSequence.current++; speechBusy.current = false;
    if (speechTimer.current) clearTimeout(speechTimer.current);
    speechTimer.current = null; abortSpeech();
    if (mounted.current) setSttCheck("idle");
  }, [abortSpeech]);
  const stopVoice = useCallback(() => {
    voiceSequence.current++; voiceBusy.current = false; cancelVoice();
    if (mounted.current) setVoiceTesting(false);
  }, [cancelVoice]);
  const stopCamera = useCallback(() => {
    cameraRequest.current++; cameraPending.current = false;
    cameraStream.current?.getTracks().forEach(track => track.stop()); cameraStream.current = null;
    if (mounted.current) { setCam(null); setCamState("idle"); }
  }, []);
  const stopTests = useCallback(() => {
    cancelSpeechCheck(); stopVoice(); discardRecording(); clearClip(); stopCamera(); closeMicrophone();
  }, [cancelSpeechCheck, stopVoice, discardRecording, clearClip, stopCamera, closeMicrophone]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopTests(); };
  }, [stopTests]);

  const micCheck: Check = demoMode ? "ok" : mic.status === "active" ? (mic.lowInput ? "warn" : "ok") : mic.status === "requesting" ? "checking" : mic.status === "off" ? "idle" : "fail";

  const startCamera = async () => {
    if (!mounted.current || cameraPending.current || cameraStream.current) return;
    const request = ++cameraRequest.current; cameraPending.current = true;
    setCamState("checking");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (!mounted.current || request !== cameraRequest.current) { s.getTracks().forEach(track => track.stop()); return; }
      cameraStream.current = s; setCam(s); setCamState("ok");
    } catch {
      if (!mounted.current || request !== cameraRequest.current) return;
      setCamState("fail");
      toast.error("Camera unavailable.", { description: "The interview still works without a camera preview." });
    } finally { if (request === cameraRequest.current) cameraPending.current = false; }
  };

  const stopRecording = () => {
    const current = recorder.current;
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    try { if (current && current.state !== "inactive") current.stop(); }
    catch { discardRecording(); if (mounted.current) toast.error("The test recording couldn't finish. Please try again."); }
  };
  const startRecording = () => {
    if (!mounted.current || recorder.current || speechBusy.current || voiceBusy.current) return;
    const s = mic.stream.current;
    if (!s || typeof MediaRecorder === "undefined") return toast.error("Test recording isn't supported in this browser.");
    clearClip();
    const chunks: Blob[] = [];
    try {
      const r = new MediaRecorder(s);
      recorder.current = r;
      r.ondataavailable = (e) => { if (mounted.current && recorder.current === r && e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        if (!mounted.current || recorder.current !== r) return;
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        recordingTimer.current = null; recorder.current = null; setRecording(false);
        r.ondataavailable = null; r.onstop = null; r.onerror = null;
        if (!chunks.length) return;
        try { const url = URL.createObjectURL(new Blob(chunks, { type: r.mimeType })); recordingUrl.current = url; setRecUrl(url); }
        catch { toast.error("The test recording couldn't be played. Please try again."); }
      };
      r.onerror = () => { if (mounted.current && recorder.current === r) { discardRecording(); toast.error("Test recording stopped unexpectedly. Please try again."); } };
      r.start(); setRecording(true);
      recordingTimer.current = setTimeout(stopRecording, 5000);
    } catch { discardRecording(); toast.error("Test recording isn't available. Please try another browser."); }
  };

  const runSpeechCheck = async () => {
    if (!mounted.current || speechBusy.current || recorder.current) return;
    if (!stt.supported) return setSttCheck("warn");
    const sequence = ++speechSequence.current;
    const current = () => mounted.current && sequence === speechSequence.current;
    speechBusy.current = true; stopVoice(); audio.current?.pause(); setSttCheck("checking");
    try {
      const ok = await stt.start();
      if (!current()) return;
      if (!ok) { speechBusy.current = false; setSttCheck("fail"); return; }
      speechTimer.current = setTimeout(() => {
        speechTimer.current = null;
        void stt.stop().then(text => {
          if (current()) { speechBusy.current = false; setSttCheck(text.trim() ? "ok" : "warn"); }
        }).catch(() => { if (current()) { speechBusy.current = false; abortSpeech(); setSttCheck("fail"); } });
      }, 5000);
    } catch { if (current()) { speechBusy.current = false; abortSpeech(); setSttCheck("fail"); } }
  };

  const testVoice = async (text = VOICE_SAMPLE) => {
    if (!mounted.current || speechBusy.current || recorder.current || voiceBusy.current) return;
    const sequence = ++voiceSequence.current; voiceBusy.current = true; setVoiceTesting(true); audio.current?.pause();
    try {
      const r = await tts.speak(text);
      if (!mounted.current || sequence !== voiceSequence.current) return;
      if (r === "completed") setVoiceHeard(true);
      else if (r === "blocked") toast.error("Audio playback was blocked by the browser. Click Test again.");
      else if (r === "failed") toast.error("The voice couldn't play. You can still read questions on screen.");
    } catch { if (mounted.current && sequence === voiceSequence.current) toast.error("The voice couldn't play. You can still read questions on screen."); }
    finally { if (mounted.current && sequence === voiceSequence.current) { voiceBusy.current = false; setVoiceTesting(false); } }
  };

  const ready = (micCheck === "ok" || micCheck === "warn") && f.consent;
  const gate = useFlowGate(f);

  useEffect(() => {
    router.prefetch("/candidate/interview/practice");
    router.prefetch("/candidate/interview/session");
  }, [router]);

  if (gate) return gate;

  return (
    <div>
      {!f.consent && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-4 text-sm text-amber-800 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>Consent hasn&apos;t been given yet. Please review the consent step before testing your devices.</span>
          <Button size="sm" variant="secondary" asChild><Link href="/candidate/interview/consent">Go to Consent</Link></Button>
        </div>
      )}
      <p className="eyebrow">Equipment check</p>
      <h1 className="mt-3 text-[28px] font-bold sm:text-[36px]">Let&apos;s Check Your Setup</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-fg-muted">Test your microphone and speakers before the interview. The optional recording and camera preview stay in this browser tab. Recordings are discarded when you leave. Speech recognition may use your browser&apos;s speech service.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* Microphone */}
          <GlassCard className="p-5 sm:p-6">
            <CardHeader title="Microphone" description="Used to transcribe your spoken answers" icon={<Mic />} />
            <div className="mt-5 rounded-xl border border-subtle bg-overlay/[0.02] p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-fg-secondary">{mic.status === "active" ? mic.label : "Input level"}</span>
                <span className="text-fg-muted">{mic.status === "active" ? (mic.lowInput ? "Very quiet — speak up or move closer" : "Say a few words to see the level move") : "Start the microphone to test"}</span>
              </div>
              <LiveLevelMeter getLevel={mic.getLevel} active={mic.status === "active"} bars={44} className="mt-3 h-12" />
            </div>
            {mic.error && mic.status !== "active" && (
              <div role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/[0.06] p-4 text-[13px] text-fg-secondary">
                <p className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-200"><MicOff className="size-4" aria-hidden />{mic.status === "denied" ? "Microphone Access Needed" : mic.status === "no-device" ? "No Microphone Found" : "Microphone Problem"}</p>
                <p className="mt-1">{mic.error}</p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {mic.status === "active" ? (
                <>
                  <Button variant="secondary" disabled={!recording && (sttCheck === "checking" || voiceTesting)} onClick={recording ? stopRecording : startRecording}>{recording ? <><Square />Stop recording</> : <><Mic />Record 5-second test</>}</Button>
                  <Button variant="ghost" onClick={() => { cancelSpeechCheck(); discardRecording(); mic.close(); }}><MicOff />Stop microphone</Button>
                </>
              ) : (
                <><Button onClick={() => void mic.open()} loading={mic.status === "requesting"}>{mic.error ? <><RotateCcw />Retry Microphone</> : <><Mic />Test My Microphone</>}</Button>{mic.status === "requesting" && <Button variant="secondary" onClick={mic.close}>Cancel microphone check</Button>}</>
              )}
              <Button variant="ghost" onClick={() => setHelp(true)}>Troubleshooting</Button>
            </div>
            {recUrl && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.02] p-3">
                <audio ref={audio} src={recUrl} controls onPlay={() => { if (speechBusy.current || voiceBusy.current || recorder.current) audio.current?.pause(); }} className="h-9 max-w-full flex-1" />
                <Button size="sm" variant="ghost" onClick={() => { clearClip(); toast.info("Test recording discarded."); }}><Trash2 />Discard</Button>
                <p className="w-full text-[11px] text-fg-muted">Local playback only — this clip is never uploaded or saved.</p>
              </div>
            )}
          </GlassCard>

          {/* Speakers */}
          <GlassCard className="p-5 sm:p-6">
            <CardHeader title="Speakers & interviewer voice" description="The AI interviewer reads each question aloud" icon={<Volume2 />} />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={() => void testVoice()} disabled={!tts.supported || voiceTesting || recording || sttCheck === "checking"}>
                {voiceTesting ? <Loader2 className="animate-spin" /> : <Play />}Test Interviewer Voice
              </Button>
              {voiceHeard && <Button variant="secondary" disabled={voiceTesting || recording || sttCheck === "checking"} onClick={() => void testVoice()}><RotateCcw />Replay sample</Button>}
              {voiceTesting && <Button variant="ghost" onClick={stopVoice}><Square />Stop voice</Button>}
            </div>
            <p className="mt-3 text-xs text-fg-muted">{!tts.supported ? "This browser can't play synthesized speech. Questions will be shown as text." : tts.voice ? `Voice: ${tts.voice.name}${tts.voice.likelyFemale ? "" : " (no clearly female voice found on this device — change it in audio settings)"}` : "Loading voices…"}</p>
          </GlassCard>

          {/* Camera (optional) */}
          <GlassCard className="p-5 sm:p-6">
            <CardHeader title="Camera (optional)" description="Optional live preview — no video is recorded or uploaded" icon={<Camera />} />
            <CameraPreview className="mt-5 aspect-video" stream={cam} name="You" camOn={!!cam} label={cam ? "Live camera preview" : "Camera preview is off"} />
            <div className="mt-4 flex gap-2">
              {cam ? <Button variant="secondary" onClick={stopCamera}><CameraOff />Turn off camera</Button> : <Button variant="secondary" onClick={() => void startCamera()} loading={camState === "checking"}><Camera />Test camera</Button>}
              {camState === "checking" && <Button variant="ghost" onClick={stopCamera}>Cancel camera check</Button>}
            </div>
          </GlassCard>
        </div>

        <div className="min-w-0 space-y-4">
          <ul className="space-y-3" aria-live="polite">
            <Row icon={Mic} label="Microphone" state={micCheck} detail={demoMode ? (isApiMode ? "Skipped — answers will be typed" : "Demo preview (simulated)") : mic.status === "active" ? "Working — level meter is live" : mic.status === "requesting" ? "Waiting for browser permission" : mic.status === "off" ? "Not tested yet" : mic.error ?? "Problem detected"} />
            <Row icon={Volume2} label="Interviewer voice" state={!tts.supported ? "warn" : voiceHeard ? "ok" : "idle"} detail={!tts.supported ? "Not supported — text only" : voiceHeard ? "Sample played" : "Play the sample to check"} />
            <Row icon={FlaskConical} label="Speech recognition" state={!stt.supported ? "warn" : sttCheck} detail={!stt.supported ? "Not available in this browser — typed answers will be used" : sttCheck === "ok" ? "Your words were recognised" : sttCheck === "warn" ? "No words recognised — try again closer to the mic" : sttCheck === "fail" ? stt.error?.message ?? "Couldn't start" : sttCheck === "checking" ? "Listening for 5 seconds — say a sentence" : "Optional check"} />
            <Row icon={Camera} label="Camera" state={camState === "idle" ? "idle" : camState} detail={camState === "ok" ? "Preview working" : camState === "fail" ? "Unavailable (optional)" : "Optional"} />
            <Row icon={Wifi} label="Connection" state={online ? "ok" : "fail"} detail={online ? "Browser reports you are online" : "You appear to be offline"} />
          </ul>

          {stt.supported && (
            <GlassCard className="p-4">
              <p className="text-sm font-medium">Speech recognition check</p>
              <p className="mt-1 text-xs text-fg-muted">Say a short sentence. {stt.status === "listening" && "Listening…"}</p>
              {(stt.finalText || stt.interim) && <p className="mt-2 rounded-lg bg-overlay/[0.03] p-2.5 text-sm">{stt.finalText} <span className="text-fg-muted">{stt.interim}</span></p>}
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => void runSpeechCheck()} disabled={sttCheck === "checking" || recording}>{sttCheck === "checking" ? <Loader2 className="animate-spin" /> : <Mic />}Run speech check</Button>
              {sttCheck === "checking" && <Button size="sm" variant="ghost" className="mt-3" onClick={cancelSpeechCheck}>Cancel speech check</Button>}
            </GlassCard>
          )}

          <GlassCard className="p-5">
            <p className="mb-4 text-sm font-semibold">Audio settings</p>
            <AudioSettingsPanel voices={tts.voices} voice={tts.voice} onTestVoice={(t) => void testVoice(t)} testDisabled={voiceTesting || recording || sttCheck === "checking"} settingsLocked={recording || sttCheck === "checking"} devices={mic.devices} support={mic.support} applied={mic.applied} micActive={mic.status === "active"} onSelectDevice={(id) => { if (!speechBusy.current && !recorder.current) void mic.selectDevice(id); }} />
          </GlassCard>

          <button type="button" onClick={() => { setDemoMode(true); toast.info(isApiMode ? "Continuing without a microphone." : "Demo preview enabled.", { description: isApiMode ? "You'll type your answers instead." : "Simulated — no microphone was tested." }); }} className="w-full rounded-xl border border-dashed border-indigo-400/30 p-3 text-left text-xs text-indigo-700 transition-colors hover:bg-indigo-400/[0.05] dark:text-indigo-200">
            {isApiMode ? (
              <><span className="font-semibold">No working microphone?</span> Continue without one and type your answers instead.</>
            ) : (
              <><span className="font-semibold">Presenting without a microphone?</span> Use a simulated demo check to continue. Answers can then be typed.</>
            )}
          </button>
        </div>
      </div>

      <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" asChild><Link href="/candidate/interview/consent" prefetch={true} onClick={stopTests}><ArrowLeft />Back</Link></Button>
        <Button
          size="lg"
          disabled={!ready}
          onClick={() => {
            stopTests();
            if (isApiMode) f.update({ equipmentChecked: true });
            else updateFlow({ equipmentChecked: true, stage: f.stage === "active" || f.stage === "interrupted" ? f.stage : "practice" });
            router.push(f.answeredCount > 0 || f.interviewStatus === "INTERRUPTED" || f.interviewStatus === "IN_PROGRESS" ? "/candidate/interview/session" : "/candidate/interview/practice");
          }}
        >
          {f.answeredCount > 0 || f.interviewStatus === "INTERRUPTED" || f.interviewStatus === "IN_PROGRESS" ? "Continue Interview" : "Continue to Practice"}<ArrowRight />
        </Button>
      </div>
      {!ready && f.consent && <p className="mt-3 text-right text-xs text-fg-muted">Test your microphone to continue.</p>}
      <HelpDialog open={help} onOpenChange={setHelp} />
    </div>
  );
}
