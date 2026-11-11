"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleStop } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { HelpDialog, useCandidateGate, usePageTitle } from "@/components/candidate/shell";
import { VoiceInterview } from "@/components/interview/voice-interview";
import { useDemoStore } from "@/lib/demo/store";
import { useCandidate, roleTitle } from "@/lib/demo/selectors";
import { officialQuestions } from "@/lib/demo/questions";
import { isApiMode } from "@/lib/config/environment";
import { useCandidateFlow } from "@/lib/data/candidate-flow";
import { useInterruptInterview, useInterviewDetail, useSaveAnswer, useStartInterview } from "@/lib/data/queries";
import { useFlowGate } from "@/components/candidate/flow-gate";
import { ApiErrorPanel, errorText } from "@/components/api/query-state";
import { ApiError } from "@/lib/api/client";
import type { InterviewQuestion } from "@/types";

export default function SessionPage() {
  return isApiMode ? <ApiSessionPage /> : <DemoSessionPage />;
}

function SessionSkeleton() {
  return (
    <div className="app-backdrop grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-3xl space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-80 w-full rounded-2xl" /></div>
    </div>
  );
}

function DemoSessionPage() {
  const ready = useCandidateGate();
  usePageTitle("AI Interview");
  const flow = useDemoStore((s) => s.flow);
  const candidate = useCandidate(flow.candidateId);
  if (!ready || !candidate) {
    return (
      <div className="app-backdrop grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-3xl space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-80 w-full rounded-2xl" /></div>
      </div>
    );
  }
  if (!flow.consent) return <Blocked reason="consent" />;
  if (flow.stage === "submitted") return <Blocked reason="submitted" />;
  return <Session key={candidate.id} />;
}

function Blocked({ reason }: { reason: "consent" | "submitted" }) {
  return (
    <div className="app-backdrop grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-bold">{reason === "consent" ? "Consent Needed First" : "Interview Already Submitted"}</h1>
        <p className="mt-2 text-fg-muted">{reason === "consent" ? "Please review and agree to the recording consent before starting your interview." : "Your interview has been submitted. You can check its status at any time."}</p>
        <Button className="mt-6" asChild>
          <Link href={reason === "consent" ? "/candidate/interview/consent" : "/candidate/status"}>{reason === "consent" ? "Review Consent" : "View Status"}</Link>
        </Button>
      </div>
    </div>
  );
}

