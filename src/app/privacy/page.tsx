import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, Mail } from "lucide-react";
import { AppLogo } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy Notice" };

const SECTIONS = [
  { h: "What the interview captures", p: "Video and audio of your interview answers, the time taken for each response, and basic technical details needed to run the session." },
  { h: "Why it is collected", p: "To assess your application for the specific role you applied for, using the same structured questions for every candidate on your track." },
  { h: "Who can review it", p: "Authorised members of the recruitment team for this role. AI summarises job-related answer content to support their review; people make every hiring decision." },
  { h: "What is never done", p: "Your video is not used to judge your emotions, personality, honesty, or appearance." },
  { h: "Your choices", p: "You will be asked for consent before anything is recorded. If a video interview is not suitable for you, you can ask for an alternative assessment." },
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
          <p>Placeholder summary for the UI preview. The approved privacy notice, including data retention and legal details, will replace this page before launch.</p>
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
