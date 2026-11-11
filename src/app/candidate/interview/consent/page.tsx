"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, FileText, Lock, Mic, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { CandidateShell } from "@/components/candidate/shell";
import { Button } from "@/components/ui/button";
import { Checkbox, GlassCard } from "@/components/ui/primitives";
import { Notice } from "@/components/ui/overlays";
import { useDemoStore } from "@/lib/demo/store";
import { BRAND } from "@/lib/brand";
import { useCandidateFlow } from "@/lib/data/candidate-flow";
import { useFlowGate } from "@/components/candidate/flow-gate";
import { isApiMode } from "@/lib/config/environment";

export default function ConsentPage() {
  return (
    <CandidateShell step={1}>
      <Consent />
    </CandidateShell>
  );
}

function Consent() {
  const router = useRouter();
  const f = useCandidateFlow();
  const updateFlow = useDemoStore((s) => s.updateFlow);
  const settings = useDemoStore((s) => s.settings);
  const alternative = useDemoStore((s) => s.setups.fresher.alternativeInfo);
  // Never pre-checked — even if consent was given before, the candidate confirms again here.
  const [agreed, setAgreed] = useState(false);
  const gate = useFlowGate(f);
  if (gate) return gate;

  return (
    <div>
      <p className="eyebrow">Recording consent</p>
      <h1 className="mt-3 text-[28px] font-bold sm:text-[36px]">Before We Record Anything</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
        Please read how your interview is recorded and used. Giving consent here is separate from allowing camera and microphone access, which your browser will ask for on the next step.
      </p>

      <GlassCard className="mt-8 divide-y divide-[rgba(148,163,184,0.12)]">
        {[
          { icon: Eye, title: "What is recorded", body: "Video and audio of your answers during the interview, and the time taken for each response. The practice question is not used for assessment." },
          { icon: FileText, title: "How it is used", body: `${settings.privacyText} AI summarises the job-related content of your answers to support — not replace — the recruiter's review.` },
          { icon: Users, title: "Who can see it", body: "Authorised members of the recruitment team for this role. Your recording is not shared with other candidates." },
          { icon: Lock, title: "What is never done", body: "Your video is not used to judge your emotions, personality, or appearance." },
          { icon: Mic, title: "Microphone and speech-to-text", body: "The microphone turns on only when you click it, and you can always see when it is listening. Your spoken answers are converted to text so you can review and edit them before confirming. In this demo, transcription uses your browser's built-in speech recognition, which may send audio to the browser provider's speech service; InterviewOS does not save any audio. This demo is not a final recruitment assessment — production recording and retention policies will be set separately." },
        ].map((x) => (
          <div key={x.title} className="flex gap-4 p-5 sm:p-6">
            <x.icon className="mt-0.5 size-5 shrink-0 text-brand-cyan" aria-hidden />
            <div>
              <h2 className="font-display text-[15px] font-semibold">{x.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-fg-muted">{x.body}</p>
            </div>
          </div>
        ))}
      </GlassCard>

      <p className="mt-4 text-sm text-fg-muted">
        Read the full <a className="text-brand-cyan underline-offset-4 hover:underline" href={BRAND.privacyNoticeUrl}>Privacy Notice</a>.
      </p>

      <label htmlFor="consent" className="mt-8 flex cursor-pointer items-start gap-4 rounded-2xl border border-glow/40 bg-brand/[0.06] p-5 transition-colors hover:bg-brand/[0.09]">
        <Checkbox id="consent" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" aria-describedby="consent-desc" />
        <span id="consent-desc" className="text-[15px] leading-relaxed text-fg">
          I have read the information above and consent to my interview responses being recorded and reviewed for this application.
        </span>
      </label>

      <Notice className="mt-4" title="Prefer not to record a video interview?">
        {alternative}
      </Notice>

      <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" asChild>
          <Link href="/candidate/interview/instructions"><ArrowLeft />Back</Link>
        </Button>
        <Button
          size="lg"
          disabled={!agreed}
          onClick={() => {
            // API mode: kept in this tab and sent with the Start request, where the server records it.
            if (isApiMode) f.update({ consent: true });
            else updateFlow({ consent: true, stage: f.stage === "active" || f.stage === "interrupted" ? f.stage : "equipment" });
            toast.success("Consent recorded for this demo session.");
            router.push("/candidate/interview/equipment");
          }}
        >
          <ShieldCheck />
          Agree and Continue
          <ArrowRight />
        </Button>
      </div>
      {!agreed && <p className="mt-3 text-right text-xs text-fg-muted">Tick the consent box to continue.</p>}
    </div>
  );
}
