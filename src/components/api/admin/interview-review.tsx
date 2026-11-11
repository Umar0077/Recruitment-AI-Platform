"use client";
/** API mode: HR review of a persisted interview — historical question snapshots + confirmed answers. */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Bot, ClipboardCheck, MessageSquarePlus, RefreshCw, Search, Star, UserRound, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, CardHeader, Field, GlassCard, Label, Pill, SearchInput, SkeletonPage, Textarea } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { ApiErrorPanel, errorText } from "@/components/api/query-state";
import { ApiInterviewBadge, ApiRecruitmentBadge, ApiRemarkDialog, ApiReviewBadge, ApiStatusDialog } from "./common";
import { useApplication, useAssessments, useInterviewDetail, useUpdateReview } from "@/lib/data/queries";
import { ANSWER_SOURCE, ASSESSMENT_STATUS, REVIEW_STATUS, TRACK_LABEL } from "@/lib/api/labels";
import type { HrReviewStatus } from "@/lib/api/types";
import { cn, formatDateTime, formatMinutes } from "@/lib/utils";

export function ApiInterviewReview() {
  const { id } = useParams<{ id: string }>();
  const iv = useInterviewDetail(id);
  const app = useApplication(iv.data?.applicationId);
  const assessments = useAssessments(iv.data?.status === "SUBMITTED" ? id : undefined);
  const [q, setQ] = useState("");
  const [qFilter, setQFilter] = useState("all");
  const [statusOpen, setStatusOpen] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);

  const answered = useMemo(() => iv.data?.questions.filter((x) => x.answer) ?? [], [iv.data]);
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (iv.data?.questions ?? []).filter((x) => (qFilter === "all" || String(x.position) === qFilter) && (!term || x.text.toLowerCase().includes(term) || (x.answer?.transcript.toLowerCase().includes(term) ?? false)));
  }, [iv.data, q, qFilter]);

  if (iv.isPending) return <SkeletonPage />;
  if (iv.isError) return <ApiErrorPanel error={iv.error} onRetry={() => void iv.refetch()} />;
  const d = iv.data;
  const a = app.data;
  const report = assessments.data?.reports[0];
  const canShortlist = !!a?.allowedTransitions.includes("SHORTLISTED");

  return (
    <div>
      <GlassCard className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <CandidateAvatar name={d.candidate.fullName} size="lg" />
            <div className="min-w-0">
              <p className="eyebrow">AI interview review</p>
              <h1 className="mt-1 break-words text-2xl font-bold">{d.candidate.fullName}</h1>
              <p className="mt-1 text-sm text-fg-secondary">{d.jobRole.title} · {TRACK_LABEL[d.jobRole.track]} · <span className="font-mono text-xs">{d.reference}</span></p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ApiInterviewBadge status={d.status} />
                {d.review && <ApiReviewBadge status={d.review.status} />}
                {a && <ApiRecruitmentBadge status={a.status} />}
                <Pill>{d.questionSetVersion}</Pill>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {a && <Button variant="secondary" asChild><Link href={`/admin/candidates/${a.id}`}><UserRound />Candidate Profile</Link></Button>}
            <Button variant="secondary" onClick={() => setRemarkOpen(true)} disabled={!a}><MessageSquarePlus />Add Remark</Button>
            {canShortlist ? <Button onClick={() => setStatusOpen(true)}><Star />Shortlist</Button> : <Button onClick={() => setStatusOpen(true)} disabled={!a || a.allowedTransitions.length === 0}><RefreshCw />Update Status</Button>}
          </div>
        </div>
        <dl className="mt-6 grid gap-5 border-t border-subtle pt-5 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Invited" value={formatDateTime(d.invitedAt)} />
          <Field label="Started" value={formatDateTime(d.startedAt ?? undefined)} />
          <Field label="Completed" value={formatDateTime(d.completedAt ?? undefined)} />
          <Field label="Submitted" value={formatDateTime(d.submittedAt ?? undefined)} />
          <Field label="Answers confirmed" value={`${answered.length} of ${d.totalQuestions}`} />
        </dl>
      </GlassCard>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-subtle bg-overlay/[0.02] p-4 text-sm text-fg-secondary">
            <VideoOff className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
            <p><span className="font-medium text-fg">Recording not available.</span> InterviewOS stores the candidate&apos;s confirmed text answers only — no audio or video is recorded.</p>
          </div>

          <GlassCard className="p-5 sm:p-6">
            <CardHeader title="Question-by-Question Responses" description={`${d.totalQuestions} questions exactly as asked (version ${d.questionSetVersion})`} />
            <ol className="mt-5 space-y-3">
              {d.questions.map((x) => (
                <li key={x.code} className="rounded-xl border border-subtle bg-overlay/[0.02] p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-display font-semibold text-brand-cyan">Question {x.position} — {x.category}</span>
                    <span className="font-mono text-fg-disabled">{x.code}</span>
                    {x.answer && (
                      <span className="ml-auto flex flex-wrap items-center gap-2">
                        <Badge tone={x.answer.source === "SPEECH_TO_TEXT" ? "blue" : "neutral"} dot={false}>{ANSWER_SOURCE[x.answer.source] ?? x.answer.source}</Badge>
                        <span className="tabular-nums text-fg-muted">{formatMinutes(x.answer.responseDurationSec)}</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-fg">{x.answer?.questionTextSnapshot ?? x.text}</p>
                  {x.answer ? (
                    <>
                      <p className="mt-3 whitespace-pre-wrap break-words border-l-2 border-brand/40 pl-3 text-sm leading-relaxed text-fg-secondary">{x.answer.transcript}</p>
                      <p className="mt-2 text-[11px] text-fg-disabled">Confirmed {formatDateTime(x.answer.confirmedAt)}</p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm italic text-fg-muted">No confirmed answer.</p>
                  )}
                </li>
              ))}
            </ol>
          </GlassCard>

          <GlassCard id="transcript" className="scroll-mt-24 p-5">
            <CardHeader title="Transcript" description="Confirmed answers as saved by the candidate (speech-to-text or typed)." />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <SearchInput className="flex-1" placeholder="Search within transcript…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transcript" />
              <Select label="Filter by question" className="sm:w-48" value={qFilter} onValueChange={setQFilter} options={[{ value: "all", label: "All questions" }, ...d.questions.map((x) => ({ value: String(x.position), label: `Q${x.position} · ${x.category}` }))]} />
            </div>
            {answered.length === 0 ? (
              <EmptyState icon={<Search />} title="No answers yet" description="Confirmed answers appear here once the candidate saves them." className="py-10" />
            ) : visible.length === 0 ? (
              <EmptyState icon={<Search />} title="No matches" description="No transcript lines match your search." className="py-10" />
            ) : (
              <ol className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {visible.flatMap((x) => [
                  <li key={`${x.code}-q`} className="rounded-xl border border-subtle bg-overlay/[0.025] p-4">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-electric"><Bot className="size-3.5" aria-hidden />Interviewer · Q{x.position}<span className="font-normal text-fg-muted">{x.category}</span></span>
                    <span className="mt-2 block text-sm font-medium leading-relaxed text-fg">{x.text}</span>
                  </li>,
                  <li key={`${x.code}-a`} className={cn("rounded-xl border border-transparent p-4", !x.answer && "opacity-70")}>
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-brand-cyan"><UserRound className="size-3.5" aria-hidden />{d.candidate.fullName}</span>
                      {x.answer && <span className="rounded-md border border-subtle px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">{ANSWER_SOURCE[x.answer.source]}</span>}
                      {x.answer && <span className="ml-auto tabular-nums text-fg-disabled">{formatDateTime(x.answer.confirmedAt)}</span>}
                    </span>
                    <span className="mt-2 block whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-secondary">{x.answer?.transcript ?? "No confirmed answer."}</span>
                  </li>,
                ])}
              </ol>
            )}
          </GlassCard>
        </div>

        <div className="space-y-4">
          {d.review ? <ReviewCard reviewId={d.review.id} status={d.review.status} remarks={d.review.remarks} reviewedAt={d.review.reviewedAt} applicationId={d.applicationId} /> : (
            <GlassCard className="p-5"><CardHeader title="HR review" /><p className="mt-3 text-sm text-fg-muted">A review opens automatically when the candidate submits the interview.</p></GlassCard>
          )}
          <GlassCard className="p-5">
            <CardHeader title="AI assessment" icon={<ClipboardCheck className="size-4" />} />
            {(() => {
              const s = ASSESSMENT_STATUS[report?.status ?? "NOT_AVAILABLE"];
              return (
                <div className="mt-3 space-y-2">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <p className="text-sm text-fg-muted">{d.status !== "SUBMITTED" ? "Available after the interview is submitted." : s.body}</p>
                </div>
              );
            })()}
          </GlassCard>
        </div>
      </div>

      {a && <ApiStatusDialog applicationId={a.id} name={d.candidate.fullName} current={a.status} allowed={a.allowedTransitions} preset={canShortlist ? "SHORTLISTED" : undefined} open={statusOpen} onOpenChange={setStatusOpen} />}
      {a && <ApiRemarkDialog applicationId={a.id} open={remarkOpen} onOpenChange={setRemarkOpen} />}
    </div>
  );
}

function ReviewCard({ reviewId, status, remarks, reviewedAt, applicationId }: { reviewId: string; status: HrReviewStatus; remarks: string | null; reviewedAt: string | null; applicationId: string }) {
  const m = useUpdateReview(applicationId);
  const [value, setValue] = useState<HrReviewStatus>(status);
  const [notes, setNotes] = useState(remarks ?? "");
  useEffect(() => { setValue(status); setNotes(remarks ?? ""); }, [status, remarks]);
  const dirty = value !== status || notes.trim() !== (remarks ?? "");
  return (
    <GlassCard className="p-5">
      <CardHeader title="HR review" description={reviewedAt ? `Reviewed ${formatDateTime(reviewedAt)}` : "Your review decision for this interview."} />
      <div className="mt-4 space-y-3">
        <Select label="Review status" value={value} onValueChange={(v) => setValue(v as HrReviewStatus)} options={Object.entries(REVIEW_STATUS).map(([k, v]) => ({ value: k, label: v.label }))} />
        <div>
          <Label htmlFor="review-notes">Review notes (internal)</Label>
          <Textarea id="review-notes" maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[100px]" />
        </div>
        {m.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-200">{errorText(m.error)}</p>}
        <Button
          className="w-full"
          loading={m.isPending}
          disabled={!dirty}
          onClick={() => m.mutate({ reviewId, status: value, remarks: notes.trim() || undefined }, { onSuccess: () => toast.success(`Review saved as ${REVIEW_STATUS[value].label}.`) })}
        >
          Save Review
        </Button>
        <p className="text-xs text-fg-muted">The review does not change the recruitment stage. Use Shortlist or Update Status for that.</p>
      </div>
    </GlassCard>
  );
}
