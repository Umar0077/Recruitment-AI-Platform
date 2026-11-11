"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Briefcase, CalendarClock, CheckCircle2, Clock, FileText, PlayCircle, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { CandidateShell } from "@/components/candidate/shell";
import { Button } from "@/components/ui/button";
import { Badge, GlassCard } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { CoreFallback } from "@/components/visuals/core-fallback";
import { useDemoStore } from "@/lib/demo/store";
import { useCandidate, useInterview, roleTitle } from "@/lib/demo/selectors";
import { FEATURED } from "@/lib/demo/seed";
import { formatDateTime } from "@/lib/utils";
import { officialQuestions } from "@/lib/demo/questions";
import { isApiMode } from "@/lib/config/environment";
import { useCandidateFlow } from "@/lib/data/candidate-flow";
import { useFlowGate } from "@/components/candidate/flow-gate";
import { TRACK_LABEL } from "@/lib/api/labels";
import { useMyInterview } from "@/lib/data/queries";

const AICore = dynamic(() => import("@/components/visuals/ai-core").then((m) => m.AICore), { ssr: false, loading: () => <CoreFallback /> });

export default function InterviewWelcomePage() {
  return (
    <CandidateShell>
      {isApiMode ? <ApiWelcome /> : <Welcome />}
    </CandidateShell>
  );
}

