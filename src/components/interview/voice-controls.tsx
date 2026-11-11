"use client";
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Live input meter driven by requestAnimationFrame and direct DOM writes,
 * so audio frames never trigger React re-renders.
 */
export function LiveLevelMeter({ getLevel, active, bars = 32, className, tone = "cyan" }: { getLevel: () => number; active: boolean; bars?: number; className?: string; tone?: "cyan" | "blue" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.children) as HTMLElement[];
    if (!active) {
      spans.forEach((s) => (s.style.transform = "scaleY(0.12)"));
      return;
    }
    let raf = 0;
    const smoothed = new Array(spans.length).fill(0.12);
    const draw = () => {
      const level = getLevel();
      spans.forEach((s, i) => {
        const center = 1 - Math.abs(i - spans.length / 2) / (spans.length / 2);
        const jitter = 0.75 + 0.25 * Math.sin(performance.now() / 120 + i * 1.7);
        const target = Math.max(0.12, Math.min(1, level * (0.55 + center * 0.9) * jitter));
        smoothed[i] = smoothed[i] + (target - smoothed[i]) * 0.35;
        s.style.transform = `scaleY(${smoothed[i].toFixed(3)})`;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active, getLevel]);
  return (
    <div ref={ref} className={cn("flex h-10 items-center justify-center gap-[3px]", className)} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} className={cn("h-full w-[3px] origin-center rounded-full transition-colors", tone === "cyan" ? "bg-brand-cyan" : "bg-brand-electric", active ? "opacity-90" : "opacity-25")} style={{ transform: "scaleY(0.12)" }} />
      ))}
    </div>
  );
}

export type MicButtonState = "idle" | "initializing" | "listening" | "processing" | "captured" | "disabled";

const MIC_LABEL: Record<MicButtonState, string> = {
  idle: "Click to Answer",
  initializing: "Starting microphone…",
  listening: "Listening — click to stop",
  processing: "Processing Speech",
  captured: "Answer Captured",
  disabled: "Wait for the question",
};

export function MicButton({ state, onClick, size = "lg" }: { state: MicButtonState; onClick: () => void; size?: "md" | "lg" }) {
  const reduce = useReducedMotion();
  const listening = state === "listening";
  const busy = state === "initializing" || state === "processing";
  const dim = size === "lg" ? "size-20" : "size-16";
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative grid place-items-center">
        {listening && !reduce && (
          <>
            <motion.span className={cn("absolute rounded-full border-2 border-brand/40", dim)} initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 1.45, opacity: 0 }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} aria-hidden />
            <motion.span className={cn("absolute rounded-full border border-brand/30", dim)} initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.25, opacity: 0 }} transition={{ duration: 1.8, delay: 0.6, repeat: Infinity, ease: "easeOut" }} aria-hidden />
          </>
        )}
        <button
          type="button"
          onClick={onClick}
          disabled={state === "disabled" || busy}
          aria-pressed={listening}
          aria-label={listening ? "Stop recording answer" : state === "captured" ? "Record answer again" : "Start recording answer"}
          className={cn(
            "relative grid place-items-center rounded-full border transition-[background-color,border-color,box-shadow,transform] duration-200 ease-premium focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 active:scale-95 disabled:cursor-not-allowed",
            dim,
            listening
              ? "border-brand bg-brand text-white shadow-[0_12px_32px_-10px_rgba(37,99,235,0.7)]"
              : state === "captured"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                : state === "disabled"
                  ? "border-subtle bg-overlay/[0.03] text-fg-disabled"
                  : "border-subtle bg-white text-fg shadow-glass hover:border-brand/50 hover:text-brand dark:bg-overlay/[0.06] dark:hover:text-brand-cyan",
          )}
        >
          {busy ? <Loader2 className="size-7 animate-spin" aria-hidden /> : listening ? <Square className="size-6 fill-current" aria-hidden /> : state === "captured" ? <Check className="size-7" aria-hidden /> : <Mic className="size-7" aria-hidden />}
        </button>
      </div>
      <span className={cn("text-xs font-medium", listening ? "text-brand" : state === "captured" ? "text-emerald-600 dark:text-emerald-300" : "text-fg-muted")} aria-live="polite">
        {MIC_LABEL[state]}
      </span>
    </div>
  );
}
