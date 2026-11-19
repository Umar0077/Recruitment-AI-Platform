"use client";
/** Interview building blocks shared by the landing preview, practice, and live session. */
import { useEffect, useRef } from "react";
import { Check, Mic, MicOff, User, Video, VideoOff } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

export function AudioWaveform({ active, bars = 28, tone = "blue", className, levels }: { active: boolean; bars?: number; tone?: "blue" | "cyan"; className?: string; levels?: number }) {
  return (
    <div className={cn("flex h-10 items-center justify-center gap-[3px]", className)} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        const center = 1 - Math.abs(i - bars / 2) / (bars / 2);
        const base = 0.25 + center * 0.75;
        const live = levels !== undefined;
        return (
          <span
            key={i}
            className={cn("w-[3px] rounded-full", tone === "cyan" ? "bg-brand-cyan" : "bg-brand-electric", active && !live && "wave-bar")}
            style={{
              height: `${Math.round(base * 100)}%`,
              opacity: active ? 0.55 + center * 0.45 : 0.22,
              transform: live ? `scaleY(${Math.max(0.12, Math.min(1, levels! * (0.6 + center)))})` : active ? undefined : "scaleY(0.18)",
              animationDelay: `-${((i * 53) % 12) / 10}s`,
              animationDuration: `${0.9 + ((i * 7) % 6) / 10}s`,
              transition: "transform 90ms linear, opacity 300ms",
            }}
          />
        );
      })}
    </div>
  );
}

export function CameraPreview({
  stream,
  name,
  micOn = true,
  camOn = true,
  compact,
  label = "Camera preview",
  className,
  simulated,
}: {
  stream?: MediaStream | null;
  name?: string;
  micOn?: boolean;
  camOn?: boolean;
  compact?: boolean;
  label?: string;
  className?: string;
  simulated?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-subtle bg-gradient-to-b from-ink-800 to-ink-950", className)} aria-label={label} role="img">
      {stream && camOn ? (
        <video ref={ref} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(59,130,246,calc(0.18*var(--glow-k))),transparent_60%)]" />
          {camOn ? (
            <div className="relative flex flex-col items-center gap-2 text-fg-muted">
              <div className="grid size-16 place-items-center rounded-full border border-subtle bg-overlay/[0.04] sm:size-20">
                <User className="size-7 sm:size-9" aria-hidden />
              </div>
              {!compact && <span className="text-xs">{simulated ? "Camera preview (simulated)" : "Camera preview"}</span>}
            </div>
          ) : (
            <div className="relative flex flex-col items-center gap-2 text-fg-muted">
              <VideoOff className="size-7" aria-hidden />
              {!compact && <span className="text-xs">Camera is off</span>}
            </div>
          )}
        </div>
      )}
      {/* Frame corners */}
      {["left-3 top-3 border-l border-t", "right-3 top-3 border-r border-t", "bottom-3 left-3 border-b border-l", "bottom-3 right-3 border-b border-r"].map((p) => (
        <span key={p} className={cn("pointer-events-none absolute size-4 rounded-[3px] border-blue-300/50", p)} aria-hidden />
      ))}
      {name && (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <span className="truncate rounded-lg bg-ink-950/70 px-2 py-1 text-xs font-medium text-fg backdrop-blur">{name}</span>
          <span className="flex gap-1">
            <span className={cn("grid size-6 place-items-center rounded-md backdrop-blur", micOn ? "bg-ink-950/70 text-fg" : "bg-danger/80 text-white")} aria-label={micOn ? "Microphone on" : "Microphone off"}>
              {micOn ? <Mic className="size-3" /> : <MicOff className="size-3" />}
            </span>
            <span className={cn("grid size-6 place-items-center rounded-md backdrop-blur", camOn ? "bg-ink-950/70 text-fg" : "bg-danger/80 text-white")} aria-label={camOn ? "Camera on" : "Camera off"}>
              {camOn ? <Video className="size-3" /> : <VideoOff className="size-3" />}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

export function InterviewProgress({ total, current, completed, className }: { total: number; current: number; completed: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)} role="group" aria-label={`Question ${Math.min(current + 1, total)} of ${total}, ${completed} completed`}>
      {Array.from({ length: total }).map((_, i) => {
        const done = i < completed;
        const isCurrent = i === current && !done;
        return (
          <span key={i} className="flex items-center gap-1.5">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full border text-[11px] font-semibold transition-all duration-500 ease-premium",
                done ? "border-brand/60 bg-brand text-white" : isCurrent ? "border-brand-cyan text-brand-cyan shadow-[0_0_0_4px_rgba(56,189,248,0.12)]" : "border-subtle text-fg-disabled",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            {i < total - 1 && <span className={cn("h-px w-4 transition-colors duration-500 sm:w-7", i < completed ? "bg-brand/70" : "bg-overlay/10")} aria-hidden />}
          </span>
        );
      })}
    </div>
  );
}

/** Circular response timer with remaining seconds. */
export function ResponseTimer({ remaining, total, active, size = 64 }: { remaining: number; total: number; active: boolean; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const p = total ? remaining / total : 0;
  const low = remaining <= 10 && active;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="timer" aria-label={`${remaining} seconds remaining`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(148,163,184,0.15)" strokeWidth="3" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={low ? "#F59E0B" : "#38BDF8"}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 300ms" }}
        />
      </svg>
      <span className={cn("absolute font-display text-sm font-semibold tabular-nums", low ? "text-amber-700 dark:text-amber-300" : "text-fg")}>{formatDuration(remaining)}</span>
    </div>
  );
}
