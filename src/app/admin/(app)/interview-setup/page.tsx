"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiInterviewSetup } from "@/components/api/admin/management";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Briefcase, Eye, ListChecks, Lock, Pencil, RotateCcw, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { InterviewQuestion, InterviewSetup, Track } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge, GlassCard, CardHeader, Input, Label, Pill, SkeletonPage, Switch, Textarea } from "@/components/ui/primitives";
import { ConfirmationDialog, Dialog, DialogContent, DialogFooter, Notice } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/states";
import { useDemoStore } from "@/lib/demo/store";
import { JOB_ROLES, QUESTION_SET_META, officialQuestions } from "@/lib/demo/questions";
import { cn, formatDuration } from "@/lib/utils";
import { INTERVIEW_CONFIG } from "@/lib/brand";

function DemoInterviewSetupPage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <Setup />
    </Suspense>
  );
}

function Setup() {
  const params = useSearchParams();
  const setups = useDemoStore((s) => s.setups);
  const candidates = useDemoStore((s) => s.candidates);
  const updateSetup = useDemoStore((s) => s.updateSetup);
  const resetSetup = useDemoStore((s) => s.resetSetup);
  const [track, setTrack] = useState<Track>((params.get("track") as Track) === "experienced" ? "experienced" : "fresher");
  const [draft, setDraft] = useState<InterviewSetup>(setups[track]);
  const [editing, setEditing] = useState<InterviewQuestion | null>(null);
  const [preview, setPreview] = useState<InterviewQuestion | null>(null);
  const [confirm, setConfirm] = useState<"reset" | "cancel" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(setups[track]), [track, setups]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(setups[track]);
  const set = <K extends keyof InterviewSetup>(k: K, v: InterviewSetup[K]) => setDraft((d) => ({ ...d, [k]: v }));
  // Official HR questions are locked; draft edits live in setup.questions and are never asked.
  const official = officialQuestions(track);

  return (
    <div>
      <PageHeader
        title="Jobs & Interview Setup"
        description="Configure the AI interview attached to each existing job vacancy. Job postings themselves are managed in the careers system."
        actions={
          <>
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
            <Button variant="ghost" disabled={!dirty} onClick={() => setConfirm("cancel")}><Undo2 />Cancel Changes</Button>
            <Button
              loading={saving}
              disabled={!dirty}
              onClick={() => {
                setSaving(true);
                setTimeout(() => { updateSetup(track, draft); setSaving(false); toast.success("Interview settings updated."); }, 500);
              }}
            >
              <Save />Save Changes
            </Button>
          </>
        }
      />

      {/* Connected roles */}
      <div className="grid gap-3 md:grid-cols-2">
        {JOB_ROLES.map((r) => {
          const active = r.track === track;
          const count = candidates.filter((c) => c.roleId === r.id).length;
          return (
            <button
              key={r.id}
              onClick={() => {
                if (dirty) { toast.warning("Save or cancel your changes before switching roles."); return; }
                setTrack(r.track);
              }}
              aria-pressed={active}
              className={cn("surface flex items-start gap-4 rounded-xl p-5 text-left transition-colors", active ? "surface-glow" : "hover:border-slate-400/30")}
            >
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", active ? "bg-brand text-white" : "bg-overlay/[0.05] text-brand-cyan")}><Briefcase className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-fg">{r.title}</span><Badge tone="success">Connected</Badge></span>
                <span className="mt-1 block text-[13px] text-fg-muted">{r.description}</span>
                <span className="mt-3 flex gap-4 text-xs text-fg-secondary"><span>{officialQuestions(r.track).length} questions · {QUESTION_SET_META[r.track].id}</span><span>{count} candidates</span><span>{setups[r.track].totalDuration}</span></span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        {/* Question set */}
        <GlassCard className="p-6">
          <CardHeader
            title={`Question Set ${track === "experienced" ? "A" : "B"} — ${QUESTION_SET_META[track].title}`}
            description="Official HR standard questions. Locked for interviews — any edits below are saved as drafts only."
            icon={<ListChecks />}
            action={<Button variant="ghost" size="sm" onClick={() => setConfirm("reset")}><RotateCcw />Reset to HR Standard Questions</Button>}
          />
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="blue" dot={false}><Lock className="mr-1 size-3" aria-hidden />HR standard · locked</Badge>
            <Pill>Version {QUESTION_SET_META[track].id}</Pill>
            <Pill>{official.length} scored questions</Pill>
            <span className="text-fg-muted">Source: {QUESTION_SET_META[track].source}</span>
          </div>
          <ol className="mt-5 space-y-3">
            {official.map((q) => {
              const d = draft.questions.find((x) => x.id === q.id);
              const changed = !!d && (d.text !== q.text || d.category !== q.category);
              return (
                <li key={q.id} className="rounded-xl border border-subtle bg-overlay/[0.02] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 font-display text-sm font-bold text-brand-cyan">{String(q.number).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-fg-secondary">{q.category}</span>
                        <span className="text-fg-disabled">·</span>
                        <span className="font-mono text-fg-muted">{q.id}</span>
                        <span className="text-fg-disabled">·</span>
                        <span className="text-fg-muted">{formatDuration(draft.secondsPerQuestion)} response time</span>
                        <Badge tone="success">Active</Badge>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-fg">{q.text}</p>
                      {changed && (
                        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.07] p-3 text-[13px]">
                          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Draft change — not used in interviews</p>
                          <p className="mt-1 text-fg-secondary">{d!.category !== q.category && <span className="font-medium">{d!.category}: </span>}{d!.text}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreview(q)}><Eye />Preview</Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(d ?? q)}><Pencil />Draft edit</Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-6">
            <Label htmlFor="practice-q">Practice question (unscored · provisional demo wording, not an HR question)</Label>
            <Textarea id="practice-q" value={draft.practiceQuestion} onChange={(e) => set("practiceQuestion", e.target.value)} />
          </div>
        </GlassCard>

        <div className="space-y-4">
          {/* Interview settings */}
          <GlassCard className="p-6">
            <CardHeader title="Interview Settings" description="Demo defaults — the assessment workflow will be finalised later" />
            <div className="mt-6 space-y-4">
              <div><Label htmlFor="title">Interview title</Label><Input id="title" value={draft.title} onChange={(e) => set("title", e.target.value)} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="duration">Estimated total duration</Label><Input id="duration" value={draft.totalDuration} onChange={(e) => set("totalDuration", e.target.value)} /></div>
                <div>
                  <Label htmlFor="per-q">Time per question (seconds · HR guidance 60–90)</Label>
                  <Input id="per-q" type="number" min={INTERVIEW_CONFIG.minSecondsPerQuestion} max={INTERVIEW_CONFIG.secondsPerQuestion} value={draft.secondsPerQuestion} onChange={(e) => { const v = Number(e.target.value); setDraft((d) => ({ ...d, secondsPerQuestion: v, questions: d.questions.map((q) => ({ ...q, responseSeconds: v })) })); }} />
                </div>
                <div><Label htmlFor="expiry">Completion window (hours)</Label><Input id="expiry" type="number" min={12} max={168} value={draft.expiryHours} onChange={(e) => set("expiryHours", Number(e.target.value))} /></div>
                <div><Label htmlFor="reminder">Reminder before expiry (hours)</Label><Input id="reminder" type="number" min={1} max={96} value={draft.reminderHours} onChange={(e) => set("reminderHours", Number(e.target.value))} /></div>
              </div>
              <div className="divide-y divide-[rgba(148,163,184,0.12)] rounded-xl border border-subtle">
                {([
                  ["practiceEnabled", "Practice question", "Offer an unscored practice question first"],
                  ["cameraRequired", "Camera required", "Candidates must enable a camera"],
                  ["microphoneRequired", "Microphone required", "Candidates must enable a microphone"],
                  ["resumeAllowed", "Allow resume", "Candidates can continue an unfinished interview"],
                ] as const).map(([k, l, d]) => (
                  <label key={k} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                    <span><span className="block text-sm text-fg">{l}</span><span className="block text-xs text-fg-muted">{d}</span></span>
                    <Switch checked={draft[k]} onCheckedChange={(v) => set(k, v)} aria-label={l} />
                  </label>
                ))}
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <CardHeader title="Candidate Instructions" />
            <div className="mt-5 space-y-4">
              <div><Label htmlFor="instructions">Instruction text</Label><Textarea id="instructions" value={draft.instructions} onChange={(e) => set("instructions", e.target.value)} /></div>
              <div><Label htmlFor="alt">Alternative assessment information</Label><Textarea id="alt" value={draft.alternativeInfo} onChange={(e) => set("alternativeInfo", e.target.value)} /></div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <CardHeader title="Assessment Criteria" description="Provisional — under review for the functional phase" />
            <ul className="mt-5 flex flex-wrap gap-2">
              {draft.criteria.map((c) => <li key={c}><Badge tone="blue" dot={false}>{c}</Badge></li>)}
            </ul>
            <Notice className="mt-5">Criteria assess job-related answer content only. Facial expression or emotion analysis is not used.</Notice>
          </GlassCard>
        </div>
      </div>

      {/* Edit question */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={`Draft Edit · Question ${String(editing.number).padStart(2, "0")}`} description="Draft only. Interviews keep using the official HR wording until HR publishes a new question-set version." size="lg">
            <div className="space-y-4">
              <div><Label htmlFor="q-cat">Category</Label><Input id="q-cat" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></div>
              <div><Label htmlFor="q-text">Question text</Label><Textarea id="q-text" className="min-h-[120px]" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} /></div>
              <div className="sm:w-48"><Label htmlFor="q-time">Response time (seconds)</Label><Input id="q-time" type="number" min={30} max={300} value={editing.responseSeconds} onChange={(e) => setEditing({ ...editing, responseSeconds: Number(e.target.value) })} /></div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button disabled={!editing.text.trim()} onClick={() => { setDraft((d) => ({ ...d, questions: d.questions.map((q) => (q.id === editing.id ? editing : q)) })); setEditing(null); toast.info("Draft updated — save to keep it. Interviews still use the official question."); }}>Apply</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Preview */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview && (
          <DialogContent title="Question Preview" description="How this question appears to candidates" size="lg">
            <div className="surface-glow surface rounded-2xl p-6">
              <p className="text-[13px]"><span className="font-display font-semibold text-brand-cyan">Question {String(preview.number).padStart(2, "0")} of {String(draft.questions.length).padStart(2, "0")}</span><span className="text-fg-muted"> · {preview.category}</span></p>
              <p className="mt-4 font-display text-xl font-semibold leading-snug">{preview.text}</p>
              <p className="mt-4 text-xs text-fg-muted">Response time: {formatDuration(preview.responseSeconds)}</p>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <ConfirmationDialog
        open={confirm === "reset"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reset to HR standard questions?"
        description="Draft question edits are discarded and this role's settings return to the HR defaults. The official questions themselves never change."
        confirmLabel="Reset"
        onConfirm={() => { resetSetup(track); toast.success("HR standard questions restored."); }}
      />
      <ConfirmationDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Discard unsaved changes?"
        description="Your edits to this interview setup will be lost."
        confirmLabel="Discard Changes"
        onConfirm={() => { setDraft(setups[track]); toast.info("Changes discarded."); }}
      />
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function InterviewSetupPage() {
  return isApiMode ? <ApiInterviewSetup /> : <DemoInterviewSetupPage />;
}
