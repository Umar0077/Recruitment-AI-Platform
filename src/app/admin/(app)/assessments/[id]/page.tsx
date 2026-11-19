"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiAssessmentDetail } from "@/components/api/admin/assessments";
import Link from "@/components/navigation/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardX, FileText, Info, Printer, Quote, ScanSearch, ShieldAlert, UserCheck, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand";
import { Badge, CandidateAvatar, GlassCard, CardHeader, Field, Pill } from "@/components/ui/primitives";
import { HR_EVALUATION_FOCUS, QUESTION_SET_META, QUESTION_SETS } from "@/lib/demo/questions";
import { EmptyState } from "@/components/ui/states";
import { ReviewPanel } from "@/components/admin/review-panel";
import { ScoreBar } from "@/components/admin/widgets";
import { useAssessment, useCandidate, useInterview, roleTitle } from "@/lib/demo/selectors";
import { statusLabel } from "@/lib/demo/statuses";
import { useDemoStore } from "@/lib/demo/store";
import { BRAND } from "@/lib/brand";
import { exportAssessmentReportPdf } from "@/lib/report-pdf";
import { formatDate, formatDateTime, formatMinutes } from "@/lib/utils";

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
  const totalQuestions = QUESTION_SETS[candidate.track].length;

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild><Link href={`/admin/interviews/${interview.id}`}><ArrowLeft />Back to interview</Link></Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => exportAssessmentReportPdf({ reference: report.id, candidateName: candidate.name })}>
            <Printer />Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <article className="print-area min-w-0 space-y-4">
          {/* Report Header */}
          <GlassCard className="print-break-avoid relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-cyan/60 to-transparent" aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-4 text-xs text-fg-muted">
              <span className="inline-flex items-center gap-2 font-semibold text-fg">
                <BrandMark className="size-5" />
                <span>{BRAND.name} · {BRAND.organization}</span>
              </span>
              <span>Powered by GO Connectivo · Confidential HR Assessment Report</span>
            </div>
            <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="eyebrow">AI Interview Assessment Report</p>
                <h1 className="mt-2 text-[28px] font-bold leading-tight sm:text-[34px]">{candidate.name}</h1>
                <p className="mt-1.5 text-sm text-fg-secondary">{roleTitle(candidate)} · Interview <span className="font-mono">{interview.id}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <CandidateAvatar name={candidate.name} size="lg" />
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-subtle pt-5 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-fg-muted">Interview date</dt><dd className="mt-1 text-fg">{formatDate(interview.completedAt)}</dd></div>
              <div><dt className="text-xs text-fg-muted">Interview / Report ref</dt><dd className="mt-1 font-mono text-[13px] text-fg">{interview.id} / {report.id}</dd></div>
              <div><dt className="text-xs text-fg-muted">Generated</dt><dd className="mt-1 text-fg">{formatDateTime(report.generatedAt)}</dd></div>
              <div><dt className="text-xs text-fg-muted">Review status</dt><dd className="mt-1">{reviewed ? <Badge tone="success">Reviewed by HR</Badge> : interview.reviewStatus === "follow_up" ? <Badge tone="warning">Further review requested</Badge> : <Badge tone="indigo">Recruiter Review Required</Badge>}</dd></div>
            </dl>
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-indigo-400/25 bg-indigo-400/[0.06] p-3.5 text-[13px] leading-relaxed text-indigo-700 dark:text-indigo-100">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{interview.capturedLive && <><strong className="font-semibold">Live demo interview — sample scores only.</strong> The question responses below are this candidate&apos;s confirmed transcript. The scores and observations are placeholders and were not generated from these answers. </>}<strong className="font-semibold">Illustrative demo assessment (Decision Support Only).</strong> Generated from fictional sample data to show the report layout. Final hiring decisions remain with authorized HR reviewers.</p>
            </div>
          </GlassCard>

          {/* Section A — Candidate Overview */}
          <GlassCard className="print-break-avoid p-6">
            <CardHeader title="Section A — Candidate Overview" description="Applicant identity, applied role, and current recruitment stage" />
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Full name" value={candidate.name} />
              <Field label="Applied role" value={roleTitle(candidate)} />
              <Field label="Candidate ID" value={<span className="font-mono text-xs">{candidate.id}</span>} />
              <Field label="Current recruitment stage" value={statusLabel(candidate.status)} />
              <Field label="Interview completion date" value={formatDateTime(interview.completedAt)} />
              <Field label="Location" value={candidate.location} />
              <Field label="Contact email" value={candidate.email} />
              <Field label="Question set" value={interview.questionSetId ?? QUESTION_SET_META[candidate.track].id} />
            </dl>
          </GlassCard>

          {/* Section B — Interview Summary */}
          <GlassCard className="print-break-avoid p-6">
            <CardHeader title="Section B — Interview Summary" icon={<FileText />} description="Completion status, answer count, duration, and executive summary" />
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <Field label="Interview completion status" value="Completed & Confirmed" />
              <Field label="Questions answered" value={`${interview.answeredCount} of ${totalQuestions} official questions`} />
              <Field label="Interview duration" value={interview.durationSec ? formatMinutes(interview.durationSec) : "Recorded per question"} />
            </dl>
            <p className="mt-5 border-t border-subtle pt-4 text-[15px] leading-relaxed text-fg-secondary">{report.summary}</p>
          </GlassCard>

          {/* Section C — Question-by-Question Review */}
          <GlassCard className="p-6">
            <CardHeader title="Section C — Question-by-Question Review" description="Official HR questions, candidate-confirmed answers, and role-based observations" />
            <ol className="mt-6 space-y-4">
              {report.questions.map((qo) => {
                const fullAnswer = interview.answers.find((a) => a.questionId === qo.questionId);
                return (
                  <li key={qo.questionId} className="print-break-avoid rounded-xl border border-subtle bg-overlay/[0.02] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs">
                        <span className="font-display font-semibold text-brand-cyan">Question {String(qo.number).padStart(2, "0")}</span>
                        <span className="text-fg-muted"> · {qo.category} · <span className="font-mono">{qo.questionId}</span></span>
                      </p>
                      <span className="text-xs tabular-nums text-fg-secondary">
                        {fullAnswer?.durationSec ? `${formatMinutes(fullAnswer.durationSec)} · ` : ""}
                        Illustrative score: <span className="font-semibold text-fg">{qo.score.toFixed(1)}</span> / 5
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-fg">{qo.question}</p>
                    <div className="mt-3 border-l-2 border-brand/50 pl-4">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Candidate-confirmed answer</p>
                      <blockquote className="mt-1 flex gap-2.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg-secondary">
                        <Quote className="mt-0.5 size-3.5 shrink-0 text-brand-electric" aria-hidden />
                        <span>{fullAnswer?.transcript || qo.excerpt || "No confirmed answer recorded."}</span>
                      </blockquote>
                    </div>
                    <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
                      <span className="font-medium text-fg-secondary">Role-based observation: </span>{qo.observation}
                    </p>
                  </li>
                );
              })}
            </ol>
          </GlassCard>

          {/* Section D — AI-Assisted Assessment */}
          <GlassCard className="print-break-avoid p-6">
            <CardHeader
              title="Section D — AI-Assisted Assessment (Decision Support Only)"
              description={`${QUESTION_SET_META[candidate.track].title} · illustrative demo category scores and evidence summary`}
            />
            <div className="mt-5 grid gap-4 lg:grid-cols-[240px_1fr]">
              <div className="flex flex-col justify-between rounded-xl border border-subtle bg-overlay/[0.02] p-5">
                <div>
                  <p className="text-xs font-medium text-fg-muted">Overall illustrative score</p>
                  <p className="mt-2 font-display text-4xl font-bold tabular-nums">{report.overall.toFixed(1)}<span className="text-lg font-semibold text-fg-muted"> / 5</span></p>
                  <p className="mt-2 text-sm text-fg-secondary">{interview.capturedLive ? "Placeholder score — not derived from these answers" : band(report.overall)}</p>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-fg-muted">Average of category scores. Not an automated hiring recommendation.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-200"><CheckCircle2 className="size-4" aria-hidden />Relevant strengths</p>
                  <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-fg-secondary">
                    {report.strengths.map((s) => <li key={s} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-emerald-400" aria-hidden />{s}</li>)}
                  </ul>
                </div>
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-200"><ScanSearch className="size-4" aria-hidden />Suggested review areas &amp; missing info</p>
                  <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-fg-secondary">
                    {report.reviewAreas.map((s) => <li key={s} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-amber-400" aria-hidden />{s}</li>)}
                  </ul>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-fg-muted">HR evaluation focus:{HR_EVALUATION_FOCUS.map((f) => <Pill key={f}>{f}</Pill>)}</div>
            <div className="mt-5 grid gap-x-10 gap-y-6 md:grid-cols-2">
              {report.criteria.map((c) => <ScoreBar key={c.id} label={c.label} score={c.score} explanation={c.explanation} />)}
            </div>
            <div className="mt-6 border-t border-subtle pt-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted"><ShieldAlert className="size-4 text-amber-600 dark:text-amber-300" aria-hidden />Technical Limitations of AI Analysis</p>
              <ul className="mt-3 grid gap-2.5 text-[13px] leading-relaxed text-fg-muted md:grid-cols-2">
                <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />Evaluates only the job-related content of confirmed answers. No honesty, employability, or character inference is made from facial appearance, voice accent, emotion, or tab-focus events.</li>
                <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />Self-reported experience, closing numbers, and performance claims are not independently verified.</li>
              </ul>
            </div>
          </GlassCard>

          {/* Section E — HR Review */}
          <GlassCard className="print-break-avoid p-6">
            <CardHeader title="Section E — HR Review &amp; Human Decision" icon={<UserCheck />} description="Authoritative human reviewer status, recruitment stage, and persisted internal remarks" />
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <Field label="HR review status" value={reviewed ? "Reviewed by HR" : interview.reviewStatus === "follow_up" ? "Further review requested" : "Awaiting HR Review"} />
              <Field label="Current recruitment stage" value={statusLabel(candidate.status)} />
              <Field label="Decision authority" value="Authorized Human Reviewer (HR)" />
            </dl>
            <div className="mt-5 border-t border-subtle pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Persisted Recruiter Notes</p>
              {candidate.remarks.length === 0 ? (
                <p className="mt-2 text-sm text-fg-muted">No persisted recruiter notes yet. Save a note from the Recruiter Actions panel to include it in this report.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {candidate.remarks.map((r) => (
                    <li key={r.id} className="rounded-xl border border-subtle bg-overlay/[0.02] p-3.5 text-sm">
                      <p className="text-xs text-fg-muted">{team.find((t) => t.id === r.authorId)?.name ?? "HR Reviewer"} · {formatDateTime(r.at)}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed text-fg-secondary">{r.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </GlassCard>

          {/* Section F — Recording Information */}
          <GlassCard className="print-break-avoid p-6">
            <CardHeader title="Section F — Recording Information" icon={<Video />} description="Authorized media status (private storage URLs and raw media are never embedded in exported PDFs)" />
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Recording availability" value="Not recorded (Fictional Demo Mode)" />
              <Field label="Session duration" value={interview.durationSec ? formatMinutes(interview.durationSec) : "N/A"} />
              <Field label="Technical status" value="Confirmed text transcript verified; no private media object attached" />
            </dl>
            <p className="no-print mt-4 text-xs text-fg-muted">
              Authorized reviewers can inspect session details in <Link href={`/admin/interviews/${interview.id}`} className="text-brand-cyan underline">Interview Review ({interview.id})</Link>.
            </p>
          </GlassCard>
        </article>

        <aside className="no-print space-y-4 xl:sticky xl:top-24 xl:self-start">
          <GlassCard className="p-5">
            <CardHeader title="Recruiter Actions" description="Human HR decision &amp; notes" />
            <div className="mt-5"><ReviewPanel candidate={candidate} interview={interview} compact /></div>
          </GlassCard>
          <GlassCard className="p-5">
            <div className="grid gap-2">
              <Button variant="secondary" asChild><Link href={`/admin/interviews/${interview.id}`}><Video />Open Interview Review</Link></Button>
              <Button variant="secondary" asChild><Link href={`/admin/candidates/${candidate.id}`}>Open Candidate Profile</Link></Button>
            </div>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode renders the isolated fictional report. */
export default function AssessmentPage() {
  return isApiMode ? <ApiAssessmentDetail /> : <DemoAssessmentPage />;
}
