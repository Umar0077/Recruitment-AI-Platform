"use client";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { InterviewOSLoader } from "@/components/ui/interviewos-loader";
type Recording = { id: string; status: string; durationMs: number | null; sizeBytes: number | null; createdAt: string; retentionUntil: string; displaySurface: string; policyReference: string };
type Review = { recordings: Recording[]; events: { id: string; type: string; occurredAt: string; durationMs?: number; captureState: string }[] };
export function RecordingReview({ sessionId }: { sessionId: string }) {
  const auth = useAuth();
  const [data, setData] = useState<Review>(), [error, setError] = useState(""), [pending, setPending] = useState(false);
  const [playback, setPlayback] = useState<{ id: string; url: string; expiresAt: string }>();
  const load = useCallback(async () => {
    setPending(true); setError("");
    try { setData((await apiRequest<Review>("/recordings", { query: { sessionId }, admin: true })).data); }
    catch { setError("Recording information could not be loaded. Check your access or retry."); }
    finally { setPending(false); }
  }, [sessionId]);
  useEffect(() => { void load(); return () => setPlayback(undefined); }, [load]);
  const play = async (id: string) => {
    setPending(true); setError("");
    try { const { data } = await apiRequest<{ url: string; expiresAt: string }>(`/recordings/${id}/playback`, { admin: true }); setPlayback({ id, ...data }); }
    catch { setError("Playback is unavailable. The interview must have ended, the upload must be verified, and your account must have review access. Expired or deleted recordings cannot be played."); }
    finally { setPending(false); }
  };
  return <section className="space-y-4 rounded-xl border border-subtle p-4" aria-label="Recording review">
    <h2 className="text-lg font-semibold">Private recordings</h2>
    <p className="text-sm text-fg-secondary">Technical observations can reflect permission dialogs, notifications or accessibility tools. They are not evidence of misconduct and do not affect scores.</p>
    {pending && <InterviewOSLoader variant="inline" message="Loading recording…" />}
    {error && <div role="alert"><p className="text-sm text-red-700 dark:text-red-200">{error}</p><Button variant="secondary" size="sm" onClick={() => void load()}>Retry</Button></div>}
    {data?.recordings.length === 0 && <p className="text-sm text-fg-muted">No recording is available. Confirmed answers remain available in Questions &amp; Answers.</p>}
    {data?.recordings.map(r => <article key={r.id} className="space-y-2 rounded-xl border border-subtle p-4 text-sm">
      <p className="font-medium">{r.status.replaceAll("_", " ")} · {r.durationMs == null ? "Duration unavailable" : `${Math.round(r.durationMs / 1000)} seconds`} · {r.sizeBytes == null ? "Upload incomplete" : `${(r.sizeBytes / 1048576).toFixed(1)} MB`}</p>
      <p className="break-words text-fg-muted">Created {new Date(r.createdAt).toLocaleString()} · Expires {new Date(r.retentionUntil).toLocaleString()} · Shared source: {r.displaySurface} · Policy: {r.policyReference}</p>
      <div className="flex flex-wrap gap-2">{r.status === "UPLOADED" && <Button size="sm" loading={pending} onClick={() => void play(r.id)}>{playback?.id === r.id ? "Renew playback access" : "Open authorized playback"}</Button>}
      {auth.profile?.roles.includes("SUPER_ADMIN") && !["DELETED", "CANCELLED"].includes(r.status) && <Button size="sm" variant="danger" disabled={pending} onClick={async () => {
        if (!window.confirm("Permanently delete this recording and its technical timeline? Confirmed answers will remain.")) return;
        setPending(true); setPlayback(undefined);
        try { await apiRequest(`/recordings/${r.id}`, { method: "DELETE", admin: true }); await load(); } catch { setError("Deletion could not be verified. Retry or contact storage support."); } finally { setPending(false); }
      }}>Delete recording</Button>}</div>
      {playback?.id === r.id && <><video key={playback.url} src={playback.url} crossOrigin="anonymous" controls playsInline preload="metadata" className="aspect-video w-full rounded-xl bg-black" aria-label="Consented screen and camera recording" onError={() => setError("Playback failed or its short-lived link expired. Renew playback access to retry.")} /><p className="text-xs text-fg-muted">Access expires at {new Date(playback.expiresAt).toLocaleTimeString()}. Renew access if seeking or playback fails. Refer to Questions &amp; Answers for the authoritative question text and confirmed transcripts.</p></>}
    </article>)}
    {!!data?.events.length && <><h3 className="font-semibold">Technical session timeline</h3><ol className="max-h-96 space-y-2 overflow-y-auto text-sm">{data.events.map(event => <li key={event.id} className="border-l-2 border-brand/30 pl-3"><time>{new Date(event.occurredAt).toLocaleString()}</time> · {event.type.toLowerCase().replaceAll("_", " ")}{event.durationMs != null && ` (${Math.round(event.durationMs / 1000)}s)`} · {event.captureState.toLowerCase()}. Candidate device timestamp; may be incomplete after connection loss.</li>)}</ol></>}
  </section>;
}
