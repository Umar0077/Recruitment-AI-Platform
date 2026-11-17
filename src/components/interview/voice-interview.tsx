"use client";
/**
 * Turn-based voice interview: the AI interviewer speaks each approved question (TTS),
 * the candidate clicks the mic and answers (browser speech recognition), reviews/edits the
 * transcript, and confirms. Original/formatting versions accompany the confirmed text;
 * this component does not record or upload audio.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, HelpCircle, Keyboard, Loader2, Pause, PhoneOff, Play, RotateCcw, Settings2, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { InterviewQuestion } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge, Textarea } from "@/components/ui/primitives";
import { Drawer, Tooltip } from "@/components/ui/overlays";
import { AppLogo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PoweredByConnectivo } from "@/components/ui/powered-by";
import { CoreFallback } from "@/components/visuals/core-fallback";
import type { CoreState } from "@/components/visuals/ai-core";
import { AudioWaveform, CameraPreview, InterviewProgress, ResponseTimer } from "./parts";
import { LiveLevelMeter, MicButton, type MicButtonState } from "./voice-controls";
import { AudioSettingsPanel } from "./audio-settings";
import { initialVoice, STATE_LABEL, voiceReducer, type InputMode, type VoiceState } from "./voice-machine";
import { useTextToSpeech, TTS_STATUS_LABEL } from "@/hooks/speech/use-text-to-speech";
import { useSpeechRecognition } from "@/hooks/speech/use-speech-recognition";
import { useMicrophone } from "@/hooks/speech/use-microphone";
import { useAudioSettings } from "@/hooks/speech/use-audio-settings";
import { cn, formatDuration } from "@/lib/utils";
import { EASE } from "@/components/motion";
import { cleanTranscript, type AnswerTranscriptMetadata } from "@/services/speech/transcript";

const AICore = dynamic(() => import("@/components/visuals/ai-core").then((m) => m.AICore), { ssr: false, loading: () => <CoreFallback /> });

const coreFor = (s: VoiceState): CoreState =>
  s === "ai_speaking" ? "speaking" : s === "loading_question" || s === "tts_ready" || s === "transcribing" || s === "next_question" ? "processing" : s === "listening" || s === "microphone_initializing" ? "complete" : s === "interview_complete" || s === "submission_complete" ? "dim" : "idle";

export interface VoiceInterviewProps {
  variant: "session" | "embedded";
  questions: InterviewQuestion[];
  startIndex?: number;
  candidateName: string;
  roleTitle: string;
  responseSeconds: number;
  practice?: boolean;
  recordingStream?: MediaStream;
  /**
   * Called when the candidate confirms an answer. If it returns a Promise (API mode), the interview waits:
   * it shows "Saving…", advances only after the promise resolves, and on rejection keeps the text and offers Retry.
   */
  onAnswerConfirmed?: (q: InterviewQuestion, text: string, durationSec: number, mode: InputMode, metadata?: AnswerTranscriptMetadata) => void | Promise<unknown>;
  onComplete: () => void;
  onExit?: () => void;
  onHelp?: () => void;
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function VoiceInterview({ variant, questions, startIndex = 0, candidateName, roleTitle, responseSeconds, practice, recordingStream, onAnswerConfirmed, onComplete, onExit, onHelp }: VoiceInterviewProps) {
  const [m, dispatch] = useReducer(voiceReducer, startIndex, initialVoice);
  const tts = useTextToSpeech();
  const cancelSpeech = tts.cancel;
  const stt = useSpeechRecognition();
  const mic = useMicrophone(recordingStream);
  const muted = useAudioSettings((s) => s.muted);
  const setAudio = useAudioSettings((s) => s.set);
  const reduce = useReducedMotion();
  const online = useOnline();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [remaining, setRemaining] = useState(responseSeconds);
  const spokenKey = useRef("");
  const busy = useRef(false);
  const sttErrorRef = useRef(stt.error);
  sttErrorRef.current = stt.error;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const mounted = useRef(true), captureId = useRef(0), playbackId = useRef(0), stopBusy = useRef(false);
  const stateRef = useRef(m); stateRef.current = m;
  const recognitionLanguage = useRef("en-US");
  const cameraId = useRef(0), cameraPending = useRef(false), camera = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (recordingStream) { cameraId.current++; camera.current?.getTracks().forEach(track => track.stop()); camera.current = null; setCamStream(null); }
  }, [recordingStream]);
  const [samplePlaying, setSamplePlaying] = useState(false);
  const sampleRef = useRef(false);
  useEffect(() => { const sessions = [captureId, playbackId, cameraId]; mounted.current = true; return () => { mounted.current = false; sessions.forEach(session => session.current++); camera.current?.getTracks().forEach(track => track.stop()); }; }, []);

  const q = questions[m.index];
  const answerSeconds = q?.responseSeconds ?? responseSeconds;
  const total = questions.length;
  const completed = m.index + (["answer_confirmed", "interview_complete", "submission_complete"].includes(m.status) ? 1 : 0);

  /* ---------- Question load → speak ---------- */
  useEffect(() => {
    if (m.status !== "loading_question" && m.status !== "next_question") return;
    dispatch({ type: "QUESTION_READY" });
  }, [m.status, m.index]);

  const playQuestion = useCallback((key: string, text: string) => {
    spokenKey.current = key;
    const id = ++playbackId.current;
    if (muted) return dispatch({ type: "TTS_SKIPPED" });
    if (!tts.supported) return dispatch({ type: "TTS_SKIPPED", notice: "This browser can't play the interviewer's voice. Read the question on screen." });
    void tts.speak(text).then(result => {
      if (!mounted.current || id !== playbackId.current) return;
      if (result === "completed") dispatch({ type: "TTS_DONE" });
      else dispatch({ type: "TTS_SKIPPED", notice: result === "blocked" ? "Audio needs your permission. Select Enable Audio to hear the question." : result === "cancelled" ? "Playback stopped. Read the question or replay it." : "The question couldn't be played aloud. Read it or select Enable Audio." });
    });
  }, [muted, tts]);
  const begin = () => {
    if (!q || spokenKey.current === `${m.index}-${m.playId}`) return;
    dispatch({ type: "START" }); dispatch({ type: "QUESTION_READY" });
    playQuestion(`${m.index}-${m.playId}`, q.text);
  };
  const replay = () => {
    if (!q || savingRef.current || sampleRef.current || !["ai_speaking", "awaiting_candidate", "answer_review", "error"].includes(stateRef.current.status)) return;
    dispatch({ type: "REPLAY" });
    // Invoke synthesis in the click handler to preserve browser user activation.
    playQuestion(`${m.index}-${m.playId + 1}`, q.text);
  };
  useEffect(() => {
    if (!q || (m.status !== "tts_ready" && m.status !== "ai_speaking")) return;
    const key = `${m.index}-${m.playId}`;
    if (spokenKey.current === key) return;
    playQuestion(key, q.text);
  }, [m.status, m.index, m.playId, q, playQuestion]);
  useEffect(() => {
    if (!muted) return;
    playbackId.current++;
    cancelSpeech();
    if (["tts_ready", "ai_speaking"].includes(stateRef.current.status)) dispatch({ type: "TTS_SKIPPED", notice: "Interviewer muted. Read the question on screen." });
  }, [muted, cancelSpeech]);

  // Move from tts_ready into ai_speaking once audio actually starts (ignored in other states).
  useEffect(() => {
    if (tts.status === "speaking" && stateRef.current.status === "tts_ready") dispatch({ type: "TTS_STARTED" });
  }, [tts.status]);

  /* ---------- Response timer ---------- */
  useEffect(() => {
    const running = m.responseStartedAt && ["awaiting_candidate", "microphone_initializing", "listening", "transcribing", "answer_review", "error"].includes(m.status);
    if (!running) { if (!m.responseStartedAt) setRemaining(answerSeconds); return; }
    const tick = () => {
      const left = Math.max(0, answerSeconds - Math.floor((Date.now() - m.responseStartedAt!) / 1000));
      setRemaining(left);
      if (left === 0 && !m.timedOut && (m.status === "awaiting_candidate" || m.status === "listening")) dispatch({ type: "TIMEOUT" });
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [m.status, m.responseStartedAt, m.timedOut, answerSeconds]);

  /* ---------- Microphone + recognition ---------- */
  const startAnswer = useCallback(async () => {
    if (busy.current || savingRef.current || sampleRef.current || !["awaiting_candidate", "answer_review", "error"].includes(stateRef.current.status)) return;
    busy.current = true;
    const id = ++captureId.current;
    playbackId.current++;
    recognitionLanguage.current = useAudioSettings.getState().lang;
    tts.cancel(); // never listen while the interviewer is talking
    dispatch({ type: "MIC_START" });
    const opened = await mic.open();
    if (!mounted.current || id !== captureId.current) return;
    if (!opened) {
      dispatch({ type: "MIC_FAILED", kind: "microphone", message: "Microphone access is needed to answer by voice." });
      busy.current = false;
      return;
    }
    const ok = await stt.start();
    if (!mounted.current || id !== captureId.current) return;
    if (!ok) {
      mic.close();
      dispatch({ type: "MIC_FAILED", kind: "recognition", message: sttErrorRef.current?.message ?? "Speech recognition couldn't start." });
    } else dispatch({ type: "MIC_READY" });
    busy.current = false;
  }, [mic, stt, tts]);

  const stopAnswer = useCallback(async () => {
    if (stopBusy.current || !["listening", "transcribing"].includes(stateRef.current.status)) return;
    stopBusy.current = true;
    const id = captureId.current;
    if (stateRef.current.status === "listening") dispatch({ type: "STOP" });
    const text = await stt.stop();
    stopBusy.current = false;
    if (!mounted.current || id !== captureId.current) return;
    mic.close();
    const snapshot = stt.getSnapshot();
    dispatch({ type: "TRANSCRIPT_READY", original: snapshot.rawFinalText ?? snapshot.finalText, interim: snapshot.interimText || undefined, text, cleaned: cleanTranscript(text), hasUnfinalized: snapshot.hasUnfinalized, notice: !text ? "We didn't catch any words. Try again, or type your answer." : snapshot.hasUnfinalized ? "Some words were not finalized by the browser. Check them carefully before confirming." : snapshot.lowConfidence ? "Some words may be uncertain. Review names, numbers and technical terms carefully." : undefined });
  }, [mic, stt]);

  useEffect(() => {
    if (m.status === "listening" && ["denied", "no-device", "in-use", "error"].includes(mic.status)) void stopAnswer();
  }, [m.status, mic.status, stopAnswer]);

  // Timeout while listening → finish the recording, keep the words.
  useEffect(() => {
    if (m.status === "transcribing" && m.timedOut && stt.status !== "stopping") void stopAnswer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.status, m.timedOut]);

  // Recognition failed mid-answer: keep captured words if any, otherwise show recovery options.
  useEffect(() => {
    if (m.status !== "listening" || (stt.status !== "error" && stt.status !== "idle") || stopBusy.current) return;
    mic.close();
    const snapshot = stt.getSnapshot();
    if (snapshot.originalText) {
      dispatch({ type: "STOP" });
      dispatch({ type: "TRANSCRIPT_READY", original: snapshot.rawFinalText ?? snapshot.finalText, interim: snapshot.interimText || undefined, text: snapshot.originalText, cleaned: cleanTranscript(snapshot.originalText), hasUnfinalized: snapshot.hasUnfinalized, notice: stt.error?.message ?? "Recognition stopped. Your captured words are preserved; review them before confirming." });
    } else dispatch({ type: "MIC_FAILED", kind: "recognition", message: stt.error?.message ?? "Speech recognition stopped unexpectedly." });
  }, [m.status, stt, mic]);

  /* ---------- Confirm / advance / complete ---------- */
  const confirm = async () => {
    if (savingRef.current || stateRef.current.status !== "answer_review" || !q) return;
    const text = m.draft.trim();
    if (!text) { toast.warning("Add an answer before confirming."); return; }
    const duration = m.responseStartedAt ? (Date.now() - m.responseStartedAt) / 1000 : 0;
    savingRef.current = true;
    setSaving(true); setSaveError(null);
    try {
        const metadata = m.originalTranscript !== undefined ? { originalTranscript: m.originalTranscript, interimTranscript: m.interimTranscript, cleanedTranscript: m.cleanedTranscript, hasUnfinalized: !!m.hasUnfinalized, language: recognitionLanguage.current, cleanupVersion: "format-v2-final-separated" } : undefined;
        await onAnswerConfirmed?.(q, text, duration, m.inputMode, metadata);
        if (!mounted.current) return;
        setSaveError(null);
        dispatch({ type: "CONFIRM" });
        toast.success(practice ? "Practice answer complete." : "Answer saved.");
      } catch (e) {
        if (!mounted.current) return;
        // Keep the transcript on screen; nothing advances until the server confirms the save.
        const msg = e instanceof Error && e.message ? e.message : "Your answer couldn't be saved.";
        setSaveError(msg);
        toast.error("Answer not saved.", { description: msg });
        return;
      } finally {
        savingRef.current = false;
        if (mounted.current) setSaving(false);
      }
  };

  useEffect(() => {
    if (m.status !== "answer_confirmed") return;
    const t = setTimeout(() => dispatch({ type: "NEXT", total }), reduce ? 0 : 250);
    return () => clearTimeout(t);
  }, [m.status, total, reduce]);

  useEffect(() => {
    if (m.status !== "interview_complete") return;
    tts.cancel();
    stt.abort();
    mic.close();
    const t = setTimeout(() => { onComplete(); dispatch({ type: "SUBMITTED" }); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.status]);

  /* ---------- Optional camera preview (never recorded) ---------- */
  const toggleCamera = async () => {
    if (cameraPending.current) return;
    if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camera.current = null; setCamStream(null); return; }
    const id = ++cameraId.current; cameraPending.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 } }, audio: false });
      if (!mounted.current || id !== cameraId.current) { stream.getTracks().forEach(track => track.stop()); return; }
      camera.current = stream; setCamStream(stream);
    }
    catch { if (mounted.current) toast.error("Camera preview isn't available.", { description: "Check camera permissions. The interview works without it." }); }
    finally { cameraPending.current = false; }
  };
  useEffect(() => () => camStream?.getTracks().forEach((t) => t.stop()), [camStream]);

  useEffect(() => {
    if (m.status === "answer_review" && m.inputMode === "typed") textareaRef.current?.focus();
  }, [m.status, m.inputMode]);

  /* ---------- Derived UI ---------- */
  const micState: MicButtonState =
    saving || samplePlaying ? "disabled" : m.status === "microphone_initializing" ? "initializing" : m.status === "listening" ? "listening" : m.status === "transcribing" ? "processing" : m.status === "answer_review" && m.inputMode === "voice" && m.draft ? "captured" : ["awaiting_candidate", "answer_review", "error"].includes(m.status) ? "idle" : "disabled";
  const canReplay = !saving && !samplePlaying && !!q && ["ai_speaking", "awaiting_candidate", "answer_review", "error"].includes(m.status) && tts.supported && !muted;
  const speaking = m.status === "ai_speaking";
  const yourTurn = ["awaiting_candidate", "microphone_initializing", "listening", "transcribing", "answer_review", "error"].includes(m.status);
  const sttUnavailable = !stt.supported;

  const statusPill = (
    <span className={cn("inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-200",
      speaking ? "border-brand/30 bg-accent-soft text-brand dark:text-blue-200" : m.status === "listening" ? "border-brand/40 bg-brand text-white" : yourTurn ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "border-subtle bg-overlay/[0.04] text-fg-secondary")}>
      {["loading_question", "tts_ready", "transcribing", "next_question", "interview_complete"].includes(m.status) ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className={cn("size-2 rounded-full", speaking ? "bg-brand" : m.status === "listening" ? "bg-white" : yourTurn ? "bg-emerald-500" : "bg-slate-400")} aria-hidden />}
      {speaking && tts.status === "paused" ? "Playback Paused" : m.status === "awaiting_candidate" ? "Your Turn — click the microphone" : m.status === "listening" && stt.speechDetected ? "Speech detected" : STATE_LABEL[m.status]}
    </span>
  );

  const workspace = (
    <div className={cn("grid gap-5", variant === "session" ? "lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] lg:gap-6" : "lg:grid-cols-[1fr_320px]")}>
      <div className="min-w-0 space-y-5">
        {/* AI interviewer */}
        <section aria-label="AI interviewer" className="surface relative overflow-hidden rounded-2xl p-4 sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_220px_at_15%_50%,rgba(37,99,235,calc(0.14*var(--glow-k))),transparent_70%)]" aria-hidden />
          <div className="relative flex items-center gap-4 sm:gap-6">
            <motion.div animate={{ opacity: m.status === "listening" ? 0.75 : 1, scale: speaking && !reduce ? 1.03 : 1 }} transition={{ duration: 0.4 }} className="w-[92px] shrink-0 sm:w-[128px] lg:w-[148px]">
              <AICore state={coreFor(m.status)} particles={false} label={`AI interviewer — ${STATE_LABEL[m.status]}`} />
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-muted">AI Interviewer</p>
              <p className="mt-0.5 truncate text-sm text-fg-secondary">{tts.voice ? "English voice" : muted ? "Muted" : "Text only"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {statusPill}
                <AudioWaveform active={speaking && tts.status !== "paused"} bars={22} className="h-6" />
              </div>
            </div>
          </div>
        </section>

        {/* Question card */}
        <section aria-label="Current question" className={cn("surface rounded-2xl p-6 transition-[border-color,box-shadow] duration-300 sm:p-7", speaking && "surface-glow")}>
          <AnimatePresence mode="wait">
            {q && m.status !== "idle" ? (
              <motion.div key={q.id} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.4, ease: EASE }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[13px]">
                    <span className="font-display font-semibold text-brand-cyan">{practice ? "Practice question" : `Question ${String(m.index + 1).padStart(2, "0")} of ${String(total).padStart(2, "0")}`}</span>
                    <span className="text-fg-disabled"> · </span>
                    <span className="text-fg-muted">{practice ? "Not scored" : q.category}</span>
                  </p>
                  <div className="flex items-center gap-1">
                    {speaking && tts.canPause && (
                      <Tooltip content={tts.status === "paused" ? "Resume" : "Pause"}>
                        <Button variant="ghost" size="icon-sm" onClick={() => (tts.status === "paused" ? tts.resume() : tts.pause())} aria-label={tts.status === "paused" ? "Resume question" : "Pause question"}>{tts.status === "paused" ? <Play /> : <Pause />}</Button>
                      </Tooltip>
                    )}
                    <Tooltip content={canReplay ? "Hear the question again" : muted ? "Interviewer is muted" : "Available after the question is read"}>
                      <span><Button variant="ghost" size="sm" disabled={!canReplay} onClick={replay}><RotateCcw />Replay</Button></span>
                    </Tooltip>
                  </div>
                </div>
                <p className="mt-4 font-display text-xl font-semibold leading-[1.45] text-fg sm:text-2xl">{q.text}</p>
                <p className="mt-3 text-xs text-fg-muted">{muted ? "Interviewer muted — read the question above." : TTS_STATUS_LABEL[tts.status]}</p>
              </motion.div>
            ) : (
              <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-4 text-center">
                <p className="max-w-md text-sm leading-relaxed text-fg-secondary">
                  {startIndex > 0 ? `Welcome back. You've completed ${startIndex} of ${total} questions — you'll continue from question ${startIndex + 1}.` : practice ? "The AI interviewer will read one practice question aloud. Then click the microphone and answer." : `The AI interviewer will read ${total} questions aloud, one at a time. After each question, click the microphone, answer, then review and confirm.`}
                </p>
                <Button size="lg" onClick={begin}><Volume2 />{startIndex > 0 ? "Continue Voice Interview" : practice ? "Start Practice" : "Start Voice Interview"}</Button>
                <p className="text-xs text-fg-muted">Sound will play. Your microphone stays off until you click it.</p>
              </motion.div>
            )}
          </AnimatePresence>
          {m.notice && m.status !== "answer_review" && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3 text-[13px] text-amber-800 dark:text-amber-100" role="status">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1">{m.notice}</span>
              {canReplay && <Button size="sm" variant="secondary" onClick={replay}>Enable Audio</Button>}
            </div>
          )}
        </section>

        {/* Response */}
        {m.status !== "idle" && (
          <section aria-label="Your response" className={cn("surface rounded-2xl p-6 transition-[border-color] duration-300 sm:p-7", m.status === "listening" && "border-brand/40")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Your Response</h2>
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                {m.inputMode === "typed" && m.status === "answer_review" && <Badge tone="neutral">Typed fallback</Badge>}
                {m.inputMode === "voice" && (m.status === "listening" || (m.status === "answer_review" && m.draft)) && <Badge tone="blue">Speech-to-Text</Badge>}
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center gap-5 md:flex-row md:items-start">
              {!sttUnavailable && (
                <div className="flex shrink-0 flex-col items-center gap-3">
                  <MicButton state={micState} onClick={() => (m.status === "listening" ? void stopAnswer() : void startAnswer())} />
                </div>
              )}
              <div className="w-full min-w-0 flex-1">
                {m.status === "listening" || m.status === "transcribing" || m.status === "microphone_initializing" ? (
                  <div className="min-h-[120px] rounded-xl border border-subtle bg-overlay/[0.02] p-4" aria-live="polite">
                    {m.status === "microphone_initializing" && <Button size="sm" variant="ghost" onClick={() => { captureId.current++; busy.current = false; stt.abort(); mic.close(); dispatch({ type: "MIC_CANCEL" }); }}>Cancel microphone start</Button>}
                    <LiveLevelMeter getLevel={mic.getLevel} active={m.status === "listening"} className="mb-3 h-8 justify-start" />
                    {stt.finalText || stt.interim ? (
                      <p className="text-[15px] leading-relaxed text-fg">
                        {stt.originalText}<span className="sr-only">{stt.hasUnfinalized ? " (includes interim words)" : ""}</span>
                        {stt.hasUnfinalized && <span className="mt-2 block text-xs text-fg-muted">Interim words may change as recognition continues.</span>}
                      </p>
                    ) : (
                      <p className="text-sm text-fg-muted">{m.status === "microphone_initializing" ? "Starting the microphone…" : m.status === "transcribing" ? "Finishing transcription…" : "Speak naturally — your words appear here as they are recognised."}</p>
                    )}
                    {mic.lowInput && m.status === "listening" && <p className="mt-3 text-xs text-amber-700 dark:text-amber-200">We can barely hear you. Move closer to the microphone or check the selected device.</p>}
                  </div>
                ) : m.status === "answer_review" ? (
                  <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    <label htmlFor="answer-draft" className="sr-only">Your answer</label>
                    <Textarea
                      id="answer-draft"
                      ref={textareaRef}
                      value={m.draft}
                      readOnly={saving}
                      onChange={(e) => dispatch({ type: "EDIT", text: e.target.value })}
                      onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 250)}
                      placeholder={m.inputMode === "typed" ? "Type your answer here…" : "Your transcript will appear here."}
                      className="min-h-[140px] text-[15px]"
                    />
                    {m.notice && <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">{m.notice}</p>}
                    <p className="mt-2 text-xs text-fg-muted">Speech recognition can make mistakes. Review and edit before confirming. Your confirmed version is used for assessment.</p>
                    {m.originalTranscript !== undefined && (
                      <details className="mt-3 rounded-xl border border-subtle p-3 text-xs">
                        <summary className="cursor-pointer font-medium">Original and formatted transcript</summary>
                        <p className="mt-3 font-medium">Original finalized recognition</p>
                        <p className="mt-1 whitespace-pre-wrap text-fg-secondary">{m.originalTranscript || "No words captured."}</p>
                        {m.interimTranscript && <div className="mt-3"><p className="font-medium">Unfinalized words · check carefully</p><p className="mt-1 whitespace-pre-wrap text-fg-secondary">{m.interimTranscript}</p></div>}
                        <p className="mt-3 font-medium">Formatting preview</p>
                        <p className="mt-1 whitespace-pre-wrap text-fg-secondary">{m.cleanedTranscript}</p>
                        <p className="mt-2 text-fg-muted">Local capitalization, spacing and final punctuation only. No words or technical corrections are added.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" disabled={saving || !m.cleanedTranscript} onClick={() => dispatch({ type: "EDIT", text: m.cleanedTranscript ?? m.draft })}>Use formatted version</Button>
                          <Button size="sm" variant="ghost" disabled={saving} onClick={() => dispatch({ type: "EDIT", text: m.originalTranscript ?? m.draft })}>Restore original</Button>
                        </div>
                        {m.draft !== m.originalTranscript && <p className="mt-2 text-fg-muted">Edited version · original retained with your answer.</p>}
                      </details>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={() => void confirm()} disabled={!m.draft.trim()} loading={saving}>{!saving && <CheckCircle2 />}{saving ? "Saving…" : saveError ? "Retry Saving" : practice ? "Complete Practice" : m.index + 1 < total ? "Confirm Answer" : "Confirm & Submit"}</Button>
                      <Button variant="secondary" disabled={saving} onClick={() => { setSaveError(null); dispatch({ type: "RETRY" }); }}><RotateCcw />Retry Answer</Button>
                    </div>
                    {saveError && (
                      <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] p-2.5 text-xs text-red-700 dark:text-red-200">
                        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                        <span>Not saved yet: {saveError} Your answer is still here — press Retry Saving.</span>
                      </p>
                    )}
                  </motion.div>
                ) : m.status === "error" ? (
                  <div className="rounded-xl border border-danger/30 bg-danger/[0.06] p-4" role="alert">
                    <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-200"><AlertTriangle className="size-4" aria-hidden />{m.error?.kind === "microphone" ? "Microphone Access Needed" : "Speech Recognition Unavailable"}</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">{m.error?.kind === "microphone" ? mic.error ?? m.error.message : m.error?.message}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void startAnswer()}><RotateCcw />Retry Microphone</Button>
                      <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "TYPE_INSTEAD" })}><Keyboard />Type Answer</Button>
                      {onHelp && <Button size="sm" variant="ghost" onClick={onHelp}>Troubleshooting</Button>}
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[120px] flex-col justify-center gap-3 rounded-xl border border-dashed border-subtle p-4 text-sm text-fg-muted">
                    {sttUnavailable ? (
                      <>
                        <p className="flex items-start gap-2 text-amber-800 dark:text-amber-100"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />Voice transcription isn&apos;t available in this browser. Availability varies by browser and device. You can type your answers instead.</p>
                        <Button className="self-start" variant="secondary" disabled={!yourTurn} onClick={() => dispatch({ type: "TYPE_INSTEAD" })}><Keyboard />Type Answer</Button>
                      </>
                    ) : speaking ? (
                      <p>Listen to the question. The microphone unlocks when the interviewer finishes.</p>
                    ) : yourTurn ? (
                      <>
                        <p>Click the microphone and answer out loud. Click it again when you&apos;re done.</p>
                        <button type="button" onClick={() => dispatch({ type: "TYPE_INSTEAD" })} className="self-start text-xs text-brand-cyan underline-offset-4 hover:underline">Prefer to type? Type your answer instead</button>
                      </>
                    ) : m.status === "submission_complete" ? (
                      <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" aria-hidden />{practice ? "Practice complete. You can continue when ready." : "All answers submitted."}</p>
                    ) : m.status === "answer_confirmed" || m.status === "interview_complete" ? (
                      <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" aria-hidden />{m.status === "interview_complete" ? (practice ? "Practice complete." : "All answers saved. Submitting your interview…") : "Answer saved. Preparing the next question…"}</p>
                    ) : (
                      <p>Preparing the next question…</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Side panel */}
      <aside className="min-w-0 space-y-4" aria-label="Timer and camera">
        <div className="surface rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <ResponseTimer remaining={remaining} total={answerSeconds} active={!!m.responseStartedAt && yourTurn} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{m.timedOut ? "Response time is up" : yourTurn ? "Response time" : "Timer starts after the question"}</p>
              <p className="text-xs text-fg-muted">Up to {formatDuration(answerSeconds)} per answer. Your answer is kept if time runs out.</p>
            </div>
          </div>
        </div>

        <div className="surface rounded-2xl p-3">
          <CameraPreview className="aspect-video" stream={recordingStream ?? camStream} name={candidateName} micOn={m.status === "listening"} camOn={!!(recordingStream?.getVideoTracks().length || camStream)} label={recordingStream ? "Recording devices — see recording controls above" : camStream ? "Your camera preview — not recorded" : "Camera preview is off"} />
          <div className="mt-3 flex items-center justify-between gap-2 px-1">
            <p className="text-xs text-fg-muted">{recordingStream ? "Consented recording sources are active." : camStream ? "Preview only — not recorded." : "Optional local camera preview."}</p>
            {!recordingStream && <Button size="sm" variant="secondary" onClick={() => void toggleCamera()}>{camStream ? <><CameraOff />Hide</> : <><Camera />Show camera</>}</Button>}
          </div>
        </div>

        {!practice && (
          <ol className="surface hidden rounded-2xl p-2 lg:block" aria-label="Questions">
            {questions.map((qq, i) => {
              const done = i < completed;
              const cur = i === m.index && !done;
              return (
                <li key={qq.id} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm", cur && "bg-overlay/[0.05]")}>
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold", done ? "bg-brand text-white" : cur ? "border border-brand text-brand dark:border-brand-cyan dark:text-brand-cyan" : "border border-subtle text-fg-disabled")}>
                    {done ? <CheckCircle2 className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className={cn("truncate", cur ? "text-fg" : done ? "text-fg-secondary" : "text-fg-muted")}>{qq.category}</span>
                </li>
              );
            })}
          </ol>
        )}
        {variant === "session" && <div className="hidden justify-center pt-2 lg:flex"><PoweredByConnectivo size="sm" /></div>}
      </aside>
    </div>
  );

  const settingsDrawer = (
    <Drawer open={settingsOpen} onOpenChange={setSettingsOpen} title="Audio Settings" description="Voice, microphone, and speech recognition">
      <div className="p-5">
        <AudioSettingsPanel voices={tts.voices} voice={tts.voice} testDisabled={saving || !["idle", "awaiting_candidate", "answer_review", "error"].includes(m.status)} settingsLocked={saving || ["microphone_initializing", "listening", "transcribing"].includes(m.status)} onTestVoice={(text) => {
          if (savingRef.current || !["idle", "awaiting_candidate", "answer_review", "error"].includes(stateRef.current.status)) return;
          sampleRef.current = true; setSamplePlaying(true);
          void tts.speak(text).finally(() => { sampleRef.current = false; if (mounted.current) setSamplePlaying(false); });
        }} devices={mic.devices} support={mic.support} applied={mic.applied} micActive={mic.status === "active"} onSelectDevice={(id) => void mic.selectDevice(id)} />
      </div>
    </Drawer>
  );

  const announce = <div className="sr-only" role="status" aria-live="polite">{m.status === "ai_speaking" && q ? `Question ${m.index + 1} of ${total}. ${q.text}` : STATE_LABEL[m.status]}</div>;

  if (variant === "embedded") {
    return (
      <div>
        {announce}
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAudio({ muted: !muted })}>{muted ? <VolumeX /> : <Volume2 />}{muted ? "Unmute" : "Mute"} interviewer</Button>
          <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}><Settings2 />Audio settings</Button>
        </div>
        {workspace}
        {settingsDrawer}
      </div>
    );
  }

  return (
    <div className="app-backdrop relative flex min-h-dvh flex-col">
      {announce}
      <header className="relative z-20 border-b border-subtle bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <AppLogo href="/candidate/interview" size="sm" className="shrink-0" />
            <span className="hidden h-6 w-px bg-overlay/10 md:block" aria-hidden />
            <span className="hidden truncate text-sm text-fg-secondary md:block">{roleTitle}</span>
          </div>
          <div className="hidden lg:block"><InterviewProgress total={total} current={m.index} completed={completed} /></div>
          <div className="flex items-center gap-1 sm:gap-2">
            <span className={cn("hidden items-center gap-1.5 text-xs sm:flex", online ? "text-fg-muted" : "text-danger")}>{online ? <Wifi className="size-3.5 text-success" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}{online ? "Online" : "Offline"}</span>
            <ThemeToggle size="icon-sm" className="size-9" />
            {onHelp && <Button variant="ghost" size="sm" onClick={onHelp}><HelpCircle /><span className="hidden sm:inline">Help</span></Button>}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-subtle px-4 py-2 lg:hidden">
          <InterviewProgress total={total} current={m.index} completed={completed} />
          <span className="text-xs text-fg-muted">Q{Math.min(m.index + 1, total)} of {total}</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 pb-28 sm:px-6 lg:py-8">{workspace}</main>

      {/* Control bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-subtle bg-ink-950/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-[1400px] items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Tooltip content={muted ? "Unmute the interviewer" : "Mute the interviewer (questions stay on screen)"}>
              <Button variant="secondary" size="icon" onClick={() => { setAudio({ muted: !muted }); if (!muted) tts.cancel(); }} aria-label={muted ? "Unmute interviewer" : "Mute interviewer"} aria-pressed={muted}>{muted ? <VolumeX /> : <Volume2 />}</Button>
            </Tooltip>
            <Tooltip content="Audio settings">
              <Button variant="secondary" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Audio settings"><Settings2 /></Button>
            </Tooltip>
            <span className="ml-1 hidden items-center gap-2 text-xs text-fg-muted md:flex">
              <span className={cn("size-2 rounded-full", m.status === "listening" ? "bg-brand" : "bg-slate-400")} aria-hidden />
              {m.status === "listening" ? "Microphone on — transcribing" : "Microphone off"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {m.status === "listening" && <Button className="lg:hidden" onClick={() => void stopAnswer()}>Stop</Button>}
            {m.status === "answer_review" && <Button className="lg:hidden" onClick={() => void confirm()} disabled={!m.draft.trim()} loading={saving}>{saving ? "Saving…" : "Confirm"}</Button>}
            <Tooltip content="Hear the question again">
              <span><Button variant="secondary" size="md" disabled={!canReplay} onClick={replay}><RotateCcw /><span className="hidden sm:inline">Replay</span></Button></span>
            </Tooltip>
            {onExit && (
              <Tooltip content="Leave the interview — confirmed answers are kept">
                <Button variant="danger" size="md" disabled={saving || m.status === "interview_complete" || m.status === "submission_complete"} onClick={() => {
                  tts.cancel();
                  if (m.status === "microphone_initializing") { captureId.current++; busy.current = false; stt.abort(); mic.close(); dispatch({ type: "MIC_CANCEL" }); }
                  if (m.status === "listening") void stopAnswer();
                  onExit();
                }}>
                  <PhoneOff /><span className="hidden sm:inline">End</span>
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      {settingsDrawer}
    </div>
  );
}
