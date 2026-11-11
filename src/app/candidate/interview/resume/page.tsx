"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Headphones, LifeBuoy, PlayCircle, Briefcase } from "lucide-react";
import { CandidateShell } from "@/components/candidate/shell";
import { Button } from "@/components/ui/button";
import { Badge, GlassCard } from "@/components/ui/primitives";
import { InterviewProgress } from "@/components/interview/parts";
import { useDemoStore } from "@/lib/demo/store";
import { useCandidate, useInterview, roleTitle } from "@/lib/demo/selectors";
import { formatDateTime } from "@/lib/utils";
import { officialQuestions, QUESTION_SET_META } from "@/lib/demo/questions";
import { BRAND, INTERVIEW_CONFIG } from "@/lib/brand";
import { isApiMode } from "@/lib/config/environment";
import { useCandidateFlow } from "@/lib/data/candidate-flow";
import { useProgress } from "@/lib/data/queries";
import { useFlowGate } from "@/components/candidate/flow-gate";
import { ApiErrorPanel } from "@/components/api/query-state";

export default function ResumePage() {
  return (
    <CandidateShell>
      {isApiMode ? <ApiResume /> : <Resume />}
    </CandidateShell>
  );
}

function Resume() {
  const router = useRouter();
  const flow = useDemoStore((s) => s.flow);
  const updateFlow = useDemoStore((s) => s.updateFlow);
  const candidate = useCandidate(flow.candidateId);
  const interview = useInterview(candidate?.interviewId);
  if (!candidate) return null;
  const questions = officialQuestions(candidate.track);
  const total = questions.length;
  const answeredIds = new Set((flow.answers ?? []).map((a) => a.questionId));
  const done = questions.filter((q) => answeredIds.has(q.id)).length;
  const nextQ = questions.find((q) => !answeredIds.has(q.id));
  const hoursLeft = interview?.expiresAt ? Math.max(0, Math.ceil((new Date(interview.expiresAt).getTime() - Date.now()) / 3600000)) : 0;

  if (done === 0 && flow.stage !== "interrupted") {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">Nothing to Resume</h1>
        <p className="mt-2 text-fg-muted">You haven&apos;t started your interview yet.</p>
        <Button className="mt-6" asChild><Link href="/candidate/interview">Go to Interview</Link></Button>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Unfinished interview</p>
      <h1 className="mt-3 text-[30px] font-bold sm:text-[40px]">Welcome Back, {candidate.name.split(" ")[0]}.</h1>
      <p className="mt-2 text-[15px] text-fg-muted">You can pick up where you left off. Completed answers are kept; you&apos;ll continue from the next question.</p>

      <GlassCard className="mt-8 p-6 sm:p-8" glow>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge tone="cyan">AI Interview In Progress</Badge>
            <p className="mt-4 font-display text-4xl font-bold">{done} <span className="text-xl font-semibold text-fg-muted">of {total} questions completed</span></p>
          </div>
          <InterviewProgress total={total} current={done} completed={done} />
        </div>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-overlay/[0.07]">
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-cyan" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.02] p-4">
            <Briefcase className="size-4 text-brand-cyan" aria-hidden />
            <div><dt className="text-xs text-fg-muted">Applied role</dt><dd className="text-sm font-medium">{roleTitle(candidate)}</dd></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.02] p-4">
            <CalendarClock className="size-4 text-brand-cyan" aria-hidden />
            <div><dt className="text-xs text-fg-muted">Completion window</dt><dd className="text-sm font-medium">{hoursLeft} hour{hoursLeft === 1 ? "" : "s"} left · until {formatDateTime(interview?.expiresAt)}</dd></div>
          </div>
        </dl>
        {nextQ && <p className="mt-5 text-sm text-fg-secondary">Next: <span className="font-medium text-fg">Question {nextQ.number} · {nextQ.category}</span> ({QUESTION_SET_META[candidate.track].title})</p>}
        <p className="mt-2 text-xs text-fg-muted">Demo note: confirmed answers are kept in this browser only (no cross-device resume yet). Secure resume links and the {INTERVIEW_CONFIG.reminderAfterHours}-hour reminder arrive with the backend phase.</p>
      </GlassCard>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={() => { updateFlow({ stage: "active" }); router.push("/candidate/interview/session"); }}>
          <PlayCircle />Resume Interview
        </Button>
        <Button size="lg" variant="secondary" asChild>
          <Link href="/candidate/interview/equipment"><Headphones />Restart Equipment Check</Link>
        </Button>
        <Button size="lg" variant="ghost" asChild>
          <a href={`mailto:${BRAND.supportEmail}`}><LifeBuoy />Help &amp; Support</a>
        </Button>
      </div>
    </div>
  );
}

