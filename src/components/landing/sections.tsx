"use client";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  BatteryCharging,
  BookOpenCheck,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  FileCheck2,
  HandHelping,
  Headphones,
  LifeBuoy,
  ListChecks,
  Lock,
  MailOpen,
  MessageSquareText,
  Mic,
  MonitorSmartphone,
  ShieldCheck,
  SunMedium,
  UserRoundCheck,
  Users,
  VolumeX,
  Wifi,
} from "lucide-react";
import { PoweredByConnectivo } from "@/components/ui/powered-by";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/states";
import { Accordion, AccordionItem } from "@/components/ui/overlays";
import { AppLogo } from "@/components/ui/brand";
import { AudioWaveform, CameraPreview, InterviewProgress, ResponseTimer } from "@/components/interview/parts";
import { CoreFallback } from "@/components/visuals/core-fallback";
import { BRAND, INTERVIEW_CONFIG } from "@/lib/brand";
import { QUESTION_SETS } from "@/lib/demo/questions";
import { cn } from "@/lib/utils";

const AICore = dynamic(() => import("@/components/visuals/ai-core").then((m) => m.AICore), { ssr: false, loading: () => <CoreFallback /> });

/* ---------------- Trust strip ---------------- */
const TRUST = [
  { icon: ListChecks, title: "Structured assessment", body: "The same role-related questions for every candidate on your track." },
  { icon: BookOpenCheck, title: "Guided experience", body: "Clear steps, a practice question, and visible timing throughout." },
  { icon: FileCheck2, title: "Clear submission", body: "You receive confirmation as soon as your interview is submitted." },
  { icon: UserRoundCheck, title: "Recruiter review", body: "A member of the recruitment team reviews every interview." },
];

