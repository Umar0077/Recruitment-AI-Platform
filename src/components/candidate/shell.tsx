"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, HelpCircle, LifeBuoy, LogOut, Mail, RefreshCw, WifiOff } from "lucide-react";
import { PoweredByConnectivo } from "@/components/ui/powered-by";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AppLogo } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/states";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Skeleton } from "@/components/ui/primitives";
import { PageTransition } from "@/components/motion";
import { useDemoStore } from "@/lib/demo/store";
import { useAuth } from "@/lib/auth/auth-provider";
import { useAccessGate } from "@/lib/auth/use-access-gate";
import { isApiMode } from "@/lib/config/environment";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** The seven official interview stages (HR document p. 4). */
export const FLOW_STEPS = ["Welcome", "Consent", "Equipment Check", "Practice", "Interview", "Submission", "Confirmation"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

export function FlowStepper({ current }: { current: number }) {
  return (
    <nav aria-label="Interview preparation progress" className="w-full">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {FLOW_STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors duration-300",
                  done ? "border-brand bg-brand text-white" : active ? "border-brand-cyan bg-brand-cyan/10 text-brand-cyan" : "border-subtle text-fg-disabled",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("hidden truncate text-xs font-medium md:block", active ? "text-fg" : done ? "text-fg-secondary" : "text-fg-disabled")}>{s}</span>
              {i < FLOW_STEPS.length - 1 && <span className={cn("h-px min-w-3 flex-1", done ? "bg-brand/60" : "bg-overlay/10")} aria-hidden />}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-fg-muted md:hidden">
        Step {current + 1} of {FLOW_STEPS.length}: <span className="text-fg-secondary">{FLOW_STEPS[current]}</span>
      </p>
    </nav>
  );
}

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Technical Help" description="Quick fixes for common issues. Your progress on completed questions is kept.">
        <ul className="space-y-3 text-sm">
          {[
            { icon: RefreshCw, t: "Camera or microphone not working", d: "Check your browser's site permissions (the camera icon in the address bar), close other apps using the camera, then retry the equipment check." },
            { icon: WifiOff, t: "Connection dropped", d: "Reconnect, then sign in again. You can resume from the next unanswered question while your invitation is open." },
            { icon: LifeBuoy, t: "Accessibility or alternative assessment", d: "Contact the recruitment team to discuss adjustments or an alternative to a video interview." },
          ].map((x) => (
            <li key={x.t} className="flex gap-3 rounded-xl border border-subtle bg-overlay/[0.02] p-3.5">
              <x.icon className="mt-0.5 size-4 shrink-0 text-brand-cyan" aria-hidden />
              <div>
                <p className="font-medium text-fg">{x.t}</p>
                <p className="mt-0.5 text-fg-muted">{x.d}</p>
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="secondary" asChild>
            <a href={`mailto:${BRAND.supportEmail}`}><Mail />Email support</a>
          </Button>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Render gate for candidate pages (demo session or verified sign-in). The backend enforces access itself. */
export function useCandidateGate() {
  return useAccessGate("candidate");
}

const PAGE_TITLES: Record<string, string> = {
  "/candidate/interview": "Your Interview",
  "/candidate/interview/instructions": "Interview Instructions",
  "/candidate/interview/consent": "Recording Consent",
  "/candidate/interview/equipment": "Equipment Check",
  "/candidate/interview/practice": "Practice Question",
  "/candidate/interview/complete": "Interview Submitted",
  "/candidate/interview/resume": "Resume Interview",
  "/candidate/status": "Interview Status",
};

/** Sets a descriptive browser-tab title for candidate pages (client pages cannot export metadata). */
export function usePageTitle(override?: string) {
  const pathname = usePathname();
  const title = override ?? PAGE_TITLES[pathname];
  useEffect(() => {
    if (title) document.title = `${title} · ${BRAND.name}`;
  }, [title]);
}

export function CandidateShell({ children, step, wide, className }: { children: React.ReactNode; step?: number; wide?: boolean; className?: string }) {
  const ready = useCandidateGate();
  usePageTitle();
  const [help, setHelp] = useState(false);
  const endSession = useDemoStore((s) => s.endSession);
  const router = useRouter();
  const auth = useAuth();

  return (
    <div className="app-backdrop relative min-h-dvh">
      <div className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <header className="relative z-20 border-b border-subtle bg-ink-950/60 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between gap-3">
          <AppLogo href="/candidate/interview" size="sm" />
          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isApiMode && <DemoBadge className="hidden sm:inline-flex" />}
            <ThemeToggle size="icon-sm" className="size-9" />
            <Button variant="ghost" size="sm" onClick={() => setHelp(true)}>
              <HelpCircle />
              <span className="hidden sm:inline">Help</span>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/candidate/status">Status</Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Sign out"
              onClick={() => {
                if (isApiMode) {
                  void auth.signOut().then(() => { toast.success("Signed out."); router.replace("/candidate/login"); });
                  return;
                }
                endSession("candidate");
                toast.success("Signed out of the demo.");
                router.push("/");
              }}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className={cn("container relative z-10 py-8 sm:py-12", wide ? "max-w-6xl" : "max-w-3xl", className)}>
        {step !== undefined && (
          <div className="mb-8 sm:mb-10">
            <FlowStepper current={step} />
          </div>
        )}
        {ready ? (
          <PageTransition>{children}</PageTransition>
        ) : (
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        )}
      </main>
      <footer className="relative z-10 flex justify-center pb-8"><PoweredByConnectivo size="sm" /></footer>
      <HelpDialog open={help} onOpenChange={setHelp} />
    </div>
  );
}
