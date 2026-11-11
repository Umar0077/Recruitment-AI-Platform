"use client";
import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { PoweredByConnectivo } from "@/components/ui/powered-by";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BrandMark } from "@/components/ui/brand";
import { DemoLoginForm } from "@/components/candidate/demo-login-form";
import { DemoBadge } from "@/components/ui/states";
import { PageTransition } from "@/components/motion";
import { BRAND } from "@/lib/brand";
import { isApiMode } from "@/lib/config/environment";
import { SocialSignIn } from "@/components/auth/social-sign-in";

export default function AdminLoginPage() {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink-950 px-4 py-10">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(800px_480px_at_50%_30%,rgba(37,99,235,calc(0.24*var(--glow-k))),transparent_65%)]" />
        <div className="bg-grid bg-grid-fade absolute inset-0 opacity-60" />
        {/* Security-themed concentric rings */}
        <svg className="absolute left-1/2 top-[38%] w-[1100px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-40" viewBox="0 0 1000 1000">
          {[180, 260, 340, 420].map((r, i) => (
            <circle key={r} cx="500" cy="500" r={r} fill="none" stroke="rgba(96,165,250,0.18)" strokeDasharray={i % 2 ? "2 10" : "none"} className={i === 1 ? "core-spin-slow" : i === 3 ? "core-spin-rev" : undefined} style={{ transformOrigin: "500px 500px" }} />
          ))}
        </svg>
      </div>
      <Link href="/" className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />Candidate site
      </Link>
      <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-5 sm:top-5">{!isApiMode && <DemoBadge className="hidden sm:inline-flex" />}<ThemeToggle /></div>

      <PageTransition className="relative w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute -inset-4 rounded-full bg-brand/30 blur-2xl" aria-hidden />
            <div className="relative grid size-16 place-items-center rounded-2xl border border-glow/50 bg-ink-900/80">
              <BrandMark className="size-9" />
            </div>
          </div>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-fg-muted">{BRAND.name} · Recruiter access</p>
        </div>
        <div className="surface-solid edge-light rounded-3xl p-7 shadow-float sm:p-9">
          <h1 className="text-center text-[26px] font-bold leading-tight sm:text-[28px]">Recruitment Control Center.</h1>
          <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed text-fg-muted">Manage interviews, assessments, and hiring workflows in one intelligent workspace.</p>
          <div className="mt-8">
            {isApiMode ? <SocialSignIn area="admin" defaultNext="/admin" /> : <DemoLoginForm role="admin" redirectTo="/admin" submitLabel="Sign In" />}
          </div>
        </div>
        {!isApiMode && <>
        <ul className="mt-6 flex items-center justify-center gap-5 text-xs text-fg-muted">
          <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-brand-cyan" aria-hidden />Role-based workspace</li>
          <li className="flex items-center gap-1.5"><KeyRound className="size-3.5 text-brand-cyan" aria-hidden />Fictional demo data only</li>
        </ul>
        <p className="mt-3 text-center text-[11px] text-fg-disabled">Production authentication will replace demo access before launch.</p>
        </>}
        <div className="mt-6 flex justify-center"><PoweredByConnectivo size="md" /></div>
      </PageTransition>
    </div>
  );
}
