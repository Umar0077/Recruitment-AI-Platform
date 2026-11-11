"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CalendarCheck, Hash, Mail, UserRound, Briefcase, ShieldCheck } from "lucide-react";
import { CandidateShell } from "@/components/candidate/shell";
import { Button } from "@/components/ui/button";
import { Badge, GlassCard } from "@/components/ui/primitives";
import { useDemoStore } from "@/lib/demo/store";
import { useCandidate, roleTitle } from "@/lib/demo/selectors";
import { formatDateTime } from "@/lib/utils";
import { EASE } from "@/components/motion";
import { useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { isApiMode } from "@/lib/config/environment";
import { useCandidateFlow, clearPreChecks } from "@/lib/data/candidate-flow";
import { useProgress, useSubmitInterview } from "@/lib/data/queries";
import { useFlowGate } from "@/components/candidate/flow-gate";
import { ApiErrorPanel, errorText } from "@/components/api/query-state";

export default function CompletePage() {
  return (
    <CandidateShell step={6}>
      {isApiMode ? <ApiComplete /> : <Complete />}
    </CandidateShell>
  );
}

function Complete() {
  const reduce = useReducedMotion();
  const flow = useDemoStore((s) => s.flow);
  const candidate = useCandidate(flow.candidateId);
  if (!candidate) return null;
  const submitted = flow.stage === "submitted";

  if (!submitted) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">No Submitted Interview Yet</h1>
        <p className="mt-2 text-fg-muted">Complete your interview to see your confirmation here.</p>
        <Button className="mt-6" asChild><Link href="/candidate/interview">Go to Interview</Link></Button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <motion.div initial={reduce ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: EASE }} className="relative mx-auto grid size-24 place-items-center">
        <div className="absolute inset-0 rounded-full bg-success/20 blur-2xl" aria-hidden />
        <div className="relative grid size-20 place-items-center rounded-full border border-success/40 bg-gradient-to-b from-success/20 to-success/5">
          <svg viewBox="0 0 40 40" className="size-10" aria-hidden>
            <path d="M11 21l6 6 12-14" fill="none" stroke="#34D399" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="success-draw" />
          </svg>
        </div>
      </motion.div>
      <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2, ease: EASE }}>
        <h1 className="mt-8 text-[30px] font-bold leading-tight sm:text-[40px]">Your Interview Has Been Submitted.</h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted sm:text-base">
          Thank you for completing your AI-assisted interview. Your responses have been submitted for recruiter review.
        </p>
        <div className="mt-4 flex justify-center"><Badge tone="indigo">Simulated successful submission — UI preview</Badge></div>
      </motion.div>

      <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.35, ease: EASE }}>
        <GlassCard className="mx-auto mt-10 max-w-xl text-left" glow>
          <dl className="divide-y divide-[rgba(148,163,184,0.12)]">
            {[
              { icon: UserRound, k: "Candidate", v: candidate.name },
              { icon: Briefcase, k: "Applied role", v: roleTitle(candidate) },
              { icon: Hash, k: "Interview reference", v: <span className="font-mono text-[13px]">{flow.reference}</span> },
              { icon: ShieldCheck, k: "Submission status", v: <Badge tone="success">Submitted for review</Badge> },
              { icon: CalendarCheck, k: "Completed", v: formatDateTime(flow.submittedAt) },
            ].map((r) => (
              <div key={r.k} className="flex items-center gap-4 px-6 py-4">
                <r.icon className="size-4 shrink-0 text-brand-cyan" aria-hidden />
                <dt className="w-40 shrink-0 text-sm text-fg-muted">{r.k}</dt>
                <dd className="min-w-0 truncate text-sm font-medium text-fg">{r.v}</dd>
              </div>
            ))}
          </dl>
        </GlassCard>

        <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-subtle bg-overlay/[0.02] p-5 text-left">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg"><Mail className="size-4 text-brand-cyan" aria-hidden />What happens next</p>
          <ol className="mt-3 space-y-2 text-sm text-fg-muted">
            <li>1. A recruiter reviews your interview and application.</li>
            <li>2. If you&apos;re shortlisted, the team contacts you to arrange an HR interview.</li>
            <li>3. You can check your status here at any time.</li>
          </ol>
        </div>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild><Link href="/candidate/status">Return to Interview Portal<ArrowRight /></Link></Button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * API mode: when every answer is confirmed (status COMPLETED) this screen submits the interview once.
 * The success view appears only after the backend reports SUBMITTED; failures offer a retry.
 */