function Session() {
  const router = useRouter();
  const flow = useDemoStore((s) => s.flow);
  const candidate = useCandidate(flow.candidateId)!;
  const setup = useDemoStore((s) => s.setups[candidate.track]);
  const recordAnswer = useDemoStore((s) => s.recordAnswer);
  const interrupt = useDemoStore((s) => s.interruptInterview);
  const submit = useDemoStore((s) => s.submitInterview);
  const [help, setHelp] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // Always the official, locked HR question set for this candidate's track (never draft edits).
  const questions = useMemo(() => officialQuestions(candidate.track), [candidate.track]);
  // Resume at the first official question without a confirmed answer — never repeats or skips one.
  const answered = new Set((flow.answers ?? []).map((a) => a.questionId));
  const firstOpen = questions.findIndex((q) => !answered.has(q.id));
  const startIndex = firstOpen < 0 ? questions.length - 1 : firstOpen;

  return (
    <>
      <VoiceInterview
        variant="session"
        questions={questions}
        startIndex={startIndex}
        candidateName={candidate.name}
        roleTitle={roleTitle(candidate)}
        responseSeconds={setup.secondsPerQuestion}
        onAnswerConfirmed={(q, text, durationSec, inputMode) =>
          recordAnswer({ sessionId: candidate.interviewId, questionId: q.id, questionNumber: q.number, questionText: q.text, category: q.category, confirmed: true, transcript: text, durationSec, inputMode, confirmedAt: new Date().toISOString() })
        }
        onComplete={() => {
          const ref = submit();
          toast.success("Interview submitted.", { description: `Reference ${ref}` });
          router.push("/candidate/interview/complete");
        }}
        onExit={() => setConfirmEnd(true)}
        onHelp={() => setHelp(true)}
      />
      <HelpDialog open={help} onOpenChange={setHelp} />
      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent title="Leave the interview?" description="Here's what happens to your progress if you leave now." size="sm">
          <div className="flex items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.03] p-3.5 text-sm">
            <CircleStop className="size-4 shrink-0 text-brand-cyan" aria-hidden />
            <span className="text-fg-secondary">
              <strong className="text-fg">{flow.answers?.length ?? 0} of {questions.length}</strong> answers confirmed. They are kept in this demo so you can resume from the next question.
            </span>
          </div>
          <p className="mt-3 text-xs text-fg-muted">An answer that wasn&apos;t confirmed will need to be given again. The microphone and interviewer voice stop when you leave.</p>
          <DialogFooter>
            <Button
              variant="danger"
              onClick={() => {
                interrupt();
                setConfirmEnd(false);
                toast.info("Interview paused. Confirmed answers were saved in this demo.");
                router.push("/candidate/interview/resume");
              }}
            >
              Exit Interview
            </Button>
            <Button onClick={() => setConfirmEnd(false)}>Continue Interview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────────────────── API mode: PostgreSQL-backed session ─────────────────────────

function ApiSessionPage() {
  const ready = useCandidateGate();
  usePageTitle("AI Interview");
  if (!ready) return <SessionSkeleton />;
  return <ApiSessionLoader />;
}

function ApiSessionLoader() {
  const router = useRouter();
  const f = useCandidateFlow();
  const gate = useFlowGate(f);
  const start = useStartInterview(f.interviewId);
  const status = f.interviewStatus;
  const decided = useRef(false);

  // Decide ONCE, from the status when this page loads: PENDING (with consent) → start, INTERRUPTED → resume.
  // Later changes (e.g. the candidate pressing Exit, which pauses the session) must not trigger a resume.
  useEffect(() => {
    if (decided.current || !f.interviewId || !status) return;
    decided.current = true;
    if (status === "INTERRUPTED") start.mutate({ consent: false, resume: true });
    else if (status === "PENDING" && f.consent) start.mutate({ consent: true });
  }, [status, f.consent, f.interviewId, start]);

  useEffect(() => {
    if (status === "COMPLETED") router.replace("/candidate/interview/complete");
    if (start.error instanceof ApiError && start.error.code === "INTERVIEW_EXPIRED") router.replace("/candidate/interview/unavailable?reason=expired");
  }, [status, start.error, router]);

  const detail = useInterviewDetail(status === "IN_PROGRESS" || start.isSuccess ? f.interviewId : undefined);

  const wrap = (node: React.ReactNode) => <div className="app-backdrop grid min-h-dvh place-items-center p-6"><div className="w-full max-w-xl">{node}</div></div>;
  if (gate) return wrap(gate);
  if (status === "PENDING" && !f.consent) return <Blocked reason="consent" />;
  if (status === "SUBMITTED") return <Blocked reason="submitted" />;
  if (start.isError) return wrap(<ApiErrorPanel error={start.error} onRetry={() => start.mutate({ consent: status === "PENDING", resume: status === "INTERRUPTED" })} />);
  if (detail.isError) return wrap(<ApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} />);
  if (!detail.data || detail.data.status !== "IN_PROGRESS") return <SessionSkeleton />;
  return <ApiSession key={detail.data.interviewId} detail={detail.data} />;
}

type Detail = NonNullable<ReturnType<typeof useInterviewDetail>["data"]>;

function ApiSession({ detail }: { detail: Detail }) {
  const router = useRouter();
  const interviewId = detail.interviewId;
  const save = useSaveAnswer(interviewId);
  const resume = useStartInterview(interviewId);
  const interrupt = useInterruptInterview(interviewId);
  const [help, setHelp] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // The session's own question snapshot (exact HR wording for the version it was issued with), frozen for this mount.
  const [questions] = useState<InterviewQuestion[]>(() =>
    detail.questions.map((q) => ({ id: q.code, number: q.position, category: q.category, text: q.text, responseSeconds: q.responseSeconds, setId: detail.questionSetVersion })),
  );
  const firstOpen = detail.questions.findIndex((q) => !q.answer);
  const startIndex = firstOpen < 0 ? questions.length - 1 : firstOpen;
  const [savedCount, setSavedCount] = useState(detail.completedQuestions);

  const persist = async (q: InterviewQuestion, text: string, durationSec: number, mode: "voice" | "typed") => {
    const input = {
      transcript: text,
      source: mode === "voice" ? ("SPEECH_TO_TEXT" as const) : ("TYPED_FALLBACK" as const),
      responseDurationSec: Math.min(3600, Math.max(0, Math.round(durationSec))),
      engine: mode === "voice" ? "browser-web-speech" : undefined,
      language: typeof navigator !== "undefined" ? navigator.language.slice(0, 20) : undefined,
    };
    try {
      await save.mutateAsync({ code: q.id, input });
    } catch (e) {
      // Paused from another tab: resume once, then save again (identical text is idempotent server-side).
      if (e instanceof ApiError && e.code === "INTERVIEW_NOT_ACTIVE" && /interrupted/i.test(e.message)) {
        try {
          await resume.mutateAsync({ consent: false, resume: true });
          await save.mutateAsync({ code: q.id, input });
        } catch (e2) {
          throw new Error(errorText(e2));
        }
      } else {
        if (e instanceof ApiError && e.code === "INTERVIEW_EXPIRED") router.replace("/candidate/interview/unavailable?reason=expired");
        throw new Error(errorText(e));
      }
    }
    setSavedCount((n) => n + 1);
  };

  return (
    <>
      <VoiceInterview
        variant="session"
        questions={questions}
        startIndex={startIndex}
        candidateName={detail.candidate.fullName}
        roleTitle={detail.jobRole.title}
        responseSeconds={questions[startIndex]?.responseSeconds ?? 90}
        onAnswerConfirmed={persist}
        onComplete={() => router.push("/candidate/interview/complete")}
        onExit={() => setConfirmEnd(true)}
        onHelp={() => setHelp(true)}
      />
      <HelpDialog open={help} onOpenChange={setHelp} />
      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent title="Leave the interview?" description="Here's what happens to your progress if you leave now." size="sm">
          <div className="flex items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.03] p-3.5 text-sm">
            <CircleStop className="size-4 shrink-0 text-brand-cyan" aria-hidden />
            <span className="text-fg-secondary">
              <strong className="text-fg">{savedCount} of {questions.length}</strong> answers are saved to your application. You can resume from the next question before your deadline.
            </span>
          </div>
          <p className="mt-3 text-xs text-fg-muted">An answer that wasn&apos;t confirmed will need to be given again. The microphone and interviewer voice stop when you leave.</p>
          {interrupt.isError && <p role="alert" className="mt-3 text-xs text-red-700 dark:text-red-200">{errorText(interrupt.error)}</p>}
          <DialogFooter>
            <Button
              variant="danger"
              loading={interrupt.isPending}
              onClick={() =>
                interrupt.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmEnd(false);
                    toast.info("Interview paused. Your confirmed answers are saved.");
                    router.push("/candidate/interview/resume");
                  },
                })
              }
            >
              Exit Interview
            </Button>
            <Button onClick={() => setConfirmEnd(false)}>Continue Interview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