/** API mode: progress comes from PostgreSQL, so resume works from any browser or device. */
function ApiResume() {
  const router = useRouter();
  const f = useCandidateFlow();
  const gate = useFlowGate(f);
  const progress = useProgress(f.interviewId);
  if (gate) return gate;
  if (progress.isError) return <ApiErrorPanel error={progress.error} onRetry={() => void progress.refetch()} />;
  const p = progress.data;
  if (!p) return <div className="py-16"><div className="skeleton h-40 rounded-2xl" aria-hidden /></div>;
  if (p.status === "SUBMITTED" || p.status === "COMPLETED") {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">{p.status === "SUBMITTED" ? "Interview Already Submitted" : "All Questions Answered"}</h1>
        <p className="mt-2 text-fg-muted">{p.status === "SUBMITTED" ? "You can check its status at any time." : "Finish by submitting your interview."}</p>
        <Button className="mt-6" asChild><Link href={p.status === "SUBMITTED" ? "/candidate/status" : "/candidate/interview/complete"}>{p.status === "SUBMITTED" ? "View Status" : "Submit Interview"}</Link></Button>
      </div>
    );
  }
  if (p.status === "PENDING") {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">Nothing to Resume</h1>
        <p className="mt-2 text-fg-muted">You haven&apos;t started your interview yet.</p>
        <Button className="mt-6" asChild><Link href="/candidate/interview">Go to Interview</Link></Button>
      </div>
    );
  }
  const done = p.completedQuestions;
  const total = p.totalQuestions;
  const hoursLeft = Math.max(0, Math.ceil(p.remainingSeconds / 3600));
  return (
    <div>
      <p className="eyebrow">Unfinished interview</p>
      <h1 className="mt-3 text-[30px] font-bold sm:text-[40px]">Welcome Back, {f.firstName}.</h1>
      <p className="mt-2 text-[15px] text-fg-muted">You can pick up where you left off. Your confirmed answers are saved; you&apos;ll continue from the next question.</p>
      <GlassCard className="mt-8 p-6 sm:p-8" glow>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge tone="cyan">{p.status === "INTERRUPTED" ? "Interview Paused" : "AI Interview In Progress"}</Badge>
            <p className="mt-4 font-display text-4xl font-bold">{done} <span className="text-xl font-semibold text-fg-muted">of {total} questions completed</span></p>
          </div>
          <InterviewProgress total={total} current={done} completed={done} />
        </div>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-overlay/[0.07]">
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-cyan" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.02] p-4">
            <Briefcase className="size-4 text-brand-cyan" aria-hidden />
            <div><dt className="text-xs text-fg-muted">Applied role</dt><dd className="text-sm font-medium">{p.jobRole.title}</dd></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.02] p-4">
            <CalendarClock className="size-4 text-brand-cyan" aria-hidden />
            <div><dt className="text-xs text-fg-muted">Completion window</dt><dd className="text-sm font-medium">{hoursLeft} hour{hoursLeft === 1 ? "" : "s"} left · until {formatDateTime(p.expiresAt)}</dd></div>
          </div>
        </dl>
        {p.nextQuestion && <p className="mt-5 text-sm text-fg-secondary">Next: <span className="font-medium text-fg">Question {p.nextQuestion.position} · {p.nextQuestion.category}</span> ({p.questionSetVersion})</p>}
      </GlassCard>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={() => router.push("/candidate/interview/session")}><PlayCircle />Resume Interview</Button>
        <Button size="lg" variant="secondary" asChild><Link href="/candidate/interview/equipment"><Headphones />Restart Equipment Check</Link></Button>
        <Button size="lg" variant="ghost" asChild><a href={`mailto:${BRAND.supportEmail}`}><LifeBuoy />Help &amp; Support</a></Button>
      </div>
    </div>
  );
}
