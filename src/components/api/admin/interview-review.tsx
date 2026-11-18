"use client";
/** API mode: HR review of a persisted interview — historical question snapshots + confirmed answers. */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { MessageSquarePlus, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, CardHeader, Field, GlassCard, Label, Pill, SearchInput, SkeletonPage, Textarea } from "@/components/ui/primitives";
import { Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { ApiErrorPanel, errorText } from "@/components/api/query-state";
import { ApiInterviewBadge, ApiRecruitmentBadge, ApiRemarkDialog, ApiReviewBadge, ApiStatusDialog } from "./common";
import { useApplication, useAssessments, useInterviewDetail, useUpdateReview } from "@/lib/data/queries";
import { ANSWER_SOURCE, ASSESSMENT_STATUS, REVIEW_STATUS, TRACK_LABEL } from "@/lib/api/labels";
import type { HrReviewStatus } from "@/lib/api/types";
import { formatDateTime, formatMinutes } from "@/lib/utils";
import { RecordingReview } from "./recording-review";
import { useAuth } from "@/lib/auth/auth-provider";
import { TranscriptVersions } from "@/components/interview/transcript-versions";

export function ApiInterviewReview() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const canReview = !!profile?.permissions.includes("interviews:review");
  const canChangeStage = !!profile?.permissions.includes("applications:update_status");
  const canWriteNotes = !!profile?.permissions.includes("hr_remarks:write");
  const iv = useInterviewDetail(id);
  const app = useApplication(iv.data?.applicationId);
  const assessments = useAssessments(iv.data?.status === "SUBMITTED" ? id : undefined);
  const [tab, setTab] = useState("summary");
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
            <Button onClick={() => setTab("decision")}>HR Decision</Button>
          </div>
        </div>
      </GlassCard>
      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList aria-label="Interview review sections">
          <TabsTrigger value="summary">Interview Summary</TabsTrigger><TabsTrigger value="questions">Questions & Answers</TabsTrigger><TabsTrigger value="assessment">AI Assessment</TabsTrigger><TabsTrigger value="recording">Recording</TabsTrigger><TabsTrigger value="decision">HR Decision</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="mt-5"><GlassCard className="p-5 sm:p-6"><h2 className="text-lg font-semibold">Interview Summary</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Field label="Candidate" value={d.candidate.fullName} /><Field label="Applied role" value={d.jobRole.title} /><Field label="Answers confirmed" value={answered.length + " of " + d.totalQuestions} /><Field label="Submitted" value={formatDateTime(d.submittedAt ?? undefined)} /><Field label="Interview status" value={<ApiInterviewBadge status={d.status} />} /><Field label="HR review" value={d.review ? <ApiReviewBadge status={d.review.status} /> : "Not yet submitted"} /></dl><details className="mt-6 border-t border-subtle pt-4"><summary className="cursor-pointer text-sm font-medium">Interview history and reference</summary><dl className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Reference" value={d.reference} /><Field label="Question version" value={d.questionSetVersion} /><Field label="Invited" value={formatDateTime(d.invitedAt)} /><Field label="Started" value={formatDateTime(d.startedAt ?? undefined)} /></dl></details><Button className="mt-5" onClick={()=>setTab("questions")}>Review answers</Button></GlassCard></TabsContent>
        <TabsContent value="questions" className="mt-5">          <GlassCard className="p-5 sm:p-6">
            <CardHeader title="Question-by-Question Responses" description={`${d.totalQuestions} questions exactly as asked (version ${d.questionSetVersion})`} />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row"><SearchInput className="flex-1" placeholder="Search questions and answers…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search questions and answers" /><Select label="Filter by question" className="sm:w-48" value={qFilter} onValueChange={setQFilter} options={[{value:"all",label:"All questions"},...d.questions.map(x=>({value:String(x.position),label:`Question ${x.position}`}))]} /></div>{!visible.length && <p role="status" className="mt-4 text-sm text-fg-muted">No questions or answers match your search.</p>}<ol className="mt-5 space-y-3">
              {visible.map((x) => (
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
                      <TranscriptVersions answer={x.answer} />
                      <p className="mt-2 text-[11px] text-fg-disabled">Confirmed {formatDateTime(x.answer.confirmedAt)}</p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm italic text-fg-muted">No confirmed answer.</p>
                  )}
                </li>
              ))}
            </ol>
          </GlassCard>

</TabsContent>
        <TabsContent value="assessment" className="mt-5"><GlassCard className="p-6"><h2 className="text-lg font-semibold">AI Assessment</h2><p className="mt-3 text-sm text-fg-secondary">AI analysis assists review. Hiring decisions remain with HR.</p>{d.status === "SUBMITTED" && assessments.isPending ? <p role="status" className="mt-3 text-sm text-fg-muted">Loading assessment status…</p> : assessments.isError ? <ApiErrorPanel error={assessments.error} onRetry={()=>void assessments.refetch()} /> : <p className="mt-3 text-sm text-fg-muted">{ASSESSMENT_STATUS[report?.status ?? "NOT_AVAILABLE"].body}</p>}{report && <Button asChild className="mt-4"><Link href={`/admin/assessments/${id}`}>Open assessment report</Link></Button>}</GlassCard></TabsContent>
        <TabsContent value="recording" className="mt-5"><RecordingReview sessionId={id} /></TabsContent>
        <TabsContent value="decision" forceMount className="mt-5 space-y-4 data-[state=inactive]:hidden">
          {d.review && canReview ? <ReviewCard reviewId={d.review.id} status={d.review.status} remarks={d.review.remarks} reviewedAt={d.review.reviewedAt} applicationId={d.applicationId} /> : <GlassCard className="p-5"><p className="text-sm text-fg-muted">{d.review ? "Your account can view this interview. Editing the HR decision requires review permission." : "HR review opens when the candidate submits the interview."}</p></GlassCard>}
          <div className="flex flex-wrap gap-3">{canWriteNotes && <Button variant="secondary" onClick={()=>setRemarkOpen(true)} disabled={!a}><MessageSquarePlus />Add HR Note</Button>}{canChangeStage && <Button onClick={()=>setStatusOpen(true)} disabled={!a || !a.allowedTransitions.length}><RefreshCw />Update Recruitment Stage</Button>}</div>
        </TabsContent>
      </Tabs>

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
        <p className="text-xs text-fg-muted">The review does not change the recruitment stage. Use Update Recruitment Stage for that.</p>
      </div>
    </GlassCard>
  );
}
