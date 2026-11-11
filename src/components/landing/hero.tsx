"use client";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Clock, Mail, PlayCircle } from "lucide-react";
import { PoweredByConnectivo } from "@/components/ui/powered-by";
import gsap from "gsap";
import { Button } from "@/components/ui/button";
import { INTERVIEW_CONFIG } from "@/lib/brand";
import { CoreFallback } from "@/components/visuals/core-fallback";

// The core is decorative and client-only; a static fallback renders immediately.
const AICore = dynamic(() => import("@/components/visuals/ai-core").then((m) => m.AICore), { ssr: false, loading: () => <CoreFallback /> });

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const [ctaHover, setCtaHover] = useState(false);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let safety = 0;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from("[data-hero=glow]", { opacity: 0, duration: 1.2 })
        .from("[data-hero=eyebrow]", { y: 12, opacity: 0, duration: 0.5 }, 0.2)
        .from("[data-hero=line]", { yPercent: 60, opacity: 0, duration: 0.8, stagger: 0.09 }, 0.28)
        .from("[data-hero=copy]", { y: 14, opacity: 0, duration: 0.6 }, 0.55)
        .from("[data-hero=cta] > *", { y: 12, opacity: 0, duration: 0.5, stagger: 0.07 }, 0.68)
        .from("[data-hero=micro] > *", { opacity: 0, duration: 0.5, stagger: 0.06 }, 0.82)
        .from("[data-hero=core]", { scale: 0.92, opacity: 0, duration: 1.4, ease: "expo.out" }, 0.35);
      // Content must never stay hidden: finish immediately in background tabs, or if frames stall.
      if (document.hidden) tl.progress(1);
      safety = window.setTimeout(() => tl.progress(1), 2600);
    }, root);
    return () => { window.clearTimeout(safety); ctx.revert(); };
  }, []);

  return (
    <section ref={root} id="overview" className="relative isolate overflow-hidden pb-16 pt-28 sm:pt-32 lg:pb-24 lg:pt-36">
      {/* Background lighting */}
      <div data-hero="glow" className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(1100px_620px_at_72%_30%,rgba(37,99,235,calc(0.28*var(--glow-k))),transparent_62%),radial-gradient(700px_420px_at_10%_10%,rgba(129,140,248,calc(0.12*var(--glow-k))),transparent_60%)]" />
        <div className="bg-grid bg-grid-fade absolute inset-0 opacity-70" />
        <div className="bg-noise absolute inset-0" />
        {/* Horizon */}
        <div className="absolute inset-x-0 bottom-[8%] h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />
        <div className="absolute bottom-[-18%] left-1/2 h-[44%] w-[130%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center_top,rgba(37,99,235,calc(0.30*var(--glow-k))),transparent_65%)]" />
      </div>

      <div className="container grid items-center gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-6">
        <div className="relative z-10 max-w-[680px]">
          <p data-hero="eyebrow" className="eyebrow mb-6 inline-flex items-center gap-2 rounded-full border border-glow/40 bg-brand/10 px-3 py-1.5">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-cyan opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand-cyan" />
            </span>
            The next generation of interviews
          </p>
          <h1 className="text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] text-fg sm:text-[56px] lg:text-[60px] xl:text-[68px]">
            <span className="block overflow-hidden pb-1"><span data-hero="line" className="block">Your Next</span></span>
            <span className="block overflow-hidden pb-1"><span data-hero="line" className="block">Opportunity Starts</span></span>
            <span className="block overflow-hidden pb-2">
              <span data-hero="line" className="block">
                With a <span className="text-gradient">Conversation.</span>
              </span>
            </span>
          </h1>
          <p data-hero="copy" className="mt-6 max-w-[540px] text-base leading-relaxed text-fg-secondary sm:text-lg">
            Welcome to a more structured, convenient interview experience. Complete your AI-assisted assessment, share your skills, and take the next step in your recruitment journey.
          </p>
          <div data-hero="cta" className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="xl" asChild onMouseEnter={() => setCtaHover(true)} onMouseLeave={() => setCtaHover(false)} onFocus={() => setCtaHover(true)} onBlur={() => setCtaHover(false)} className="group">
              <Link href="/candidate/login">
                Start Your Interview
                <ArrowRight className="transition-transform duration-300 ease-premium group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button size="xl" variant="secondary" asChild>
              <a href="#how-it-works">
                <PlayCircle className="text-brand-cyan" />
                How It Works
              </a>
            </Button>
          </div>
          <ul data-hero="micro" className="mt-9 flex flex-col gap-2.5 text-[13px] text-fg-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
            <li className="flex items-center gap-2"><Mail className="size-4 text-brand-electric" aria-hidden />An invitation-based interview experience.</li>
            <li className="flex items-center gap-2"><Clock className="size-4 text-brand-electric" aria-hidden />{INTERVIEW_CONFIG.durationLabel}, in a quiet, comfortable space.</li>
          </ul>
          <PoweredByConnectivo size="sm" className="mt-8" />
        </div>

        <div data-hero="core" className="relative mx-auto w-full max-w-[340px] sm:max-w-[460px] lg:max-w-[600px]">
          <AICore state={ctaHover ? "speaking" : "idle"} excited={ctaHover} parallax label="InterviewOS AI Intelligence Core" />
          {/* Floating status chips */}
          <div className="surface-solid absolute -left-2 top-[16%] hidden items-center gap-2.5 rounded-xl px-3 py-2 text-xs shadow-float backdrop-blur sm:flex lg:-left-6">
            <span className="grid size-7 place-items-center rounded-lg bg-brand/20 text-brand-cyan">
              <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden><path d="M3 8h1.5M6 5v6M9 3v10M12 6v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
            </span>
            <span><span className="block font-medium text-fg">Guided questions</span><span className="text-fg-muted">One at a time, clearly timed</span></span>
          </div>
          <div className="surface-solid absolute -right-1 bottom-[18%] hidden items-center gap-2.5 rounded-xl px-3 py-2 text-xs shadow-float sm:flex lg:-right-4">
            <span className="size-2 rounded-full bg-success shadow-[0_0_10px_rgba(16,185,129,0.8)]" aria-hidden />
            <span><span className="block font-medium text-fg">Reviewed by people</span><span className="text-fg-muted">Recruiters make every decision</span></span>
          </div>
        </div>
      </div>
    </section>
  );
}
