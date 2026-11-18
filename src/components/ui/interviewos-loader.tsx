import { BrandMark } from "./brand";
import { cn } from "@/lib/utils";

/** Small, CSS-animated official mark; occupies only its contextual slot. */
export function InterviewOSInlineLoader({ variant = "inline", message = "Loading…", className }: {
  variant?: "button" | "inline" | "section" | "table" | "route";
  message?: string;
  className?: string;
}) {
  return <InterviewOSLoader variant={variant === "button" ? "button" : "inline"} size="sm" message={message} className={className} />;
}

/** Only mount during a genuine pending operation. No timers, capture effects or artificial delay. */
export function InterviewOSLoader({ variant = "page", size = "md", message = "Preparing your experience…", fullscreen = false, inline = false, className }: {
  variant?: "page" | "inline" | "button" | "modal";
  size?: "sm" | "md" | "lg";
  message?: string;
  fullscreen?: boolean;
  inline?: boolean;
  className?: string;
}) {
  const compact = inline || variant === "inline" || variant === "button";
  return <span role={variant === "button" ? undefined : "status"} aria-live={variant === "button" ? undefined : "polite"} aria-label={variant === "button" ? undefined : message} aria-hidden={variant === "button" || undefined}
    className={cn("ios-loader", compact ? "inline-flex items-center gap-2" : "flex min-h-56 flex-col items-center justify-center gap-5 px-6 py-10 text-center", fullscreen && "fixed inset-0 z-50 bg-ink-950", className)}>
    <span className={cn("relative inline-grid shrink-0 place-items-center", size === "sm" || compact ? "size-5" : size === "lg" ? "size-24" : "size-16")}>
      {!compact && <span className="absolute inset-0 rounded-full border border-brand/20 bg-brand/5 shadow-[0_0_24px_rgba(37,99,235,0.12)]" />}
      <span className="ios-loader-mark inline-flex h-3/4 w-3/4"><BrandMark className="!h-full !w-full" /></span>
    </span>
    {variant !== "button" && <span className="text-sm font-medium text-fg-secondary">{message}</span>}
  </span>;
}
