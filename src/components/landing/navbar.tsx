"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AppLogo } from "@/components/ui/brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

export const LANDING_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "how-it-works", label: "How It Works" },
  { id: "interview-process", label: "Interview Process" },
  { id: "preparation", label: "Preparation" },
  { id: "faqs", label: "FAQs" },
];

export function GlassNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("overview");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    LANDING_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header className="animate-fade-in fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <nav
        aria-label="Primary"
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 rounded-2xl border pl-4 pr-2 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-500 ease-premium sm:h-[60px] sm:pl-5",
          scrolled || open
            ? "border-subtle bg-ink-900/75 shadow-float backdrop-blur-xl"
            : "border-overlay/[0.06] bg-overlay/[0.02] backdrop-blur-md",
        )}
      >
        <AppLogo descriptor size="sm" />
        <ul className="hidden items-center gap-1 lg:flex">
          {LANDING_SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? "true" : undefined}
                className={cn(
                  "relative rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-micro",
                  active === s.id ? "text-fg" : "text-fg-muted hover:text-fg",
                )}
              >
                {s.label}
                <span
                  className={cn(
                    "absolute inset-x-3 -bottom-px h-px rounded-full bg-gradient-to-r from-transparent via-brand-cyan to-transparent transition-opacity duration-300",
                    active === s.id ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-1.5 lg:flex">
          <ThemeToggle size="icon-sm" className="size-9" />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/candidate/login">Candidate Login</Link>
          </Button>
          <Button size="sm" asChild className="h-9 px-4">
            <Link href="/candidate/login">Start Interview</Link>
          </Button>
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
        <button
          className="grid size-10 place-items-center rounded-xl text-fg-secondary hover:bg-overlay/5"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-nav" className="surface-solid mx-auto mt-2 max-w-6xl animate-pop-in rounded-2xl p-3 lg:hidden">
          <ul className="flex flex-col">
            {LANDING_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} onClick={() => setOpen(false)} className={cn("block rounded-xl px-4 py-3 text-[15px]", active === s.id ? "bg-overlay/[0.05] text-fg" : "text-fg-secondary")}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-subtle pt-3">
            <Button variant="secondary" asChild>
              <Link href="/candidate/login">Candidate Login</Link>
            </Button>
            <Button asChild>
              <Link href="/candidate/login">Start Interview</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