export function TrustStrip() {
  return (
    <section aria-label="About this interview" className="relative border-y border-subtle bg-ink-900/40">
      <div className="container grid grid-cols-1 divide-y divide-[rgba(148,163,184,0.1)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        {TRUST.map((t, i) => (
          <Reveal key={t.title} delay={i * 0.06} className={cn("flex gap-4 py-7 sm:px-6", i > 0 && "lg:border-l lg:border-subtle", i % 2 === 1 && "sm:border-l sm:border-subtle lg:border-l")}>
            <t.icon className="mt-0.5 size-5 shrink-0 text-brand-cyan" aria-hidden />
            <div>
              <h3 className="font-display text-[15px] font-semibold text-fg">{t.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{t.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------- How it works ---------------- */
const STEPS = [
  { n: "01", icon: MailOpen, title: "Access Your Invitation", body: "Open your interview invitation and review the assessment details.", detail: "Invitation link" },
  { n: "02", icon: Headphones, title: "Prepare Your Setup", body: "Check your camera, microphone, and internet connection.", detail: "Equipment check" },
  { n: "03", icon: MessageSquareText, title: "Complete Your Interview", body: "Answer guided, role-related questions at your own pace within the allowed time.", detail: `${INTERVIEW_CONFIG.questionsPerInterview} questions` },
  { n: "04", icon: CheckCircle2, title: "Submit Successfully", body: "Finish your assessment and receive confirmation that it has been submitted.", detail: "Confirmation" },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo("[data-line]", { scaleX: 0, scaleY: 0 }, { scaleX: 1, scaleY: 1, ease: "none", scrollTrigger: { trigger: ref.current, start: "top 75%", end: "bottom 60%", scrub: 0.6 } });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <section id="how-it-works" className="section-alt relative scroll-mt-24 py-24 sm:py-32">
      <div className="container">
        <Reveal>
          <SectionHeading eyebrow="How it works" title={<>Your Interview Journey, <span className="text-gradient">Made Simple.</span></>} description="Four clear steps from invitation to confirmation. You will always know where you are and what comes next." />
        </Reveal>
        <div ref={ref} className="relative mt-16">
          {/* Connecting line */}
          <div className="absolute left-[27px] top-0 h-full w-px bg-overlay/[0.06] lg:left-0 lg:top-[27px] lg:h-px lg:w-full" aria-hidden>
            <div data-line className="h-full w-full origin-top bg-gradient-to-b from-brand-electric via-brand-cyan to-indigo-400 lg:origin-left lg:bg-gradient-to-r" />
          </div>
          <ol className="relative grid gap-8 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08} className="relative">
                <li className="flex gap-5 lg:flex-col lg:gap-6">
                  <div className="relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl border border-glow/60 bg-ink-900 text-brand-cyan shadow-glow-sm">
                    <s.icon className="size-6" aria-hidden />
                  </div>
                  <div className="surface group flex-1 rounded-2xl p-6 transition-[border-color,transform] duration-300 ease-premium hover:-translate-y-0.5 hover:border-glow/60">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-brand-electric">Step {s.n}</span>
                      <span className="rounded-full border border-subtle px-2 py-0.5 text-[11px] text-fg-muted">{s.detail}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-fg">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.body}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Preparation ---------------- */
const PREP = [
  { icon: VolumeX, label: "Choose a quiet place" },
  { icon: Wifi, label: "Use a stable internet connection" },
  { icon: Mic, label: "Check microphone permissions" },
  { icon: Camera, label: "Check camera permissions" },
  { icon: SunMedium, label: "Ensure sufficient lighting" },
  { icon: BatteryCharging, label: "Keep your device charged" },
  { icon: Eye, label: "Read each question carefully" },
  { icon: MessageSquareText, label: "Answer clearly and naturally" },
  { icon: Clock, label: "Avoid unnecessary interruptions" },
  { icon: ShieldCheck, label: "Review consent information before beginning" },
];

export function Preparation() {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setDone((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const ready = done.size;

  return (
    <section id="preparation" className="section-alt relative scroll-mt-24 py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(800px_500px_at_80%_50%,rgba(37,99,235,calc(0.12*var(--glow-k))),transparent_60%)]" aria-hidden />
      <div className="container grid items-start gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <Reveal>
          <SectionHeading align="left" eyebrow="Preparation" title={<>Set Yourself Up for a <span className="text-gradient">Great Interview.</span></>} description="A few minutes of preparation helps you focus on your answers. Tick items off as you go — this checklist stays on your device and is just for you." />
          <ul className="mt-10 grid gap-2 sm:grid-cols-2">
            {PREP.map((p, i) => {
              const on = done.has(i);
              return (
                <li key={p.label}>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-[background-color,border-color,color] duration-200",
                      on ? "border-brand/50 bg-brand/[0.12] text-fg" : "border-subtle bg-overlay/[0.02] text-fg-secondary hover:border-slate-400/30 hover:bg-overlay/[0.04]",
                    )}
                  >
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg transition-colors", on ? "bg-brand text-white" : "bg-overlay/[0.05] text-brand-cyan")}>
                      {on ? <CheckCircle2 className="size-4" aria-hidden /> : <p.icon className="size-4" aria-hidden />}
                    </span>
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="lg:sticky lg:top-28">
          <div className="surface-solid edge-light rounded-3xl p-4 shadow-float sm:p-5">
            <div className="flex items-center justify-between px-1 pb-4">
              <div>
                <p className="text-sm font-semibold text-fg">Equipment preview</p>
                <p className="text-xs text-fg-muted">Illustration — no devices are accessed on this page</p>
              </div>
              <span className="rounded-full border border-subtle px-2.5 py-1 text-[11px] text-fg-muted">Preview</span>
            </div>
            <CameraPreview className="aspect-video" name="You" simulated />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-subtle bg-overlay/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-fg-secondary"><Mic className="size-3.5 text-brand-cyan" aria-hidden />Microphone</span>
                  <span className="text-fg-muted">Checked during setup</span>
                </div>
                <AudioWaveform active={false} bars={24} className="mt-2 h-7" />
              </div>
              <div className="rounded-xl border border-subtle bg-overlay/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-fg-secondary"><Wifi className="size-3.5 text-brand-cyan" aria-hidden />Connection</span>
                  <span className="text-fg-muted">Checked during setup</span>
                </div>
                <div className="mt-3 flex items-end gap-1" aria-hidden>
                  {[30, 50, 70, 90].map((h) => <span key={h} className="w-2 rounded-sm bg-overlay/10" style={{ height: h / 4 }} />)}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-subtle bg-overlay/[0.02] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-fg">Your preparation</span>
                <span className="tabular-nums text-fg-muted" aria-live="polite">{ready} of {PREP.length} ready</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-overlay/[0.07]">
                <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-cyan transition-[width] duration-500 ease-premium" style={{ width: `${(ready / PREP.length) * 100}%` }} />
              </div>
              <p className="mt-3 text-xs text-fg-muted">{ready === PREP.length ? "You're all set. Your devices will be checked properly before the interview begins." : "Your camera and microphone are checked for real in the equipment step, after you give consent."}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Interview preview ---------------- */
export function InterviewPreview() {
  return (
    <section id="interview-process" className="relative scroll-mt-24 py-24 sm:py-32">
      <div className="container">
        <Reveal>
          <SectionHeading eyebrow="Interview process" title={<>Know What to <span className="text-gradient">Expect.</span></>} description="One question at a time, a visible timer, and clear signals for when it's your turn to speak. Here is what the interview screen looks like." />
        </Reveal>
        <Reveal delay={0.1} className="relative mx-auto mt-14 max-w-5xl">
          <div className="pointer-events-none absolute -inset-x-10 -inset-y-8 -z-10 rounded-[48px] bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,calc(0.25*var(--glow-k))),transparent_65%)]" aria-hidden />
          <div className="surface-solid edge-light overflow-hidden rounded-hero shadow-float">
            {/* Window header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-200">Interview Interface Preview</span>
                <span className="hidden text-xs text-fg-muted sm:inline">Customer Sales Representative</span>
              </div>
              <InterviewProgress total={4} current={0} completed={0} />
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-[1.25fr_1fr] md:p-7">
              <div className="flex flex-col">
                <div className="relative mx-auto w-full max-w-[260px]">
                  <AICore state="speaking" particles={false} label="AI interviewer visual, speaking" />
                </div>
                <div className="mt-2 flex items-center justify-center gap-2 text-xs font-medium text-brand-cyan">
                  <span className="size-1.5 rounded-full bg-brand-cyan" aria-hidden /> AI Speaking
                </div>
                <div className="mt-5 rounded-2xl border border-subtle bg-overlay/[0.03] p-5">
                  <div className="flex items-center justify-between text-xs text-fg-muted">
                    <span>Question 01 of 04 · {QUESTION_SETS.fresher[0]!.category}</span>
                  </div>
                  <p className="mt-3 font-display text-lg font-semibold leading-snug text-fg sm:text-xl">&ldquo;{QUESTION_SETS.fresher[0]!.text}&rdquo;</p>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <CameraPreview className="aspect-[4/3]" name="Candidate" simulated />
                <div className="flex items-center gap-4 rounded-2xl border border-subtle bg-overlay/[0.03] p-4">
                  <ResponseTimer remaining={90} total={90} active={false} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">Response time</p>
                    <p className="text-xs text-fg-muted">Starts when the AI finishes asking</p>
                    <AudioWaveform active={false} bars={22} className="mt-1 h-6 justify-start" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="flex items-center gap-2 rounded-xl border border-subtle px-3 py-2.5 text-fg-secondary"><Mic className="size-3.5 text-success" aria-hidden />Microphone ready</span>
                  <span className="flex items-center gap-2 rounded-xl border border-subtle px-3 py-2.5 text-fg-secondary"><Wifi className="size-3.5 text-success" aria-hidden />Connection stable</span>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-fg-muted">Preview only. Nothing on this page uses your camera or microphone.</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Privacy ---------------- */
const PRIVACY = [
  { icon: Camera, title: "What may be captured", body: "Your spoken answers and video during the interview, plus the time taken for each response." },
  { icon: ClipboardCheck, title: "Why it's collected", body: "To assess your application for this specific role using the same questions for every candidate." },
  { icon: Users, title: "Who reviews it", body: "Authorised members of the recruitment team. AI provides a summary; people make the decisions." },
  { icon: Lock, title: "Your permission first", body: "You will be asked for consent before anything is recorded, and separately for device permissions." },
];

export function Privacy() {
  return (
    <section id="privacy" className="relative scroll-mt-24 py-24 sm:py-32">
      <div className="container">
        <div className="surface relative overflow-hidden rounded-3xl p-7 sm:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand/20 blur-3xl" aria-hidden />
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <Reveal>
              <SectionHeading align="left" eyebrow="Privacy & consent" title={<>Your Interview. <span className="text-gradient">Your Information.</span></>} />
              <p className="mt-5 text-[15px] leading-relaxed text-fg-muted">
                Before any real recording begins, you will see exactly what is captured and be asked to agree. If you have questions, or need help, the recruitment team is available.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button variant="secondary" asChild>
                  <a href={BRAND.privacyNoticeUrl}>Read the Privacy Notice</a>
                </Button>
                <Button variant="ghost" asChild>
                  <a href={`mailto:${BRAND.supportEmail}`}><HandHelping />Request assistance</a>
                </Button>
              </div>
              <p className="mt-6 rounded-xl border border-indigo-400/20 bg-indigo-400/[0.06] p-3 text-xs leading-relaxed text-indigo-700 dark:text-indigo-100">
                UI preview: this prototype does not send any candidate information to a production service. The privacy notice link is a placeholder for the approved notice.
              </p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              {PRIVACY.map((p, i) => (
                <Reveal key={p.title} delay={i * 0.06}>
                  <div className="h-full rounded-2xl border border-subtle bg-ink-950/40 p-5">
                    <p.icon className="size-5 text-brand-cyan" aria-hidden />
                    <h3 className="mt-4 font-display text-base font-semibold text-fg">{p.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{p.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */
const FAQS = [
  ["How long does the AI interview take?", `The interview takes ${INTERVIEW_CONFIG.durationLabel.toLowerCase()}, including a short practice question. Each answer has its own visible timer.`],
  ["Do I need a camera and microphone?", "Yes. You'll check both in the equipment step before starting. If you can't use a camera or microphone, contact the recruitment team about an alternative assessment."],
  ["Can I complete the interview on mobile?", "Yes. The interview works on modern mobile browsers. A laptop or desktop in a quiet room usually gives the most comfortable experience."],
  ["What if my internet disconnects?", "Your progress on completed questions is kept. Reconnect and sign in again to continue from where you left off, as long as your invitation is still open."],
  ["Can I return to an unfinished interview?", `You can resume an unfinished interview while your invitation window is open (currently ${INTERVIEW_CONFIG.completionWindowHours} hours from your invitation). Availability depends on your invitation.`],
  ["Who will review my interview?", "Authorised members of the recruitment team review every submitted interview, along with your application."],
  ["Is the interview automatically evaluated?", "AI helps summarise your answers against job-related criteria. It supports the review — it does not make hiring decisions. A recruiter always reviews your interview."],
  ["What happens after submission?", "You'll see a confirmation with a reference number. The recruitment team reviews your interview and contacts you about next steps. You can check your status any time."],
  ["What if I have a technical or accessibility issue?", "Use the Help button during the interview, or contact the support team. Let us know about any accessibility needs and we will work with you."],
  ["Can I request an alternative assessment?", "Yes. If a video interview isn't suitable for you, contact the recruitment team before starting to discuss an alternative."],
] as const;

export function FAQ() {
  return (
    <section id="faqs" className="section-alt relative scroll-mt-24 py-24 sm:py-32">
      <div className="container grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <SectionHeading align="left" eyebrow="FAQs" title="Questions, Answered." description="Everything you need to know before you begin. Still unsure? The recruitment team is happy to help." />
          <Button variant="secondary" className="mt-8" asChild>
            <a href={`mailto:${BRAND.supportEmail}`}><LifeBuoy />Contact support</a>
          </Button>
        </Reveal>
        <Reveal delay={0.08}>
          <Accordion type="single" collapsible defaultValue="q0" className="surface rounded-2xl px-6">
            {FAQS.map(([q, a], i) => (
              <AccordionItem key={q} value={`q${i}`} question={q}>
                {a}
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Final CTA ---------------- */
export function FinalCTA() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="container">
        <Reveal>
          <div className="surface-solid edge-light relative isolate overflow-hidden rounded-hero px-6 py-16 text-center sm:px-12 sm:py-24">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(600px_320px_at_50%_100%,rgba(37,99,235,calc(0.45*var(--glow-k))),transparent_70%)]" aria-hidden />
            <div className="bg-grid bg-grid-fade absolute inset-0 -z-10 opacity-60" aria-hidden />
            <div className="mx-auto mb-8 w-28 sm:w-36" aria-hidden>
              <AICore state="idle" particles={false} label="AI core" />
            </div>
            <h2 className="mx-auto max-w-2xl text-[34px] font-bold leading-[1.1] text-fg sm:text-5xl">Ready to Take the Next Step?</h2>
            <p className="mx-auto mt-4 max-w-md text-base text-fg-muted sm:text-lg">Your opportunity begins with showing us what you can do.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="xl" asChild className="group">
                <Link href="/candidate/login">Begin Interview<ArrowRight className="transition-transform group-hover:translate-x-0.5" /></Link>
              </Button>
              <Button size="xl" variant="secondary" asChild>
                <a href="#preparation">Review Instructions</a>
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */
export function Footer() {
  return (
    <footer className="border-t border-subtle">
      <div className="container flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <AppLogo descriptor />
          <p className="mt-4 text-sm leading-relaxed text-fg-muted">An invitation-based AI interview platform. {BRAND.tagline}</p>
          <PoweredByConnectivo size="footer" className="mt-6" />
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
          <a href="#preparation" className="text-fg-secondary hover:text-fg">Interview Instructions</a>
          <a href={BRAND.privacyNoticeUrl} className="text-fg-secondary hover:text-fg">Privacy Notice</a>
          <a href={`mailto:${BRAND.supportEmail}`} className="text-fg-secondary hover:text-fg">Help & Support</a>
          <Link href="/candidate/login" className="text-fg-secondary hover:text-fg">Candidate Login</Link>
          <Link href="/admin/login" className="text-fg-muted hover:text-fg">Recruiter access</Link>
        </nav>
      </div>
      <div className="border-t border-subtle">
        <div className="container flex flex-col gap-2 py-5 text-xs text-fg-disabled sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {BRAND.copyrightHolder}. All rights reserved.</span>
          <span className="flex items-center gap-1.5"><MonitorSmartphone className="size-3.5" aria-hidden />Interactive UI preview — no production data</span>
        </div>
      </div>
    </footer>
  );
}
