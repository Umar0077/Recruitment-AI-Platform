"use client";
import Link from "@/components/navigation/link";
import { useRouter } from "@/components/navigation/provider";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, FileText, Lock, Mic, ShieldCheck, Users, Volume2 } from "lucide-react";
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
import { INTERVIEW_PRIVACY, interviewReviewNotice, interviewStorageNotice } from "@/lib/interview/privacy-copy";

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
  // Never pre-checked — even if consent was given before, the candidate confirms again here.
  const [agreed, setAgreed] = useState(false);
  const gate = useFlowGate(f);

  useEffect(() => {
    router.prefetch("/candidate/interview/equipment");
  }, [router]);

  if (gate) return gate;

  return (
    <div>
      <p className="eyebrow">Interview consent</p>
      <h1 className="mt-3 text-[28px] font-bold sm:text-[36px]">Before You Begin</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-muted">
        Please read how your interview text is captured, saved and reviewed. Consent here is separate from browser permissions for the microphone or optional camera, requested when you enable those features.
      </p>

      <GlassCard className="mt-8 divide-y divide-[rgba(148,163,184,0.12)]">
        {[
          { icon: Eye, title: "What is saved", body: INTERVIEW_PRIVACY.text },
          { icon: FileText, title: isApiMode ? "Application storage" : "Demo browser storage", body: interviewStorageNotice(isApiMode) },
          { icon: Users, title: "Review and assessment", body: interviewReviewNotice(isApiMode) },
          { icon: Lock, title: "Optional camera preview", body: INTERVIEW_PRIVACY.camera },
          { icon: Mic, title: "Microphone and speech recognition", body: INTERVIEW_PRIVACY.speech },
          { icon: Volume2, title: "Spoken questions", body: INTERVIEW_PRIVACY.voice },
          { icon: Mic, title: "Optional equipment test clip", body: INTERVIEW_PRIVACY.equipment },
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
          {isApiMode ? "I have read the information above and consent to my interview text, transcript versions and response times being saved and reviewed for this application." : "I have read the information above and agree to fictional interview text, transcript versions and response times being saved in this browser for the demo."}
        </span>
      </label>

      <Notice className="mt-4" title="Need a different way to answer?">
        You can type your answers and leave the camera off. Contact the recruitment team to discuss other accessibility needs or an alternative assessment.
      </Notice>

      <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="ghost" asChild>
          <Link href="/candidate/interview/instructions" prefetch={true}><ArrowLeft />Back</Link>
        </Button>
        <Button
          size="lg"
          disabled={!agreed}
          onClick={() => {
            // API mode: kept in this tab and sent with the Start request, where the server records it.
            if (isApiMode) f.update({ consent: true });
            else updateFlow({ consent: true, stage: f.stage === "active" || f.stage === "interrupted" ? f.stage : "equipment" });
            toast.success(isApiMode ? "Consent confirmed for this interview." : "Consent saved for this demo session.");
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
