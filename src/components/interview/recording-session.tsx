"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { InterviewOSLoader } from "@/components/ui/interviewos-loader";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useFocusedInterview } from "@/hooks/use-focused-interview";
import { RecordingController } from "@/services/recording/controller";
import type { RecordingPolicy, RecordingSnapshot } from "@/services/recording/types";

export function RecordingSession({ sessionId, children }: { sessionId: string; children: (controls: { stream?: MediaStream; finish: (next: () => void) => void }) => ReactNode }) {
  const [policy, setPolicy] = useState<RecordingPolicy>();
  const focus = useFocusedInterview();
  const [error, setError] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [consent, setConsent] = useState(false), [monitoring, setMonitoring] = useState(false), [systemAudio, setSystemAudio] = useState(false);
  const [snapshot, setSnapshot] = useState<RecordingSnapshot>();
  const [notice, setNotice] = useState(false), [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pendingNext, setPendingNext] = useState<(() => void) | null>(null);
  const [abandoned, setAbandoned] = useState<{ id: string }[]>([]);
  const controller = useRef<RecordingController | null>(null), canvas = useRef<HTMLCanvasElement>(null), locked = useRef(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pendingNext) { panel.current?.scrollIntoView?.({ block: "start" }); panel.current?.focus({ preventScroll: true }); }
  }, [pendingNext]);
  useEffect(() => {
    if (pendingNext && !busy && snapshot?.state === "UPLOADED") { setPendingNext(null); pendingNext(); }
  }, [pendingNext, busy, snapshot?.state]);
  useEffect(() => {
    let active = true;
    Promise.all([apiRequest<RecordingPolicy>("/recordings/policy"), apiRequest<{ recordings: { id: string; status: string }[] }>("/recordings", { query: { sessionId } })]).then(([p, rows]) => { if (active) { setPolicy(p.data); setAbandoned(rows.data.recordings.filter(r => ["RECORDING", "UPLOADING"].includes(r.status))); } }).catch(() => { if (active) setError("Recording readiness could not be checked. Retry or continue your interview without recording."); });
    return () => { active = false; };
  }, [sessionId, attempt]);
  useEffect(() => () => controller.current?.dispose(), []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (controller.current && !["UPLOADED", "CANCELLED", "NOT_REQUESTED"].includes(controller.current.snapshot.state)) event.preventDefault(); };
    const hide = () => controller.current?.dispose();
    window.addEventListener("beforeunload", warn); window.addEventListener("pagehide", hide);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("pagehide", hide); };
  }, []);
  const prepare = () => {
    if (!policy || !canvas.current || !consent || locked.current) return;
    if (!controller.current) controller.current = new RecordingController(sessionId, policy, setSnapshot, () => setNotice(true));
    // No await before this call: browser permission needs the user's click activation.
    void controller.current.prepare(canvas.current, systemAudio);
  };
  const perform = async (action: () => Promise<void>) => {
    if (locked.current) return; locked.current = true; setBusy(true); setError("");
    try { await action(); } catch (e) { setError(`${e instanceof Error ? e.message : "Recording could not be saved or cleared."} Your confirmed answers are safe.`); }
    finally { locked.current = false; setBusy(false); }
  };
  const finish = (next: () => void) => {
    if (!controller.current) { next(); return; }
    setPendingNext(() => next);
    void perform(async () => { await controller.current!.finish(); setPendingNext(null); next(); });
  };
  const reset = async () => { const current = controller.current; if (current?.snapshot.state !== "UPLOADED") await current?.cancel(); current?.dispose(); controller.current = null; setSnapshot(undefined); setConsent(false); setMonitoring(false); setSystemAudio(false); setAttempt(n => n + 1); };
  const state = snapshot?.state;
  const capturing = state === "RECORDING" || state === "PAUSED";
  const preview = state === "CAPTURE_READY";
  return <>
    {allowed && (capturing || snapshot?.interrupted || ["FAILED", "FINALIZING", "UPLOADING"].includes(state ?? "")) && <div role="status" className="fixed bottom-4 left-4 right-4 z-40 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-subtle bg-ink-950 p-3 shadow-lg sm:left-auto"><span className="text-sm font-semibold">● {capturing ? state === "PAUSED" ? "Recording paused" : "Recording active" : snapshot?.interrupted ? "Capture interrupted" : state?.toLowerCase()}</span>{capturing ? <Button size="sm" variant="secondary" loading={busy} onClick={() => void perform(() => controller.current!.finish())}>Stop capture</Button> : <Button size="sm" variant="secondary" onClick={() => { panel.current?.scrollIntoView({ block: "start" }); panel.current?.focus({ preventScroll: true }); }}>Review recording status</Button>}</div>}
    <section ref={panel} tabIndex={-1} aria-label="Interview recording" className="mx-auto w-full max-w-6xl space-y-4 rounded-2xl border border-subtle bg-panel p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold">{allowed ? "Interview recording" : "Recording & privacy"}</h2><span role="status" aria-live="polite" className="text-sm font-medium">{state === "SCREEN_READY" ? "Awaiting camera/microphone permissions" : state?.replaceAll("_", " ") ?? (policy?.available ? "Awaiting consent" : policy ? "Disabled" : "Checking readiness")}</span></div>
      {policy?.mode === "local_test" && <p className="rounded-xl border border-amber-400/40 p-3 text-sm font-medium">Isolated local recording test — fictional participants only. Test media expires after one day and is deleted during test cleanup. This is not an approved policy for real applicants. Ask the local test operator for help or an alternative.</p>}
      <div className="space-y-2 rounded-xl border border-subtle p-3 text-sm"><p>Optional focused mode fills the screen with your interview. Press Esc to leave fullscreen at any time. It cannot prevent switching tabs or applications, and leaving it does not fail your interview.</p><Button size="sm" variant="secondary" onClick={() => void focus.toggle()}>{focus.active ? "Exit Fullscreen" : "Enter Fullscreen"}</Button>{focus.error && <p role="status">{focus.error}</p>}</div>
      {!policy && !error && <InterviewOSLoader variant="inline" message="Checking recording readiness…" />}
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-200">{error}</p>}
      {!policy && error && <Button variant="secondary" onClick={() => { setError(""); setAttempt(n => n + 1); }}>Retry readiness</Button>}
      {policy && !policy.available && <p className="text-sm text-fg-secondary">{policy.reason}</p>}
      {policy?.available && !capturing && !["FINALIZING", "UPLOADING", "UPLOADED"].includes(state ?? "") && <>
        <p className="text-sm text-fg-secondary">With your permission, we record your {policy.screenRequirement === "full_display" ? "entire chosen display" : "chosen screen, window or tab"}, {policy.cameraEnabled ? "camera and " : ""}microphone for authorized HR interview review. You can stop capture at any time. Avoid sharing unrelated personal information. Recording expires after {policy.retentionDays} days under policy <strong>{policy.policyReference}</strong>.</p>
        <p className="text-sm text-fg-secondary">Shared audio is optional and depends on your browser and selected source. The interviewer’s spoken questions may be absent; the written questions and confirmed answers remain available. Use headphones to reduce echo. Recording does not lock your computer or determine your assessment outcome.</p>
        <p className="text-sm"><a className="underline" href="/privacy" target="_blank" rel="noreferrer">Privacy notice</a> · {policy.mode === "local_test" ? "Request an alternative or deletion from the local test operator; you may also continue without recording." : <a className="underline" href={`mailto:${policy.supportEmail}`}>Request an alternative assessment or deletion</a>}</p>
        {abandoned.length > 0 ? <div className="space-y-2"><p className="text-sm">A previous capture did not finish. Refreshing discards unsent media; your confirmed answers remain saved. Clear the incomplete capture before starting again.</p><Button loading={busy} onClick={() => void perform(async () => { for (const r of abandoned) await apiRequest(`/recordings/${r.id}`, { method: "DELETE" }); setAbandoned([]); })}>Clear incomplete capture</Button></div> : <>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={consent} disabled={preview || state === "SCREEN_READY" || state === "PERMISSION_PENDING" || !!controller.current && state === "FAILED"} onChange={e => setConsent(e.target.checked)} className="mt-1" />I consent to the sources and retention described above.</label>
          {policy.monitoringEnabled && <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={monitoring} disabled={preview || state === "SCREEN_READY" || state === "PERMISSION_PENDING"} onChange={e => setMonitoring(e.target.checked)} className="mt-1" />I also consent to technical events during recording: tab visibility, window focus, fullscreen and capture interruptions. These are not evidence of misconduct.</label>}
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={systemAudio} disabled={preview || state === "SCREEN_READY" || state === "PERMISSION_PENDING"} onChange={e => setSystemAudio(e.target.checked)} className="mt-1" />Include audio from the shared source if my browser offers it.</label>
          {!preview && !state && <Button disabled={!consent} onClick={prepare}>Start Screen Sharing</Button>}
          {state === "SCREEN_READY" && <Button onClick={() => { if (canvas.current) void controller.current?.enableDevices(canvas.current); }}>Enable {policy.cameraEnabled ? "Camera & " : ""}Microphone</Button>}
        </>}
      </>}
      <canvas ref={canvas} aria-label="Preview of the exact recording composition" className={`${preview ? "block" : "hidden"} aspect-video w-full max-w-xl rounded-xl bg-black`} />
      {preview && <><ul className="grid gap-2 text-sm sm:grid-cols-2"><li>Screen: ready ({snapshot?.surface})</li><li>Camera: {policy?.cameraEnabled ? "ready" : "not requested"}</li><li>Microphone: ready</li><li>Format: {snapshot?.mimeType}</li><li>Upload: private storage ready</li><li>Connection: {navigator.onLine ? "browser reports online; checked again at start" : "offline — reconnect before starting"}</li><li>Shared audio: {snapshot?.systemAudio ? "provided" : "not provided"}</li></ul><Button loading={busy} onClick={() => void perform(async () => { if (!navigator.onLine) throw new Error("Offline"); await controller.current?.start(monitoring); if (controller.current?.snapshot.state === "RECORDING") setAllowed(true); })}>Start recording & continue interview</Button></>}
      {snapshot?.message && <p role="status" className="text-sm text-fg-secondary">{snapshot.message}</p>}
      {snapshot?.interrupted && <p role="alert" className="text-sm text-amber-700 dark:text-amber-200">Screen sharing or a required device stopped. Your recording was interrupted. Only the available segment can be saved. Prepare another recording segment to retry sharing; confirmed answers are preserved.</p>}
      {capturing && <p className="text-sm">Microphone capture active · Camera {policy?.cameraEnabled ? "active" : "off"} · Shared source {snapshot?.surface}. Stopping recording leaves your interview answers intact.</p>}
      {snapshot && snapshot.capturedBytes > 0 && <p className="text-xs text-fg-muted">Upload confirmed: {(snapshot.uploadedBytes / 1048576).toFixed(1)} / {(snapshot.capturedBytes / 1048576).toFixed(1)} MB captured. Keep this page open until storage confirms completion.</p>}
      <div className="flex flex-wrap gap-2">
        {capturing && <Button variant="secondary" loading={busy} onClick={() => void perform(() => controller.current!.finish())}>Stop & save recording</Button>}
        {state === "PAUSED" && <><Button variant="secondary" onClick={() => controller.current?.retry()}>Retry upload</Button><Button onClick={() => controller.current?.resume()}>Resume recording when ready</Button></>}
        {state === "FAILED" && <><Button loading={busy} onClick={() => void perform(async () => { await controller.current!.finish(); if (controller.current?.snapshot.state === "UPLOADED" && pendingNext) { setPendingNext(null); pendingNext(); } })}>Retry saving</Button><Button variant="secondary" loading={busy} onClick={() => void perform(reset)}>Cancel capture & retry setup</Button></>}
        {state === "UPLOADED" && !pendingNext && <Button variant="secondary" onClick={() => void perform(reset)}>Prepare another recording segment</Button>}
        {(preview || state === "PERMISSION_PENDING" || state === "SCREEN_READY") && <Button variant="secondary" onClick={() => void perform(reset)}>Cancel capture</Button>}
        {!allowed && <Button variant="secondary" loading={busy} onClick={() => void perform(async () => { await reset(); setAllowed(true); })}>Continue without recording</Button>}
        {pendingNext && !busy && <Button variant="secondary" onClick={() => { controller.current?.dispose(); setPendingNext(null); pendingNext(); }}>Continue with saved answers; media may be incomplete</Button>}
      </div>
      <Dialog open={notice} onOpenChange={setNotice}><DialogContent title="Interview Focus Notice" description="You switched away from your interview. Please return to the interview page and continue when you're ready." size="sm"><p className="text-sm text-fg-secondary">Permission dialogs, notifications and accessibility tools can also change focus. This notice does not fail your interview or imply misconduct.</p><DialogFooter><Button onClick={() => setNotice(false)}>Continue Interview</Button></DialogFooter></DialogContent></Dialog>
    </section>
    {allowed && children({ stream: capturing ? controller.current?.devices : undefined, finish })}
  </>;
}
