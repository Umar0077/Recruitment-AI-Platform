"use client";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Mail, PlayCircle } from "lucide-react";
import { PoweredByConnectivo } from "@/components/ui/powered-by";
import gsap from "gsap";
import { Button } from "@/components/ui/button";
import { INTERVIEW_CONFIG } from "@/lib/brand";
import { LandingOrb } from "./landing-orb";
import { HeroAtmosphere } from "./hero-atmosphere";
import { usePrefersReducedMotion } from "@/hooks/use-demo";


export function Hero() {
  const root = useRef<HTMLElement>(null);
  const [excited, setExcited] = useState(false);
  const reduce = usePrefersReducedMotion();

  useLayoutEffect(() => {
    if (reduce) return;
    let safety = 0;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from("[data-hero=glow]", { opacity: 0, duration: 0.65 })
        .from("[data-hero=eyebrow]", { y: 8, opacity: 0, duration: 0.4 }, 0)
        .from("[data-hero=line]", { yPercent: 22, opacity: 0, duration: 0.6, stagger: 0.06 }, 0.08)
        .from("[data-hero=copy]", { y: 10, opacity: 0, duration: 0.5 }, 0.16)
        .from("[data-hero=cta] > *", { y: 8, opacity: 0, duration: 0.45, stagger: 0.05 }, 0.24)
        .from("[data-hero=micro] > *", { opacity: 0, duration: 0.45, stagger: 0.04 }, 0.3)
        .from("[data-hero=core]", { scale: 0.97, opacity: 0, duration: 0.65 }, 0.12);
      // Content must never stay hidden: finish immediately in background tabs, or if frames stall.
      if (document.hidden) tl.progress(1);
      safety = window.setTimeout(() => tl.progress(1), 2600);
    }, root);
    return () => { window.clearTimeout(safety); ctx.revert(); };
  }, [reduce]);

  return (
    <section ref={root} id="overview" className="relative isolate overflow-hidden pb-12 pt-32 sm:pb-16 sm:pt-40 lg:pb-24 lg:pt-44">
      {/* Background lighting */}
      <div data-hero="glow" className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <HeroAtmosphere />
        <div className="hero-grid bg-grid bg-grid-fade absolute inset-0 opacity-40" />
        <div className="bg-noise absolute inset-0" />
        {/* Horizon */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-glow to-transparent" />
      </div>

      <div className="container grid items-center gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-12 xl:gap-16">
        <div className="relative z-10 min-w-0 max-w-[660px]">
          <p data-hero="eyebrow" className="eyebrow mb-7 inline-flex items-center gap-2.5 rounded-full border border-subtle bg-ink-900/70 px-3 py-2 !tracking-[0.14em]">
            <span className="relative flex size-1.5">
              <span className="relative inline-flex size-1.5 rounded-full bg-brand-cyan" />
            </span>
            The next generation of interviews
          </p>
          <h1 className="hero-heading font-extrabold text-fg">
            <span className="block overflow-hidden pb-1"><span data-hero="line" className="block">Your Next</span></span>
            <span className="block overflow-hidden pb-1"><span data-hero="line" className="block">Opportunity Starts</span></span>
            <span className="block overflow-hidden pb-2">
              <span data-hero="line" className="block">
                With a <span className="text-gradient">Conversation.</span>
              </span>
            </span>
          </h1>
          <p data-hero="copy" className="mt-6 max-w-[490px] text-[15px] leading-[1.8] text-fg-secondary sm:text-[17px]">
            Welcome to a more structured, convenient interview experience. Complete your AI-assisted assessment, share your skills, and take the next step in your recruitment journey.
          </p>
          <div data-hero="cta" className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="xl" asChild data-magnetic data-pointer-surface className="group landing-cta" onMouseEnter={() => setExcited(true)} onMouseLeave={() => setExcited(false)} onFocus={() => setExcited(true)} onBlur={() => setExcited(false)}>
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
          <ul data-hero="micro" className="mt-7 flex flex-col gap-2.5 text-[12px] text-fg-muted sm:flex-row sm:flex-wrap sm:gap-x-6">
            <li className="flex items-center gap-2"><Mail className="size-4 text-brand-electric" aria-hidden />An invitation-based interview experience.</li>
            <li className="flex items-center gap-2"><Clock className="size-4 text-brand-electric" aria-hidden />{INTERVIEW_CONFIG.durationLabel}, in a quiet, comfortable space.</li>
          </ul>
          <PoweredByConnectivo size="sm" className="mt-8" />
        </div>

        <div data-hero="core" className="hero-stage relative mx-auto w-full max-w-[300px] sm:max-w-[420px] lg:max-w-[490px]">
          <LandingOrb parallax excited={excited} />
          {/* Floating status chips */}
          <div className="surface-solid absolute -left-2 -top-3 hidden items-center gap-2.5 rounded-xl px-3.5 py-3 text-xs shadow-glass sm:flex">
            <span className="grid size-7 place-items-center rounded-lg bg-brand/20 text-brand-cyan">
              <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden><path d="M3 8h1.5M6 5v6M9 3v10M12 6v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
            </span>
            <span><span className="block font-medium text-fg">Guided questions</span><span className="text-fg-muted">One at a time, clearly timed</span></span>
          </div>
          <div className="surface-solid absolute -right-1 bottom-[8%] hidden items-center gap-2.5 rounded-xl px-3.5 py-3 text-xs shadow-glass sm:flex">
            <span className="size-2 rounded-full bg-success ring-4 ring-success/10" aria-hidden />
            <span><span className="block font-medium text-fg">Reviewed by people</span><span className="text-fg-muted">Recruiters make every decision</span></span>
          </div>
        </div>
      </div>
    </section>
  );
}
