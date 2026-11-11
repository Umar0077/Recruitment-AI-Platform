"use client";
import Link from "next/link";
import { Check, Circle, Clock } from "lucide-react";
import { CandidateShell } from "@/components/candidate/shell";
import { Button } from "@/components/ui/button";
import { Badge, GlassCard } from "@/components/ui/primitives";
import { useDemoStore } from "@/lib/demo/store";
import { useCandidate, useInterview, roleTitle } from "@/lib/demo/selectors";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { isApiMode } from "@/lib/config/environment";
import { useMyInterview } from "@/lib/data/queries";
import { ApiErrorPanel } from "@/components/api/query-state";
import { FlowSkeleton } from "@/components/candidate/flow-gate";

/**
 * Candidate-safe status view: shows only the candidate's own progress.
 * Internal HR stages, remarks, and assessment results are never shown here.
 */
const STEPS = ["Application Received", "AI Interview Pending", "AI Interview In Progress", "AI Interview Completed", "Under Recruiter Review"] as const;

export default function StatusPage() {
  return (
    <CandidateShell>
      {isApiMode ? <ApiStatus /> : <Status />}
    </CandidateShell>
  );
}

function Status() {
  const flow = useDemoStore((s) => s.flow);
  const candidate = useCandidate(flow.candidateId);
  const interview = useInterview(candidate?.interviewId);
  if (!candidate) return null;

  const completed = interview?.status === "completed";
  const inProgress = !completed && (interview?.status === "in_progress" || flow.answeredCount > 0);
  const current = completed ? 4 : inProgress ? 2 : 1;
  const at = (type: string) => candidate.events.find((e) => e.type === type)?.at;
  const dates = [candidate.appliedAt, at("invite"), at("interview_started"), at("interview_submitted"), at("interview_submitted")];

  return (
    <div>
      <p className="eyebrow">Your application</p>
      <h1 className="mt-3 text-[30px] font-bold sm:text-[40px]">Interview Status</h1>
      <p className="mt-2 text-[15px] text-fg-muted">{roleTitle(candidate)} · Reference {flow.reference ?? candidate.id}</p>

      <GlassCard className="mt-8 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">Current status</p>
          <Badge tone={completed ? "indigo" : inProgress ? "cyan" : "warning"}>{STEPS[current]}</Badge>
        </div>
        <ol className="relative mt-8">
          {STEPS.map((s, i) => {
            const done = i < current || (i === current && i === 4);
            const active = i === current && i !== 4;
            return (
              <li key={s} className="relative flex gap-4 pb-8 last:pb-0">
                {i < STEPS.length - 1 && <span className={cn("absolute left-[15px] top-8 h-[calc(100%-24px)] w-px", i < current ? "bg-brand/60" : "bg-overlay/10")} aria-hidden />}
                <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full border", done ? "border-brand bg-brand text-white" : active ? "border-brand-cyan bg-brand-cyan/10 text-brand-cyan shadow-[0_0_0_5px_rgba(56,189,248,0.08)]" : "border-subtle text-fg-disabled")}>
                  {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : active ? <Clock className="size-4" aria-hidden /> : <Circle className="size-3" aria-hidden />}
                </span>
                <div className="pt-1">
                  <p className={cn("text-[15px] font-medium", done || active ? "text-fg" : "text-fg-disabled")}>{s}{active && <span className="sr-only"> (current step)</span>}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{done || active ? (dates[i] ? formatDateTime(dates[i]) : "In progress") : "Upcoming"}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </GlassCard>

      <p className="mt-6 text-sm leading-relaxed text-fg-muted">
        The recruitment team will contact you about any next steps. Detailed review notes are internal and aren&apos;t shown in this portal.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {!completed && (
          <Button asChild><Link href={inProgress ? "/candidate/interview/resume" : "/candidate/interview"}>{inProgress ? "Resume Interview" : "Go to Interview"}</Link></Button>
        )}
        <Button variant="secondary" asChild><Link href="/">Back to Interview Home</Link></Button>
      </div>
    </div>
  );
}

/** API mode: candidate-safe stage from the backend (no remarks, reviews or internal outcomes). */
function ApiStatus() {
  const my = useMyInterview();
  if (my.isPending) return <FlowSkeleton />;
  if (my.isError) return <ApiErrorPanel error={my.error} onRetry={() => void my.refetch()} />;
  const app = my.current?.application;
  const iv = my.current?.interview;
  if (!app) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">No Application Linked</h1>
        <p className="mt-2 text-fg-muted">We couldn&apos;t find an application for this account. Contact the recruitment team.</p>
      </div>
    );
  }
  const stageKey = app.stage.key;
  const current = stageKey === "application_received" ? 0 : stageKey === "ai_interview_pending" ? 1 : stageKey === "ai_interview_in_progress" ? 2 : stageKey === "ai_interview_completed" ? 3 : 4;
  const withdrawn = stageKey === "withdrawn";
  const dates = [app.submittedAt, iv?.invitedAt, iv?.startedAt, iv?.submittedAt, current === 4 ? app.stageChangedAt : null];
  const inProgress = iv && (iv.status === "IN_PROGRESS" || iv.status === "INTERRUPTED");
  const open = iv && iv.status !== "SUBMITTED" && iv.status !== "EXPIRED" && iv.status !== "CANCELLED";
  return (
    <div>
      <p className="eyebrow">Your application</p>
      <h1 className="mt-3 text-[30px] font-bold sm:text-[40px]">Interview Status</h1>
      <p className="mt-2 text-[15px] text-fg-muted">{app.jobRole.title} · Reference {iv?.reference ?? app.reference}</p>
      <GlassCard className="mt-8 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">Current status</p>
          <Badge tone={withdrawn ? "neutral" : current >= 3 ? "indigo" : current === 2 ? "cyan" : "warning"}>{app.stage.label}</Badge>
        </div>
        {iv?.status === "EXPIRED" && <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3 text-sm text-amber-800 dark:text-amber-100">Your interview window closed on {formatDateTime(iv.expiresAt)}. Contact the recruitment team if you need help.</p>}
        <ol className="relative mt-8">
          {STEPS.map((s, i) => {
            const done = i < current || (i === current && i === 4);
            const active = i === current && i !== 4;
            return (
              <li key={s} className="relative flex gap-4 pb-8 last:pb-0">
                {i < STEPS.length - 1 && <span className={cn("absolute left-[15px] top-8 h-[calc(100%-24px)] w-px", i < current ? "bg-brand/60" : "bg-overlay/10")} aria-hidden />}
                <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full border", done ? "border-brand bg-brand text-white" : active ? "border-brand-cyan bg-brand-cyan/10 text-brand-cyan shadow-[0_0_0_5px_rgba(56,189,248,0.08)]" : "border-subtle text-fg-disabled")}>
                  {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : active ? <Clock className="size-4" aria-hidden /> : <Circle className="size-3" aria-hidden />}
                </span>
                <div className="pt-1">
                  <p className={cn("text-[15px] font-medium", done || active ? "text-fg" : "text-fg-disabled")}>{s}{active && <span className="sr-only"> (current step)</span>}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{done || active ? (dates[i] ? formatDateTime(dates[i] ?? undefined) : "In progress") : "Upcoming"}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </GlassCard>
      <p className="mt-6 text-sm leading-relaxed text-fg-muted">
        The recruitment team will contact you about any next steps. Detailed review notes are internal and aren&apos;t shown in this portal.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {open && <Button asChild><Link href={inProgress ? "/candidate/interview/resume" : "/candidate/interview"}>{inProgress ? "Resume Interview" : "Go to Interview"}</Link></Button>}
        <Button variant="secondary" asChild><Link href="/">Back to Interview Home</Link></Button>
      </div>
    </div>
  );
}
