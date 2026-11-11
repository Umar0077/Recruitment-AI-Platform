"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { CandidateShell } from "@/components/candidate/shell";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/overlays";
import { VoiceInterview } from "@/components/interview/voice-interview";
import { useDemoStore } from "@/lib/demo/store";
import { useCandidateFlow } from "@/lib/data/candidate-flow";
import { useStartInterview } from "@/lib/data/queries";
import { useFlowGate } from "@/components/candidate/flow-gate";
import { errorText } from "@/components/api/query-state";
import { isApiMode } from "@/lib/config/environment";
import type { InterviewQuestion } from "@/types";

const PRACTICE_SECONDS = 60;

export default function PracticePage() {
  return (
    <CandidateShell step={3} wide>
      <Practice />
    </CandidateShell>
  );
}

function Practice() {
  const router = useRouter();
  const f = useCandidateFlow();
  const updateFlow = useDemoStore((s) => s.updateFlow);
  const start = useStartInterview(f.interviewId);
  const [done, setDone] = useState(f.practiceDone);
  const questions = useMemo<InterviewQuestion[]>(() => [{ id: "practice", number: 0, category: "Practice", text: f.practiceQuestion, responseSeconds: PRACTICE_SECONDS }], [f.practiceQuestion]);
  const gate = useFlowGate(f);
  if (gate) return gate;

  const goInterview = () => {
    if (!isApiMode) {
      updateFlow({ practiceDone: true, stage: "active" });
      router.push("/candidate/interview/session");
      return;
    }
    if (start.isPending) return;
    if (!f.consent) {
      toast.warning("Please give consent before starting.");
      router.push("/candidate/interview/consent");
      return;
    }
    f.update({ practiceDone: true });
    // The backend starts (or continues) the persistent session; we move on only after it confirms.
    start.mutate(
      { consent: true },
      {
        onSuccess: () => router.push("/candidate/interview/session"),
        onError: (e) => {
          if ((e as { code?: string }).code === "INTERVIEW_EXPIRED") router.replace("/candidate/interview/unavailable?reason=expired");
          else toast.error("The interview couldn't start.", { description: errorText(e) });
        },
      },
    );
  };

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Practice round</p>
          <h1 className="mt-3 text-[28px] font-bold sm:text-[36px]">Let&apos;s Get Comfortable.</h1>
          <p className="mt-2 max-w-xl text-[15px] text-fg-muted">
            Hear one question, answer it out loud, and see your words appear. <strong className="font-semibold text-fg">This practice answer is not scored or saved.</strong>
          </p>
        </div>
        <span className="inline-flex h-8 w-fit items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 text-xs font-medium text-amber-800 dark:text-amber-200">Practice — not scored</span>
      </div>

      <div className="mt-8">
        <VoiceInterview
          variant="embedded"
          practice
          questions={questions}
          candidateName={f.candidateName}
          roleTitle={f.roleTitle}
          responseSeconds={PRACTICE_SECONDS}
          onComplete={() => {
            setDone(true);
            if (isApiMode) f.update({ practiceDone: true });
            else updateFlow({ practiceDone: true });
          }}
        />
      </div>

      {start.isError && <p role="alert" className="mt-6 text-sm text-red-700 dark:text-red-200">{errorText(start.error)}</p>}
      {done && (
        <Notice className="mt-6" title="Nice work.">
          The real interview works the same way: the AI interviewer reads each question, then you click the microphone, answer, review, and confirm.
        </Notice>
      )}
      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" asChild><Link href="/candidate/interview/equipment"><ArrowLeft />Back to Equipment Check</Link></Button>
        {done ? (
          <Button size="lg" onClick={goInterview} loading={start.isPending}>Continue to Interview{!start.isPending && <ArrowRight />}</Button>
        ) : (
          <Button size="lg" variant="secondary" loading={start.isPending} onClick={() => { toast.info("Practice skipped."); goInterview(); }}>{!start.isPending && <SkipForward />}Skip Practice</Button>
        )}
      </div>
    </div>
  );
}
