"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiInterviewReview } from "@/components/api/admin/interview-review";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Bot, ClipboardCheck, Maximize, Pause, Play, Search, UserRound, Volume2, VolumeX, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, Field, GlassCard, CardHeader, Pill, SearchInput } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { EmptyState, InterviewStatusBadge } from "@/components/ui/states";
import { ReviewPanel } from "@/components/admin/review-panel";
import { AudioWaveform } from "@/components/interview/parts";
import { useCandidate, useInterview, roleTitle } from "@/lib/demo/selectors";
import { QUESTION_SET_META, QUESTION_SETS } from "@/lib/demo/questions";
import { cn, formatDateTime, formatDuration, formatMinutes } from "@/lib/utils";

interface Segment { id: string; kind: "ai" | "candidate"; qNumber: number; category: string; start: number; end: number; text: string; inputMode?: "voice" | "typed" }

function DemoInterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const interview = useInterview(id);
  const candidate = useCandidate(interview?.candidateId);

  const segments = useMemo<Segment[]>(() => {
    if (!interview) return [];
    const qs = QUESTION_SETS[interview.track];
    return interview.answers.flatMap((a) => {
      // Prefer the snapshot saved with the answer, so text always matches what was asked.
      const base = qs.find((x) => x.id === a.questionId);
      const q = { id: a.questionId, number: a.questionNumber ?? base?.number ?? 0, category: a.category ?? base?.category ?? "", text: a.questionText ?? base?.text ?? "" };
      return [
        { id: `${q.id}-q`, kind: "ai" as const, qNumber: q.number, category: q.category, start: Math.max(0, a.startedAtSec - 12), end: a.startedAtSec, text: q.text },
        { id: `${q.id}-a`, kind: "candidate" as const, qNumber: q.number, category: q.category, start: a.startedAtSec, end: a.startedAtSec + a.durationSec, text: a.transcript, inputMode: a.inputMode },
      ];
    });
  }, [interview]);
  const total = segments.length ? segments[segments.length - 1]!.end + 6 : 0;

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [q, setQ] = useState("");
  const [qFilter, setQFilter] = useState("all");
  const playerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setT((x) => { if (x + 0.25 >= total) { setPlaying(false); return total; } return x + 0.25; }), 250);
    return () => clearInterval(iv);
  }, [playing, total]);

  const active = segments.find((s) => t >= s.start && t < s.end);
  useEffect(() => {
    if (active && playing) listRef.current?.querySelector(`[data-seg="${active.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active, playing]);

  if (!interview || !candidate) {
    return <EmptyState icon={<VideoOff />} title="Interview not found" description={`No interview with ID ${id} exists in the demo dataset.`} action={<Button asChild><Link href="/admin/interviews">Back to Interviews</Link></Button>} />;
  }
  if (interview.status === "not_started") {
    return <EmptyState icon={<VideoOff />} title="Interview not started" description={`${candidate.name} hasn't started this interview yet. A session will appear here once they begin.`} action={<Button asChild><Link href={`/admin/candidates/${candidate.id}`}>Open Candidate Profile</Link></Button>} />;
  }

  const term = q.toLowerCase();
  const visible = segments.filter((s) => (qFilter === "all" || String(s.qNumber) === qFilter) && (!term || s.text.toLowerCase().includes(term)));
  const highlight = (text: string) => {
    if (!term) return text;
    const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((p, i) => (p.toLowerCase() === term ? <mark key={i} className="rounded bg-brand-cyan/30 px-0.5 text-fg">{p}</mark> : p));
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs text-fg-muted">Interview review · <span className="font-mono">{interview.id}</span></p>
          <h1 className="mt-1 text-[26px] font-bold sm:text-[30px]">{candidate.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2"><Pill>{roleTitle(candidate)}</Pill><InterviewStatusBadge status={interview.status} review={interview.reviewStatus} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild><Link href={`/admin/candidates/${candidate.id}`}><UserRound />Candidate Profile</Link></Button>
          <Button asChild disabled={interview.status !== "completed"}>
            {interview.status === "completed" ? <Link href={`/admin/assessments/${interview.id}`}><ClipboardCheck />View Assessment</Link> : <span><ClipboardCheck />Assessment pending</span>}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {/* Player */}
          <div ref={playerRef} className="surface overflow-hidden rounded-xl bg-ink-950">
            <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-b from-ink-800 to-ink-950">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(59,130,246,calc(0.18*var(--glow-k))),transparent_60%)]" aria-hidden />
              <div className="absolute inset-0 grid place-items-center">
                <div className="flex flex-col items-center gap-3 text-fg-muted">
                  <span className="grid size-20 place-items-center rounded-full border border-subtle bg-overlay/[0.04]">{active?.kind === "ai" ? <Bot className="size-9 text-brand-cyan" aria-hidden /> : <UserRound className="size-9" aria-hidden />}</span>
                  <AudioWaveform active={playing && !!active} tone={active?.kind === "ai" ? "blue" : "cyan"} bars={32} className="h-8" />
                </div>
              </div>
              <span className="absolute left-3 top-3 rounded-md bg-ink-950/75 px-2 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-200 backdrop-blur">Transcript playback — no audio or video is recorded in this prototype</span>
              {active && (
                <p className="absolute inset-x-6 bottom-5 mx-auto max-w-3xl rounded-lg bg-ink-950/80 px-3 py-2 text-center text-[13px] leading-relaxed text-fg backdrop-blur sm:text-sm">
                  <span className="font-semibold text-brand-cyan">{active.kind === "ai" ? "Interviewer: " : `${candidate.name.split(" ")[0]}: `}</span>
                  {active.text.length > 180 ? `${active.text.slice(0, 177)}…` : active.text}
                </p>
              )}
              {!playing && t === 0 && (
                <button onClick={() => setPlaying(true)} className="absolute inset-0 grid place-items-center" aria-label="Play simulated recording">
                  <span className="grid size-16 place-items-center rounded-full bg-brand shadow-glow transition-transform hover:scale-105"><Play className="ml-1 size-7 text-white" aria-hidden /></span>
                </button>
              )}
            </div>
            {/* Controls */}
            <div className="space-y-2 border-t border-subtle px-4 py-3">
              <div className="relative">
                <input type="range" min={0} max={total} step={0.25} value={t} onChange={(e) => setT(Number(e.target.value))} className="w-full" aria-label="Seek" aria-valuetext={`${formatDuration(t)} of ${formatDuration(total)}`} />
                <div className="pointer-events-none absolute inset-x-0 -top-1 h-1" aria-hidden>
                  {segments.filter((s) => s.kind === "ai").map((s) => <span key={s.id} className="absolute top-0 h-2 w-0.5 rounded bg-brand-cyan" style={{ left: `${(s.start / total) * 100}%` }} />)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon-sm" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</Button>
                <span className="text-xs tabular-nums text-fg-secondary">{formatDuration(t)} / {formatDuration(total)}</span>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="ghost" size="icon-sm" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}>{muted || volume === 0 ? <VolumeX /> : <Volume2 />}</Button>
                  <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="hidden w-20 sm:block" aria-label="Volume" />
                  <Button variant="ghost" size="icon-sm" aria-label="Fullscreen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : playerRef.current?.requestFullscreen?.())}><Maximize /></Button>
                </div>
              </div>
            </div>
          </div>

          {/* Question-by-question responses */}
          <GlassCard className="p-5 sm:p-6">
            <CardHeader title="Question-by-Question Responses" description={`${QUESTION_SETS[interview.track].length} official questions · question set ${interview.questionSetId ?? QUESTION_SET_META[interview.track].id}`} action={<Pill>{QUESTION_SET_META[interview.track].title}</Pill>} />
            <ol className="mt-5 space-y-3">
              {QUESTION_SETS[interview.track].map((base) => {
                const a = interview.answers.find((x) => x.questionId === base.id);
                return (
                  <li key={base.id} className="rounded-xl border border-subtle bg-overlay/[0.02] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-display font-semibold text-brand-cyan">Question {base.number} — {a?.category ?? base.category}</span>
                      <span className="font-mono text-fg-disabled">{base.id}</span>
                      <span className="ml-auto flex flex-wrap items-center gap-2">
                        {a?.inputMode && <Badge tone={a.inputMode === "voice" ? "blue" : "neutral"} dot={false}>{a.inputMode === "voice" ? "Speech-to-Text" : "Typed fallback"}</Badge>}
                        {a && <span className="tabular-nums text-fg-muted">{formatMinutes(a.durationSec)}</span>}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-fg">{a?.questionText ?? base.text}</p>
                    {a ? (
                      <p className="mt-3 border-l-2 border-brand/40 pl-3 text-sm leading-relaxed text-fg-secondary">{a.transcript}</p>
                    ) : (
                      <p className="mt-3 text-sm italic text-fg-muted">Not answered yet.</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </GlassCard>

          {/* Question timeline */}
          <GlassCard className="p-5">
            <CardHeader title="Question Timeline" description="Jump to any question in the session" />
            <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {segments.filter((s) => s.kind === "ai").map((s) => {
                const cur = active?.qNumber === s.qNumber;
                return (
                  <li key={s.id}>
                    <button onClick={() => { setT(s.start); setQFilter("all"); }} className={cn("w-full rounded-xl border p-3 text-left transition-colors", cur ? "border-brand/50 bg-brand/10" : "border-subtle bg-overlay/[0.02] hover:bg-overlay/[0.04]")}>
                      <span className="flex items-center justify-between text-xs"><span className="font-semibold text-brand-cyan">Q{s.qNumber}</span><span className="tabular-nums text-fg-muted">{formatDuration(s.start)}</span></span>
                      <span className="mt-1 block truncate text-sm text-fg">{s.category}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </GlassCard>

          {/* Transcript */}
          <GlassCard id="transcript" className="scroll-mt-24 p-5">
            <CardHeader title="Transcript" description={interview.capturedLive ? "Live demo transcript — captured with browser speech recognition (or typed) and confirmed by the candidate" : "Demonstration transcript — fictional sample content"} />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <SearchInput className="flex-1" placeholder="Search within transcript…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transcript" />
              <Select label="Filter by question" className="sm:w-48" value={qFilter} onValueChange={setQFilter} options={[{ value: "all", label: "All questions" }, ...QUESTION_SETS[interview.track].map((x) => ({ value: String(x.number), label: `Q${x.number} · ${x.category}` }))]} />
            </div>
            {visible.length === 0 ? (
              <EmptyState icon={<Search />} title="No matches" description="No transcript lines match your search." className="py-10" />
            ) : (
              <ol ref={listRef} className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {visible.map((s) => {
                  const cur = active?.id === s.id;
                  return (
                    <li key={s.id} data-seg={s.id}>
                      <button
                        onClick={() => setT(s.start)}
                        className={cn("w-full rounded-xl border p-4 text-left transition-colors duration-200", cur ? "border-brand-cyan/40 bg-brand-cyan/[0.06]" : s.kind === "ai" ? "border-subtle bg-overlay/[0.025] hover:bg-overlay/[0.04]" : "border-transparent hover:bg-overlay/[0.03]")}
                      >
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={cn("inline-flex items-center gap-1.5 font-semibold", s.kind === "ai" ? "text-brand-electric" : "text-brand-cyan")}>
                            {s.kind === "ai" ? <Bot className="size-3.5" aria-hidden /> : <UserRound className="size-3.5" aria-hidden />}
                            {s.kind === "ai" ? `Interviewer · Q${s.qNumber}` : candidate.name}
                            {s.inputMode && <span className="rounded-md border border-subtle px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">{s.inputMode === "voice" ? "Speech-to-Text" : "Typed fallback"}</span>}
                          </span>
                          {s.kind === "ai" && <span className="text-fg-muted">{s.category}</span>}
                          <span className="ml-auto tabular-nums text-fg-disabled">{formatDuration(s.start)}</span>
                        </span>
                        <span className={cn("mt-2 block text-sm leading-relaxed", s.kind === "ai" ? "font-medium text-fg" : "text-fg-secondary")}>{highlight(s.text)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </GlassCard>
        </div>

        {/* Right panel */}
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <GlassCard className="p-5">
            <div className="flex items-center gap-3">
              <CandidateAvatar name={candidate.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{candidate.name}</p>
                <p className="text-xs text-fg-muted">{candidate.id} · {candidate.location}</p>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              <Field label="Interview track" value={QUESTION_SET_META[interview.track].title} />
              <Field label="Duration" value={formatMinutes(interview.durationSec)} />
              <Field label="Started" value={formatDateTime(interview.startedAt)} />
              <Field label="Completed" value={formatDateTime(interview.completedAt)} />
              <Field label="Questions" value={`${interview.answeredCount} of ${QUESTION_SETS[interview.track].length}`} />
              <Field label="Question set" value={interview.questionSetId ?? QUESTION_SET_META[interview.track].id} />
              <Field label="Submission" value={interview.capturedLive ? "Live demo · stored in this browser" : interview.status === "completed" ? "Sample record" : "—"} />
              <Field label="Assessment" value={interview.status === "completed" ? "Available" : "Not yet"} />
            </dl>
            {interview.status === "completed" && (
              <Button variant="outline" size="sm" className="mt-5 w-full" asChild><Link href={`/admin/assessments/${interview.id}`}>Open AI Assessment<ArrowRight /></Link></Button>
            )}
          </GlassCard>
          <GlassCard className="p-5">
            <CardHeader title="Reviewer Actions" description="Decisions are made by HR" />
            <div className="mt-5"><ReviewPanel candidate={candidate} interview={interview} /></div>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function InterviewDetailPage() {
  return isApiMode ? <ApiInterviewReview /> : <DemoInterviewDetailPage />;
}
