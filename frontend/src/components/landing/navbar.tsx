"use client";
import { useEffect, useRef, useState } from "react";
import Link from "@/components/navigation/link";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { AppLogo } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { usePrefersReducedMotion } from "@/hooks/use-demo";
import { SPRING, DURATION } from "@/components/motion";
import { cn } from "@/lib/utils";

export const LANDING_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "how-it-works", label: "How It Works" },
  { id: "interview-process", label: "Interview Process" },
  { id: "preparation", label: "Preparation" },
  { id: "faqs", label: "FAQs" },
];
export function GlassNavbar() {
  const [active, setActive] = useState("overview");
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    let previous = false;
    const scroll = () => {
      const next = window.scrollY > 24;
      if (next !== previous) { header.current?.toggleAttribute("data-scrolled", next); previous = next; }
    };
    scroll(); window.addEventListener("scroll", scroll, { passive: true });
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-25% 0px -65% 0px", threshold: 0 });
    LANDING_SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    const media = window.matchMedia("(min-width: 1280px)");
    const resize = () => { if (media.matches) setOpen(false); };
    media.addEventListener("change", resize);
    return () => { window.removeEventListener("scroll", scroll); io.disconnect(); media.removeEventListener("change", resize); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); toggle.current?.focus(); }
      if (e.key === "Tab") {
        const items = [...(header.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? [])].filter(el => el.tabIndex >= 0 && el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", key); };
  }, [open]);
  const navigate = (id: string) => { setActive(id); setOpen(false); };
  return <header ref={header} data-open={open || undefined} className="glass-header fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-5">
    {open && <button className="fixed inset-0 -z-10 bg-scrim/20 xl:hidden" aria-label="Dismiss navigation" tabIndex={-1} onClick={() => setOpen(false)} />}
    <nav data-pointer-surface aria-label="Primary" className="liquid-nav relative mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 rounded-[22px] pl-4 pr-2 sm:pl-6">
      <AppLogo size="sm" />
      <ul className="hidden items-center gap-0.5 xl:flex" onMouseLeave={() => setHovered(null)}>
        {LANDING_SECTIONS.map(s => <li key={s.id} className="relative">
          <a href={`#${s.id}`} onClick={() => navigate(s.id)} onMouseEnter={() => setHovered(s.id)} aria-current={active === s.id ? "location" : undefined} className={cn("relative isolate block rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-colors", active === s.id ? "text-fg" : "text-fg-secondary hover:text-fg")}>
            {active === s.id && <motion.span layoutId="landing-active-pill" className="nav-glass-pill absolute inset-0 -z-10 rounded-xl" transition={reduce ? { duration: 0 } : SPRING.navigation} aria-hidden />}
            {hovered === s.id && active !== s.id && <motion.span layoutId="landing-hover-pill" className="absolute inset-0 -z-10 rounded-xl bg-overlay/[0.04] ring-1 ring-inset ring-overlay/[0.035]" transition={reduce ? { duration: 0 } : SPRING.navigation} aria-hidden />}
            {s.label}
          </a>
        </li>)}
      </ul>
      <div className="hidden items-center gap-2 xl:flex"><ThemeToggle size="icon-sm" className="size-10" /><Button variant="ghost" size="sm" className="h-10" asChild><Link href="/candidate/login">Candidate Login</Link></Button><Button size="md" asChild><Link href="/candidate/login">Start Interview</Link></Button></div>
      <div className="flex items-center gap-1 xl:hidden"><ThemeToggle /><button ref={toggle} className="grid size-11 place-items-center rounded-xl text-fg-secondary hover:bg-overlay/5" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"}>{open ? <X className="size-5" /> : <Menu className="size-5" />}</button></div>
    </nav>
    <AnimatePresence>
      {open && <motion.div id="mobile-nav" initial={reduce ? false : { opacity: 0, y: -8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: DURATION.dropdown }} className="liquid-nav mx-auto mt-3 max-h-[calc(100dvh-108px)] max-w-7xl overflow-y-auto rounded-[22px] p-3 xl:hidden">
        <ul>{LANDING_SECTIONS.map(s => <li key={s.id}><a href={`#${s.id}`} onClick={() => navigate(s.id)} aria-current={active === s.id ? "location" : undefined} className={cn("block rounded-xl px-4 py-3.5 text-[15px]", active === s.id ? "bg-accent-soft text-brand" : "text-fg-secondary")}>{s.label}</a></li>)}</ul>
        <div className="mt-3 grid gap-2 border-t border-subtle pt-3 min-[390px]:grid-cols-2"><Button variant="secondary" asChild><Link href="/candidate/login" onClick={() => setOpen(false)}>Candidate Login</Link></Button><Button asChild><Link href="/candidate/login" onClick={() => setOpen(false)}>Start Interview</Link></Button></div>
      </motion.div>}
    </AnimatePresence>
  </header>;
}
