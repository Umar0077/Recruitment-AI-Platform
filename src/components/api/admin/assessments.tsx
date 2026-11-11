"use client";
/**
 * API mode: assessment reports as they exist in PostgreSQL. The AI evaluation engine is not built yet,
 * so reports are normally "Assessment Not Yet Generated". Nothing is scored or invented here.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClipboardCheck, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, CardHeader, Field, GlassCard, Pill, SkeletonPage, SkeletonTable } from "@/components/ui/primitives";
import { EmptyState, PageHeader } from "@/components/ui/states";
import { ScoreBar } from "@/components/admin/widgets";
import { ApiErrorPanel } from "@/components/api/query-state";
import { ApiReviewBadge } from "./common";
import { useAssessment, useAssessments, useInterviewDetail, useInterviews } from "@/lib/data/queries";
import { ASSESSMENT_STATUS } from "@/lib/api/labels";
import { formatDateTime } from "@/lib/utils";

export function ApiAssessmentsList() {
  const list = useInterviews({ status: "SUBMITTED", limit: 50, sortBy: "submittedAt", sortDir: "desc" });
  const rows = list.data?.items ?? [];
  return (
    <div>
      <PageHeader title="AI Assessments" description="Assessment status for submitted interviews. Automated scoring is not enabled yet — HR reviews the confirmed answers." />
      {list.isError ? (
        <GlassCard className="mt-6"><ApiErrorPanel error={list.error} onRetry={() => void list.refetch()} /></GlassCard>
      ) : list.isPending ? (
        <GlassCard className="mt-6"><SkeletonTable rows={6} /></GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard className="mt-6"><EmptyState icon={<ClipboardCheck />} title="No reports generated" description="Assessments appear here once candidates submit their interviews." /></GlassCard>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((i) => (
            <Link key={i.id} href={`/admin/assessments/${i.id}`} className="surface group flex h-full flex-col rounded-xl p-5 transition-colors hover:border-glow/50">
              <span className="flex items-center gap-3">
                <CandidateAvatar name={i.candidate.fullName} size="md" />
                <span className="min-w-0"><span className="block truncate font-medium">{i.candidate.fullName}</span><span className="block truncate text-xs text-fg-muted">{i.jobRole.title}</span></span>
              </span>
              <span className="mt-4 flex flex-wrap gap-2">
                {(() => { const st = ASSESSMENT_STATUS[i.assessments[0]?.status ?? "NOT_AVAILABLE"]; return <Badge tone={st.tone}>{st.label}</Badge>; })()}
                {i.review && <ApiReviewBadge status={i.review.status} />}
              </span>
              <span className="mt-auto pt-4 text-xs text-fg-muted">Submitted {formatDateTime(i.submittedAt ?? undefined)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Route param is the interview id (same as demo mode). */
export function ApiAssessmentDetail() {
  const { id } = useParams<{ id: string }>();
  const iv = useInterviewDetail(id);
  const reports = useAssessments(id);
  const reportId = reports.data?.reports[0]?.id;
  const report = useAssessment(reportId);
  if (iv.isPending || reports.isPending) return <SkeletonPage />;
  if (iv.isError) return <ApiErrorPanel error={iv.error} onRetry={() => void iv.refetch()} />;
  if (reports.isError) return <ApiErrorPanel error={reports.error} onRetry={() => void reports.refetch()} />;
  const d = iv.data;
  const r = report.data;
  const status = r?.status ?? (reportId ? "PENDING" : "NOT_AVAILABLE");
  const meta = ASSESSMENT_STATUS[status];
  const scored = r?.status === "COMPLETED" && r.criteria.some((c) => c.score !== null);
  return (
    <div>
      <GlassCard className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <CandidateAvatar name={d.candidate.fullName} size="lg" />
            <div className="min-w-0">
              <p className="eyebrow">AI assessment</p>
              <h1 className="mt-1 break-words text-2xl font-bold">{d.candidate.fullName}</h1>
              <p className="mt-1 text-sm text-fg-secondary">{d.jobRole.title} · <span className="font-mono text-xs">{d.reference}</span> · <Pill>{d.questionSetVersion}</Pill></p>
            </div>
          </div>
          <Button variant="secondary" asChild><Link href={`/admin/interviews/${d.interviewId}`}><Video />Review Interview</Link></Button>
        </div>
      </GlassCard>
      <GlassCard className="mt-6 p-6">
        <CardHeader title="Assessment status" />
        <div className="mt-4 flex flex-col gap-3">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {meta.body && <p className="max-w-2xl text-sm text-fg-muted">{meta.body}</p>}
          {r && <dl className="mt-2 grid gap-4 sm:grid-cols-3"><Field label="Report version" value={r.version} /><Field label="Created" value={formatDateTime(r.createdAt)} /><Field label="Generated" value={formatDateTime(r.generatedAt ?? undefined)} /></dl>}
        </div>
      </GlassCard>
      {scored && r && (
        <GlassCard className="mt-6 p-6">
          <CardHeader title="Criteria" description={r.summary ?? undefined} />
          <div className="mt-5 space-y-4">
            {r.criteria.map((c) => <ScoreBar key={c.id} label={c.label} score={Number(c.score)} explanation={c.explanation ?? undefined} />)}
          </div>
        </GlassCard>
      )}
      <p className="mt-6 text-xs text-fg-muted">AI assessments are decision support only. Hiring decisions are made by the HR team.</p>
    </div>
  );
}
