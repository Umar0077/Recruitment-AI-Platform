import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, Mail } from "lucide-react";
import { AppLogo } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BRAND } from "@/lib/brand";
import { INTERVIEW_PRIVACY } from "@/lib/interview/privacy-copy";

export const metadata: Metadata = { title: "Privacy Notice" };

const SECTIONS = [
  { h: "What the interview saves", p: INTERVIEW_PRIVACY.text },
  { h: "Connected interviews", p: INTERVIEW_PRIVACY.apiStorage },
  { h: "Demo Mode", p: INTERVIEW_PRIVACY.demoStorage },
  { h: "Review and assessment", p: "Authorized recruitment staff review saved answers. Assessment uses candidate-confirmed text; original and cleaned versions are retained separately. AI observations depend on assessment configuration and provider policy and require human review." },
  { h: "Camera preview", p: INTERVIEW_PRIVACY.camera },
  { h: "Browser speech recognition", p: INTERVIEW_PRIVACY.speech },
  { h: "Spoken questions", p: INTERVIEW_PRIVACY.voice },
  { h: "Equipment test recording", p: INTERVIEW_PRIVACY.equipment },
  { h: "Your choices", p: "Interview consent is requested before starting. You can type answers, mute spoken questions and leave the camera off. Contact the recruitment team to discuss accessibility needs or an alternative assessment." },
];

export default function PrivacyPage() {
  return (
    <div className="app-backdrop min-h-dvh">
      <header className="container flex h-20 items-center justify-between">
        <AppLogo size="sm" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/"><ArrowLeft />Back</Link>
          </Button>
        </div>
      </header>
      <main className="container max-w-3xl pb-24 pt-6">
        <p className="eyebrow">Privacy</p>
        <h1 className="mt-3 text-[32px] font-bold leading-tight sm:text-[40px]">Interview Privacy Notice</h1>
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-4 text-sm text-amber-800 dark:text-amber-100">
          <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>This summary describes the current application&apos;s capture and storage behavior. An approved privacy notice, including retention and legal details, is still required before launch.</p>
        </div>
        <div className="surface mt-8 divide-y divide-[color:var(--border-subtle)] rounded-2xl">
          {SECTIONS.map((s) => (
            <section key={s.h} className="p-6">
              <h2 className="text-base font-semibold text-fg">{s.h}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-fg-secondary">{s.p}</p>
            </section>
          ))}
        </div>
        <Button variant="secondary" className="mt-8" asChild>
          <a href={`mailto:${BRAND.supportEmail}`}><Mail />Questions? Contact the recruitment team</a>
        </Button>
      </main>
    </div>
  );
}