function ApiComplete() {
  const reduce = useReducedMotion();
  const f = useCandidateFlow();
  const gate = useFlowGate(f);
  const progress = useProgress(f.interviewId);
  const submit = useSubmitInterview(f.interviewId);
  const fired = useRef(false);
  const status = progress.data?.status;

  useEffect(() => {
    if (status !== "COMPLETED" || fired.current || submit.isPending) return;
    fired.current = true;
    submit.mutate(undefined, { onSuccess: () => clearPreChecks(f.interviewId) });
  }, [status, submit, f.interviewId]);

  if (gate) return gate;
  if (progress.isError) return <ApiErrorPanel error={progress.error} onRetry={() => void progress.refetch()} />;
  const p = submit.data?.progress ?? progress.data;
  if (!p) return <div className="py-16"><div className="skeleton mx-auto h-40 max-w-xl rounded-2xl" aria-hidden /></div>;

  if (p.status !== "SUBMITTED") {
    if (p.status === "COMPLETED") {
      return (
        <div className="py-16 text-center" aria-live="polite">
          <h1 className="text-2xl font-bold">{submit.isError ? "Submission Didn't Go Through" : "Submitting Your Interview…"}</h1>
          <p className="mx-auto mt-2 max-w-md text-fg-muted">{submit.isError ? errorText(submit.error) + " Your answers are saved." : "Please keep this page open for a moment."}</p>
          {submit.isError && <Button className="mt-6" onClick={() => submit.mutate(undefined, { onSuccess: () => clearPreChecks(f.interviewId) })} loading={submit.isPending}><RefreshCw />Try Again</Button>}
        </div>
      );
    }
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">No Submitted Interview Yet</h1>
        <p className="mt-2 text-fg-muted">{p.completedQuestions} of {p.totalQuestions} questions are answered. Complete your interview to submit it.</p>
        <Button className="mt-6" asChild><Link href="/candidate/interview">Go to Interview</Link></Button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <motion.div initial={reduce ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: EASE }} className="relative mx-auto grid size-24 place-items-center">
        <div className="absolute inset-0 rounded-full bg-success/20 blur-2xl" aria-hidden />
        <div className="relative grid size-20 place-items-center rounded-full border border-success/40 bg-gradient-to-b from-success/20 to-success/5">
          <svg viewBox="0 0 40 40" className="size-10" aria-hidden>
            <path d="M11 21l6 6 12-14" fill="none" stroke="#34D399" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="success-draw" />
          </svg>
        </div>
      </motion.div>
      <h1 className="mt-8 text-[30px] font-bold leading-tight sm:text-[40px]">Your Interview Has Been Submitted.</h1>
      <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted sm:text-base">
        Thank you for completing your AI-assisted interview. Your responses have been submitted for recruiter review.
      </p>
      <GlassCard className="mx-auto mt-10 max-w-xl text-left" glow>
        <dl className="divide-y divide-[rgba(148,163,184,0.12)]">
          {[
            { icon: UserRound, k: "Candidate", v: f.candidateName },
            { icon: Briefcase, k: "Applied role", v: p.jobRole.title },
            { icon: Hash, k: "Interview reference", v: <span className="font-mono text-[13px]">{p.reference}</span> },
            { icon: ShieldCheck, k: "Submission status", v: <Badge tone="success">Submitted for review</Badge> },
            { icon: CalendarCheck, k: "Submitted", v: formatDateTime(p.submittedAt ?? undefined) },
          ].map((r) => (
            <div key={r.k} className="flex items-center gap-4 px-6 py-4">
              <r.icon className="size-4 shrink-0 text-brand-cyan" aria-hidden />
              <dt className="w-40 shrink-0 text-sm text-fg-muted">{r.k}</dt>
              <dd className="min-w-0 truncate text-sm font-medium text-fg">{r.v}</dd>
            </div>
          ))}
        </dl>
      </GlassCard>
      <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-subtle bg-overlay/[0.02] p-5 text-left">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg"><Mail className="size-4 text-brand-cyan" aria-hidden />What happens next</p>
        <ol className="mt-3 space-y-2 text-sm text-fg-muted">
          <li>1. A recruiter reviews your interview and application.</li>
          <li>2. If you&apos;re shortlisted, the team contacts you to arrange an HR interview.</li>
          <li>3. You can check your status here at any time.</li>
        </ol>
      </div>
      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <Button size="lg" asChild><Link href="/candidate/status">Return to Interview Portal<ArrowRight /></Link></Button>
      </div>
    </div>
  );
}
