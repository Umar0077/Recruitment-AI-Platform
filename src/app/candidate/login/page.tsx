"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { PoweredByConnectivo } from "@/components/ui/powered-by";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AppLogo } from "@/components/ui/brand";
import { DemoLoginForm } from "@/components/candidate/demo-login-form";
import { CoreFallback } from "@/components/visuals/core-fallback";
import { PageTransition } from "@/components/motion";
import { useDemoStore } from "@/lib/demo/store";
import { INTERVIEW_CONFIG } from "@/lib/brand";
import { isApiMode } from "@/lib/config/environment";
import { SocialSignIn } from "@/components/auth/social-sign-in";

const AICore = dynamic(() => import("@/components/visuals/ai-core").then((m) => m.AICore), { ssr: false, loading: () => <CoreFallback /> });

export default function CandidateLoginPage() {
  return (
    <div className="grid min-h-dvh bg-ink-950 lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden border-r border-subtle lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(700px_500px_at_50%_55%,rgba(37,99,235,calc(0.32*var(--glow-k))),transparent_65%)]" aria-hidden />
        <div className="bg-grid bg-grid-fade absolute inset-0 opacity-60" aria-hidden />
        <div className="relative z-10 p-10">
          <AppLogo descriptor />
        </div>
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-10">
          <div className="w-full max-w-[380px]">
            <AICore state="idle" parallax label="InterviewOS AI core" />
          </div>
        </div>
        <div className="relative z-10 p-10">
          <h2 className="max-w-md text-3xl font-bold leading-tight">Your interview is ready when you are.</h2>
          <ul className="mt-5 space-y-2.5 text-sm text-fg-secondary">
            {[`${INTERVIEW_CONFIG.questionsPerInterview} guided, role-related questions`, `${INTERVIEW_CONFIG.durationLabel}`, "A practice question before you begin"].map((t) => (
              <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="size-4 text-brand-cyan" aria-hidden />{t}</li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form */}
      <main className="relative flex flex-col px-5 py-8 sm:px-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(500px_260px_at_50%_0%,rgba(37,99,235,calc(0.18*var(--glow-k))),transparent_70%)] lg:hidden" aria-hidden />
        <div className="relative flex items-center justify-between">
          <span className="lg:hidden"><AppLogo size="sm" /></span>
          <Link href="/" className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-fg-muted transition-colors hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">Back to interview home</span><span className="sm:hidden">Home</span>
          </Link>
          <ThemeToggle className="ml-1" />
        </div>
        <PageTransition className="relative mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
          <p className="eyebrow mb-4">Candidate access</p>
          <h1 className="text-[34px] font-bold leading-tight sm:text-[40px]">Welcome Back.</h1>
          <p className="mt-2 text-[15px] text-fg-muted">Continue your interview journey.</p>
          <div className="mt-9">
            {isApiMode ? (
              <SocialSignIn area="candidate" defaultNext="/candidate/interview" />
            ) : (
            <DemoLoginForm
              role="candidate"
              submitLabel="Continue"
              redirectTo={() => {
                const stage = useDemoStore.getState().flow.stage;
                if (stage === "interrupted") return "/candidate/interview/resume";
                if (stage === "submitted") return "/candidate/status";
                return "/candidate/interview";
              }}
            />
            )}
          </div>
          {!isApiMode && (
            <p className="mt-8 text-center text-xs leading-relaxed text-fg-muted">
              Use the sign-in details from your interview invitation. Having trouble? Contact the recruitment team.
            </p>
          )}
          <div className="mt-8 flex justify-center border-t border-subtle pt-6"><PoweredByConnectivo size="md" /></div>
        </PageTransition>
      </main>
    </div>
  );
}
