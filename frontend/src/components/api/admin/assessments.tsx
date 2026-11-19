"use client";
/**
 * API mode: persisted evidence and diagnostics. Reading never triggers LLM generation.
 */
import Link from "@/components/navigation/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Printer, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand";
import { Badge, CandidateAvatar, CardHeader, Field, GlassCard, Pill, SkeletonPage, SkeletonTable } from "@/components/ui/primitives";
import { EmptyState, PageHeader } from "@/components/ui/states";
import { ScoreBar } from "@/components/admin/widgets";
import { ApiErrorPanel } from "@/components/api/query-state";
import { ApiRecruitmentBadge, ApiReviewBadge } from "./common";
import { useApplication, useAssessment, useAssessments, useInterviewDetail, useInterviews } from "@/lib/data/queries";
import { ASSESSMENT_STATUS, TRACK_LABEL } from "@/lib/api/labels";
import { BRAND } from "@/lib/brand";
import { exportAssessmentReportPdf } from "@/lib/report-pdf";
import { formatDateTime, formatMinutes } from "@/lib/utils";
import { AssessmentAnalysis } from "./assessment-analysis";

export function ApiAssessmentsList() {
  const list = useInterviews({ status: "SUBMITTED", limit: 50, sortBy: "submittedAt", sortDir: "desc" });
  const rows = list.data?.items ?? [];
  return (
    <div>
      <PageHeader title="AI Assessments" description="Evidence-based diagnostics for submitted interviews. HR makes the final decision." />
      <Link className="mt-3 inline-block text-sm underline" href="/admin/assessments/rubrics">Reference rubric management & AI usage</Link>
      {list.isError ? (
        <GlassCard className="mt-6"><ApiErrorPanel error={list.error} onRetry={() => void list.refetch()} /></GlassCard>
      ) : list.isPending ? (
        <GlassCard className="mt-6"><SkeletonTable rows={6} /></GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard className="mt-6"><EmptyState icon={<ClipboardCheck />} title="No reports generated" description="Assessments appear here once candidates submit their interviews." /></GlassCard>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((i) => (
            <Link key={i.id} href={`/admin/assessments/${i.id}`} data-pointer-surface className="surface group relative flex h-full flex-col rounded-xl p-5 transition-colors hover:border-glow/50">
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
  const app = useApplication(iv.data?.applicationId);
  const reports = useAssessments(id);
  const [selectedReport, setSelectedReport] = useState("");
  const [draftDirty, setDraftDirty] = useState(false);
  const reportId = reports.data?.reports.find(r => r.id === selectedReport)?.id ?? reports.data?.reports[0]?.id;
  const report = useAssessment(reportId);
  if (iv.isPending || reports.isPending) return <SkeletonPage />;
  if (iv.isError) return <ApiErrorPanel error={iv.error} onRetry={() => void iv.refetch()} />;
  if (reports.isError) return <ApiErrorPanel error={reports.error} onRetry={() => void reports.refetch()} />;
  if (reportId && report.isPending) return <SkeletonPage />;
  if (report.isError) return <ApiErrorPanel error={report.error} onRetry={() => void report.refetch()} />;
  const d = iv.data;
  const a = app.data;
  const r = report.data;
  const status = r?.status ?? (reportId ? "PENDING" : "NOT_AVAILABLE");
  const meta = ASSESSMENT_STATUS[status];
  const scored = r?.status === "COMPLETED" && r.criteria.some((c) => c.score !== null);
  const answeredCount = d.questions.filter((q) => q.answer?.confirmedAt).length;
  const totalDurationSec = d.questions.reduce((sum, q) => sum + (q.answer?.responseDurationSec ?? 0), 0);

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild><Link href={`/admin/interviews/${d.interviewId}`}><ArrowLeft />Back to interview</Link></Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => exportAssessmentReportPdf({ reference: d.reference, candidateName: d.candidate.fullName, hasUnsavedDraft: draftDirty })}
          >
            <Printer />Export PDF
          </Button>
          <Button variant="secondary" asChild><Link href={`/admin/interviews/${d.interviewId}`}><Video />Review Interview</Link></Button>
        </div>
      </div>

      <article className="print-area space-y-5">
        {/* Report Header */}
        <GlassCard className="print-break-avoid p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-4 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-2 font-semibold text-fg">
              <BrandMark className="size-5" />
              <span>{BRAND.name} · {BRAND.organization}</span>
            </span>
            <span>Powered by GO Connectivo · Confidential HR Assessment Report</span>
          </div>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <CandidateAvatar name={d.candidate.fullName} size="lg" />
              <div className="min-w-0">
                <p className="eyebrow">AI Interview Assessment Report</p>
                <h1 className="mt-1 break-words text-2xl font-bold">{d.candidate.fullName}</h1>
                <p className="mt-1 text-sm text-fg-secondary">{d.jobRole.title} · <span className="font-mono text-xs">{d.reference}</span> · <Pill>{d.questionSetVersion}</Pill></p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {d.review && <ApiReviewBadge status={d.review.status} />}
              {a && <ApiRecruitmentBadge status={a.status} />}
            </div>
          </div>
        </GlassCard>

        {/* Section A — Candidate Overview */}
        <GlassCard className="print-break-avoid p-6">
          <CardHeader title="Section A — Candidate Overview" description="Persisted applicant identity, applied role, and current recruitment stage" />
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Full name" value={d.candidate.fullName} />
            <Field label="Applied role" value={d.jobRole.title} />
            <Field label="Track" value={TRACK_LABEL[d.jobRole.track]} />
            <Field label="Current recruitment stage" value={a ? <ApiRecruitmentBadge status={a.status} /> : "Loaded from application"} />
            <Field label="Interview completion date" value={formatDateTime(d.submittedAt ?? d.completedAt ?? undefined)} />
            <Field label="Interview reference" value={<span className="font-mono text-xs">{d.reference}</span>} />
            <Field label="Question set version" value={d.questionSetVersion} />
            <Field label="HR review status" value={d.review ? <ApiReviewBadge status={d.review.status} /> : "Pending submission"} />
          </dl>
        </GlassCard>

        {/* Section B — Interview Summary */}
        <GlassCard className="print-break-avoid p-6">
          <CardHeader title="Section B — Interview Summary" description="Completion status, confirmed answers, and assessment version metadata" />
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Interview completion status" value={d.status} />
            <Field label="Questions answered" value={`${answeredCount} of ${d.totalQuestions} confirmed`} />
            <Field label="Recorded answer duration" value={totalDurationSec > 0 ? formatMinutes(totalDurationSec) : "Not recorded"} />
          </dl>
          {reports.data && reports.data.reports.length > 0 && (
            <div className="no-print mt-4 border-t border-subtle pt-4">
              <label className="block text-sm">
                Report history{" "}
                <select aria-label="Report version" className="ml-2 rounded border border-border bg-surface p-2" value={reportId ?? ""} onChange={e => setSelectedReport(e.target.value)}>
                  {reports.data.reports.map(rep => <option key={rep.id} value={rep.id}>Version {rep.version} · {rep.status}</option>)}
                </select>
              </label>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {meta.body && <p className="max-w-2xl text-sm text-fg-muted">{meta.body}</p>}
            {r && <dl className="mt-2 grid gap-4 sm:grid-cols-3"><Field label="Report version" value={`v${r.version}`} /><Field label="Created" value={formatDateTime(r.createdAt)} /><Field label="Generated" value={formatDateTime(r.generatedAt ?? undefined)} /></dl>}
          </div>
        </GlassCard>

        {scored && r && (
          <GlassCard className="print-break-avoid p-6">
            <CardHeader title="Criteria Summary" description={r.summary ?? undefined} />
            <div className="mt-5 space-y-4">
              {r.criteria.map((c) => <ScoreBar key={c.id} label={c.label} score={Number(c.score)} explanation={c.explanation ?? undefined} />)}
            </div>
          </GlassCard>
        )}

        <p className="text-xs text-fg-muted">AI assessments are decision support only. Hiring decisions are made by the HR team.</p>

        {r ? (
          <AssessmentAnalysis
            report={r}
            interview={d}
            onDraftChange={setDraftDirty}
            refresh={() => {
              setSelectedReport("");
              void reports.refetch();
              void report.refetch();
              void iv.refetch();
            }}
          />
        ) : (
          <GlassCard className="print-break-avoid p-6">
            <CardHeader title="Section C & D — Question Review & AI Assessment" description="No AI assessment report has been generated for this interview yet." />
            <ol className="mt-4 space-y-3">
              {d.questions.map((q) => (
                <li key={q.code} className="print-break-avoid rounded-xl border border-subtle p-4 text-sm">
                  <p className="font-semibold">Question {q.position} · {q.category}</p>
                  <p className="mt-1">{q.text}</p>
                  <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 border-glow pl-3 text-fg-secondary">{q.answer?.transcript ?? "No confirmed answer"}</blockquote>
                </li>
              ))}
            </ol>
          </GlassCard>
        )}
      </article>
    </div>
  );
}
