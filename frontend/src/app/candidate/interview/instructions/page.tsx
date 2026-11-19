"use client";
import Link from "@/components/navigation/link";
import { ArrowLeft, ArrowRight, Camera, Clock, FileText, LifeBuoy, ListOrdered, MessageSquareText, Mic } from "lucide-react";
import { CandidateShell } from "@/components/candidate/shell";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/primitives";
import { useDemoStore } from "@/lib/demo/store";
import { useCandidateFlow } from "@/lib/data/candidate-flow";
import { useFlowGate } from "@/components/candidate/flow-gate";
import { isApiMode } from "@/lib/config/environment";
import { formatDuration } from "@/lib/utils";
import { interviewStorageNotice } from "@/lib/interview/privacy-copy";

export default function InstructionsPage() {
  return (
    <CandidateShell step={0}>
      <Instructions />
    </CandidateShell>
  );
}

function Instructions() {
  const f = useCandidateFlow();
  const updateFlow = useDemoStore((s) => s.updateFlow);
  // Counts and timing come from the flow; device copy reflects the available capture controls.
  const setup = useDemoStore((s) => s.setups[f.track]);
  const gate = useFlowGate(f);
  if (gate) return gate;

  const sections = [
    { icon: MessageSquareText, title: "Interview format", body: `An AI interviewer asks ${f.totalQuestions} role-related questions, one at a time. Each question appears on screen as it is asked.` },
    { icon: ListOrdered, title: "Question sequence", body: "Questions follow a fixed order. A short practice question comes first and is not scored." },
    { icon: Clock, title: "Response time", body: `You have up to ${formatDuration(f.secondsPerQuestion)} per answer, with a visible timer. Total time: ${f.durationLabel.toLowerCase()}.` },
    { icon: Camera, title: "Equipment", body: "Use a microphone for spoken answers, or type instead. The camera is an optional live preview only. Keep a stable internet connection and check your setup before starting." },
    { icon: FileText, title: "What is saved", body: interviewStorageNotice(isApiMode) },
    { icon: LifeBuoy, title: "Need help?", body: "Use the Help button at any time. Contact the recruitment team to discuss accessibility needs or an alternative assessment." },
  ];

  return (
    <div>
      <p className="eyebrow">Before you begin</p>
      <h1 className="mt-3 text-[28px] font-bold sm:text-[36px]">Interview Instructions</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">{setup.instructions}</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {sections.map((s) => (
          <GlassCard key={s.title} className="flex gap-4 p-5">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-subtle bg-brand/10 text-brand-cyan">
              <s.icon className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-display text-[15px] font-semibold text-fg">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">{s.body}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-xl border border-subtle bg-overlay/[0.02] p-4 text-sm text-fg-secondary">
        <Mic className="size-4 shrink-0 text-brand-cyan" aria-hidden />
        Tip: speak at a normal pace and look toward the screen. There are no trick questions — answer honestly from your own experience.
      </div>

      <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" asChild>
          <Link href="/candidate/interview" prefetch={true}><ArrowLeft />Back</Link>
        </Button>
        <Button size="lg" asChild onClick={() => !isApiMode && f.stage === "not_started" && updateFlow({ stage: "consent" })}>
          <Link href="/candidate/interview/consent" prefetch={true}>Continue to Consent<ArrowRight /></Link>
        </Button>
      </div>
    </div>
  );
}
