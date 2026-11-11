"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiAssessmentDetail } from "@/components/api/admin/assessments";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardX, FileText, Info, Printer, Quote, ScanSearch, ShieldAlert, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, GlassCard, CardHeader, Pill } from "@/components/ui/primitives";
import { HR_EVALUATION_FOCUS, QUESTION_SET_META } from "@/lib/demo/questions";
import { EmptyState } from "@/components/ui/states";
import { ReviewPanel } from "@/components/admin/review-panel";
import { ScoreBar } from "@/components/admin/widgets";
import { useAssessment, useCandidate, useInterview, roleTitle } from "@/lib/demo/selectors";
import { useDemoStore } from "@/lib/demo/store";
import { formatDate, formatDateTime } from "@/lib/utils";

function band(score: number) {
  return score >= 4 ? "Strong evidence in responses" : score >= 3.2 ? "Moderate evidence in responses" : "Limited evidence in responses";
}

function DemoAssessmentPage() {
  const { id } = useParams<{ id: string }>();
  const interview = useInterview(id);
  const candidate = useCandidate(interview?.candidateId);
  const report = useAssessment(id);
  const team = useDemoStore((s) => s.team);

  if (!interview || !candidate || !report) {
    return (
      <EmptyState
        icon={<ClipboardX />}
        title="Assessment not available"
        description={interview ? "An assessment is generated only after the interview has been completed." : `No interview with ID ${id} exists in the demo dataset.`}
        action={<Button asChild><Link href="/admin/assessments">All Assessments</Link></Button>}
      />
    );
  }
  const reviewed = interview.reviewStatus === "reviewed";

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild><Link href={`/admin/interviews/${interview.id}`}><ArrowLeft />Back to interview</Link></Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { toast.info("Opening print dialog — choose “Save as PDF” to download."); setTimeout(() => window.print(), 300); }}><Printer />Print / Save PDF</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <article className="print-area min-w-0 space-y-4">
          {/* Report header */}
          <GlassCard className="relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-cyan/60 to-transparent" aria-hidden />
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="eyebrow">AI Interview Assessment</p>
                <h1 className="mt-3 text-[28px] font-bold leading-tight sm:text-[34px]">{candidate.name}</h1>
                <p className="mt-1.5 text-sm text-fg-secondary">{roleTitle(candidate)}</p>
              </div>
              <div className="flex items-center gap-3">
                <CandidateAvatar name={candidate.name} size="lg" />
              </div>
            </div>
            <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-subtle pt-6 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-fg-muted">Interview date</dt><dd className="mt-1 text-fg">{formatDate(interview.completedAt)}</dd></div>
              <div><dt className="text-xs text-fg-muted">Report reference</dt><dd className="mt-1 font-mono text-[13px] text-fg">{report.id}</dd></div>
              <div><dt className="text-xs text-fg-muted">Generated</dt><dd className="mt-1 text-fg">{formatDateTime(report.generatedAt)}</dd></div>
              <div><dt className="text-xs text-fg-muted">Assessment status</dt><dd className="mt-1">{reviewed ? <Badge tone="success">Reviewed by HR</Badge> : interview.reviewStatus === "follow_up" ? <Badge tone="warning">Further review requested</Badge> : <Badge tone="indigo">Recruiter Review Required</Badge>}</dd></div>
            </dl>
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-indigo-400/25 bg-indigo-400/[0.06] p-3.5 text-[13px] leading-relaxed text-indigo-700 dark:text-indigo-100">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{interview.capturedLive && <><strong className="font-semibold">Live demo interview — sample scores only.</strong> The question responses below are this candidate&apos;s confirmed transcript. The scores and observations are placeholders and were not generated from these answers. </>}<strong className="font-semibold">Illustrative demo assessment.</strong> Generated from fictional sample data to show the report layout. Scores use a provisional 1–5 scale under review, and summarise job-related answer content only.</p>
            </div>
          </GlassCard>

          {/* Summary */}
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <GlassCard className="flex flex-col justify-between p-6" glow>
              <div>
                <p className="text-xs font-medium text-fg-muted">Overall illustrative score</p>
                <p className="mt-3 font-display text-5xl font-bold tabular-nums">{report.overall.toFixed(1)}<span className="text-xl font-semibold text-fg-muted"> / 5</span></p>
                <p className="mt-2 text-sm text-fg-secondary">{interview.capturedLive ? "Placeholder score — not derived from these answers" : band(report.overall)}</p>
              </div>
              <p className="mt-6 text-xs leading-relaxed text-fg-muted">An average of the category scores. It is not a hiring recommendation and should be read together with the evidence below.</p>
            </GlassCard>
            <GlassCard className="p-6">
              <CardHeader title="Assessment Summary" icon={<FileText />} />
              <p className="mt-4 text-[15px] leading-relaxed text-fg-secondary">{report.summary}</p>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-200"><CheckCircle2 className="size-4" aria-hidden />Relevant strengths</p>
                  <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-fg-secondary">
                    {report.strengths.map((s) => <li key={s} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-emerald-300" aria-hidden />{s}</li>)}
                  </ul>
                </div>
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-200"><ScanSearch className="size-4" aria-hidden />Suggested review areas</p>
                  <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-fg-secondary">
                    {report.reviewAreas.map((s) => <li key={s} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-amber-300" aria-hidden />{s}</li>)}
                  </ul>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Criteria */}
          <GlassCard className="p-6">
            <CardHeader title="Review by Question Category" description={`${QUESTION_SET_META[candidate.track].title} · categories from the official HR questions (${interview.questionSetId ?? QUESTION_SET_META[candidate.track].id}) · illustrative demo scores, not a validated scoring framework`} />
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-fg-muted">HR evaluation focus:{HR_EVALUATION_FOCUS.map((f) => <Pill key={f}>{f}</Pill>)}</div>
            <div className="mt-6 grid gap-x-10 gap-y-7 md:grid-cols-2">
              {report.criteria.map((c) => <ScoreBar key={c.id} label={c.label} score={c.score} explanation={c.explanation} />)}
            </div>
          </GlassCard>

          {/* Question observations */}
          <GlassCard className="p-6">
            <CardHeader title="Question-Level Observations" description="Response excerpts with role-specific observations" />
            <ol className="mt-6 space-y-4">
              {report.questions.map((qo) => (
                <li key={qo.questionId} className="rounded-xl border border-subtle bg-overlay/[0.02] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs"><span className="font-display font-semibold text-brand-cyan">Question {String(qo.number).padStart(2, "0")}</span><span className="text-fg-muted"> · {qo.category}</span></p>
                    <span className="text-xs tabular-nums text-fg-secondary"><span className="font-semibold text-fg">{qo.score.toFixed(1)}</span> / 5</span>
                  </div>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-fg">{qo.question}</p>
                  <blockquote className="mt-3 flex gap-3 border-l-2 border-brand/50 pl-4 text-[13px] italic leading-relaxed text-fg-secondary">
                    <Quote className="mt-0.5 size-3.5 shrink-0 text-brand-electric not-italic" aria-hidden />
                    {qo.excerpt}
                  </blockquote>
                  <p className="mt-3 text-[13px] leading-relaxed text-fg-muted"><span className="font-medium text-fg-secondary">Observation: </span>{qo.observation}</p>
                </li>
              ))}
            </ol>
          </GlassCard>

          {/* Recruiter notes */}
          <GlassCard className="p-6">
            <CardHeader title="Recruiter Notes" description="Internal HR remarks for this candidate" />
            {candidate.remarks.length === 0 ? (
              <p className="mt-4 text-sm text-fg-muted">No recruiter notes yet. Add one from the review panel.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {candidate.remarks.map((r) => (
                  <li key={r.id} className="rounded-xl border border-subtle bg-overlay/[0.02] p-4 text-sm">
                    <p className="text-xs text-fg-muted">{team.find((t) => t.id === r.authorId)?.name} · {formatDateTime(r.at)}</p>
                    <p className="mt-1.5 leading-relaxed text-fg-secondary">{r.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {/* Limitations */}
          <GlassCard className="p-6">
            <CardHeader title="Limitations of AI Analysis" icon={<ShieldAlert />} />
            <ul className="mt-4 grid gap-3 text-[13px] leading-relaxed text-fg-muted md:grid-cols-2">
              <li className="flex gap-2.5"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />Based only on the content of spoken answers. No facial expression, emotion, personality, or appearance analysis is performed.</li>
              <li className="flex gap-2.5"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />Self-reported experience and performance claims are not verified by the assessment.</li>
              <li className="flex gap-2.5"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />Scores can miss context — accents, nerves, or connection issues may affect a response.</li>
              <li className="flex gap-2.5"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />The scoring model is provisional and will be reviewed before production use.</li>
            </ul>
          </GlassCard>
        </article>

        <aside className="no-print space-y-4 xl:sticky xl:top-24 xl:self-start">
          <GlassCard className="p-5">
            <CardHeader title="Recruiter Actions" description="Recruiter review required" />
            <div className="mt-5"><ReviewPanel candidate={candidate} interview={interview} compact /></div>
          </GlassCard>
          <GlassCard className="p-5">
            <div className="grid gap-2">
              <Button variant="secondary" asChild><Link href={`/admin/interviews/${interview.id}`}><Video />Watch Interview</Link></Button>
              <Button variant="secondary" asChild><Link href={`/admin/candidates/${candidate.id}`}>Open Candidate Profile</Link></Button>
            </div>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function AssessmentPage() {
  return isApiMode ? <ApiAssessmentDetail /> : <DemoAssessmentPage />;
}