function Welcome() {
  const flow = useDemoStore((s) => s.flow);
  const setups = useDemoStore((s) => s.setups);
  const selectDemoCandidate = useDemoStore((s) => s.selectDemoCandidate);
  const settings = useDemoStore((s) => s.settings);
  const candidate = useCandidate(flow.candidateId);
  const interview = useInterview(candidate?.interviewId);
  if (!candidate) return null;

  const setup = setups[candidate.track];
  const inProgress = flow.stage === "interrupted" || (flow.answeredCount > 0 && flow.stage !== "submitted");
  const submitted = flow.stage === "submitted" || interview?.status === "completed";
  const statusLabel = submitted ? "Submitted" : inProgress ? "In Progress" : "Not Started";

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <div className="w-28 sm:w-32">
          <AICore state="idle" particles={false} label="AI interviewer" />
        </div>
        <span className="mt-4 inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-700 dark:text-emerald-200"><CheckCircle2 className="size-3.5" aria-hidden />Application received</span>
        <p className="eyebrow mt-5">One more step · AI interview invitation</p>
        <h1 className="mt-3 text-[30px] font-bold leading-tight sm:text-[40px]">Thank you for applying to {settings.organizationName}, {candidate.name.split(" ")[0]}.</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted sm:text-base">Your basic application has been submitted. {settings.welcomeText}</p>
      </div>

      <GlassCard className="mt-10 overflow-hidden" glow>
        <dl className="grid divide-y divide-[rgba(148,163,184,0.12)] sm:grid-cols-2 sm:divide-y-0">
          {[
            { icon: UserRound, label: "Candidate", value: candidate.name },
            { icon: Briefcase, label: "Position", value: roleTitle(candidate) },
            { icon: Sparkles, label: "Interview type", value: `AI-assisted interview · ${officialQuestions(candidate.track).length} questions` },
            { icon: Clock, label: "Estimated duration", value: setup.totalDuration },
            { icon: CalendarClock, label: "Complete by", value: formatDateTime(interview?.expiresAt) },
            { icon: FileText, label: "Status", value: <Badge tone={submitted ? "success" : inProgress ? "cyan" : "warning"}>{statusLabel}</Badge> },
          ].map((f, i) => (
            <div key={f.label} className={`flex items-center gap-4 px-6 py-5 ${i % 2 === 1 ? "sm:border-l sm:border-subtle" : ""} ${i >= 2 ? "sm:border-t sm:border-subtle" : ""}`}>
              <f.icon className="size-5 shrink-0 text-brand-cyan" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-fg-muted">{f.label}</dt>
                <dd className="mt-0.5 text-[15px] font-medium leading-snug text-fg">{f.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </GlassCard>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {["Find a quiet, well-lit space", "Allow camera and microphone access", "Answer naturally — there's a practice question first"].map((t, i) => (
          <div key={t} className="flex items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.02] px-4 py-3 text-sm text-fg-secondary">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand-cyan">{i + 1}</span>
            {t}
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center" id="start">
        {submitted ? (
          <Button size="lg" asChild>
            <Link href="/candidate/status">View Interview Status<ArrowRight /></Link>
          </Button>
        ) : inProgress ? (
          <>
            <Button size="lg" asChild>
              <Link href="/candidate/interview/resume"><PlayCircle />Resume Interview</Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/candidate/interview/instructions">Review Instructions</Link>
            </Button>
          </>
        ) : (
          <Button size="lg" asChild className="min-w-56">
            <Link href="/candidate/interview/instructions">Start AI Interview<ArrowRight /></Link>
          </Button>
        )}
      </div>

      {!submitted && (
        <p className="mt-4 text-center text-sm text-fg-muted">If you are unable to complete the interview right now, you can return using your application link.</p>
      )}
      <p className="mt-1 text-center text-xs text-fg-disabled">Demo: in this preview, your progress is kept in this browser; secure application links arrive with the backend phase.</p>

      {/* Demo-only profile switcher */}
      <div className="mt-14 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-indigo-400/25 p-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-100">Demo: choose an interview track</p>
          <p className="text-xs text-fg-muted">Switching resets this demo interview so each track can be presented from the start.</p>
        </div>
        <Select
          label="Demo candidate"
          className="w-full sm:w-72"
          value={flow.candidateId}
          onValueChange={(v) => {
            selectDemoCandidate(v);
            toast.info("Demo candidate switched.");
          }}
          options={[
            { value: FEATURED.fresher, label: "Ayesha Malik — Customer Sales Representative (Fresher)" },
            { value: FEATURED.experienced, label: "Omar Siddiqui — Experienced FE Closer" },
          ]}
        />
      </div>
    </div>
  );
}

/** API mode: the invitation comes from the candidate's own application record in PostgreSQL. */
function ApiWelcome() {
  const f = useCandidateFlow();
  const my = useMyInterview();
  const settings = useDemoStore((s) => s.settings);
  const gate = useFlowGate(f);
  if (gate) return gate;
  const app = my.current?.application;
  const st = f.interviewStatus;
  const submitted = st === "SUBMITTED";
  const awaitingSubmit = st === "COMPLETED";
  const inProgress = st === "IN_PROGRESS" || st === "INTERRUPTED";
  const label = submitted ? "Submitted" : awaitingSubmit ? "Answers complete — not yet submitted" : inProgress ? `In Progress · ${f.answeredCount} of ${f.totalQuestions}` : "Not Started";

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <div className="w-28 sm:w-32">
          <AICore state="idle" particles={false} label="AI interviewer" />
        </div>
        <span className="mt-4 inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-700 dark:text-emerald-200"><CheckCircle2 className="size-3.5" aria-hidden />{app?.stage.label ?? "Application received"}</span>
        <p className="eyebrow mt-5">One more step · AI interview invitation</p>
        <h1 className="mt-3 text-[30px] font-bold leading-tight sm:text-[40px]">Thank you for applying to {settings.organizationName}, {f.firstName}.</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted sm:text-base">Your basic application has been submitted. {settings.welcomeText}</p>
      </div>

      <GlassCard className="mt-10 overflow-hidden" glow>
        <dl className="grid divide-y divide-[rgba(148,163,184,0.12)] sm:grid-cols-2 sm:divide-y-0">
          {[
            { icon: UserRound, label: "Candidate", value: f.candidateName },
            { icon: Briefcase, label: "Position", value: `${f.roleTitle}${app ? ` · ${TRACK_LABEL[app.jobRole.track]}` : ""}` },
            { icon: Sparkles, label: "Interview type", value: `AI-assisted interview · ${f.totalQuestions} questions` },
            { icon: Clock, label: "Estimated duration", value: f.durationLabel },
            { icon: CalendarClock, label: "Complete by", value: formatDateTime(f.expiresAt) },
            { icon: FileText, label: "Status", value: <Badge tone={submitted ? "success" : inProgress || awaitingSubmit ? "cyan" : "warning"}>{label}</Badge> },
          ].map((x, i) => (
            <div key={x.label} className={`flex items-center gap-4 px-6 py-5 ${i % 2 === 1 ? "sm:border-l sm:border-subtle" : ""} ${i >= 2 ? "sm:border-t sm:border-subtle" : ""}`}>
              <x.icon className="size-5 shrink-0 text-brand-cyan" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-fg-muted">{x.label}</dt>
                <dd className="mt-0.5 break-words text-[15px] font-medium leading-snug text-fg">{x.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </GlassCard>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {["Find a quiet, well-lit space", "Allow camera and microphone access", "Answer naturally — there's a practice question first"].map((t, i) => (
          <div key={t} className="flex items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.02] px-4 py-3 text-sm text-fg-secondary">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-semibold text-brand-cyan">{i + 1}</span>
            {t}
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center" id="start">
        {submitted ? (
          <Button size="lg" asChild><Link href="/candidate/status">View Interview Status<ArrowRight /></Link></Button>
        ) : awaitingSubmit ? (
          <Button size="lg" asChild><Link href="/candidate/interview/complete">Submit Interview<ArrowRight /></Link></Button>
        ) : inProgress ? (
          <>
            <Button size="lg" asChild><Link href="/candidate/interview/resume"><PlayCircle />Resume Interview</Link></Button>
            <Button size="lg" variant="secondary" asChild><Link href="/candidate/interview/instructions">Review Instructions</Link></Button>
          </>
        ) : (
          <Button size="lg" asChild className="min-w-56"><Link href="/candidate/interview/instructions">Start AI Interview<ArrowRight /></Link></Button>
        )}
      </div>
      {!submitted && (
        <p className="mt-4 text-center text-sm text-fg-muted">If you are unable to complete the interview right now, you can return using your application link.</p>
      )}
      {my.count > 1 && <p className="mt-1 text-center text-xs text-fg-muted">Showing your most recent open interview.</p>}
    </div>
  );
}
