"use client";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Briefcase, CircleCheck, ClipboardCheck, FileText, MessageSquarePlus, PlayCircle, Send, Star, UserX, Video } from "lucide-react";
import type { RecruitmentEvent } from "@/types";
import { cn, formatDateTime } from "@/lib/utils";

export function MetricCard({ label, value, icon: Icon, hint, trend, href, spark }: { label: string; value: number | string; icon: LucideIcon; hint?: string; trend?: { value: string; up?: boolean }; href?: string; spark?: number[] }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-lg border border-subtle bg-overlay/[0.04] text-brand-cyan">
          <Icon className="size-4" aria-hidden />
        </span>
        {spark && <Sparkline values={spark} />}
      </div>
      <p className="mt-4 font-display text-[28px] font-bold leading-none tabular-nums text-fg">{value}</p>
      <p className="mt-2 text-[13px] font-medium text-fg-secondary">{label}</p>
      {(hint || trend) && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
          {trend && <span className={cn("font-medium", trend.up ? "text-emerald-700 dark:text-emerald-300" : "text-fg-secondary")}>{trend.value}</span>}
          {hint}
        </p>
      )}
    </>
  );
  const cls = "surface group relative block rounded-xl p-5 transition-[border-color,background-color] duration-200";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-glow/50 hover:bg-overlay/[0.05]")}>
      {body}
      <ArrowUpRight className="absolute right-4 top-4 size-4 text-fg-disabled opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 64, h = 24;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} className="mr-5 opacity-80" aria-hidden>
      <polyline points={pts} fill="none" stroke="#38BDF8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const EVENT_ICON: Record<RecruitmentEvent["type"], LucideIcon> = {
  application: FileText,
  invite: Send,
  interview_started: PlayCircle,
  interview_submitted: Video,
  assessment: ClipboardCheck,
  review: CircleCheck,
  stage: Briefcase,
  remark: MessageSquarePlus,
  closed: UserX,
};

export function Timeline({ events, className }: { events: RecruitmentEvent[]; className?: string }) {
  const sorted = [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return (
    <ol className={cn("relative", className)}>
      {sorted.map((e, i) => {
        const Icon = e.label.startsWith("Shortlisted") ? Star : EVENT_ICON[e.type];
        return (
          <li key={e.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i < sorted.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-28px)] w-px bg-overlay/[0.08]" aria-hidden />}
            <span className={cn("relative grid size-9 shrink-0 place-items-center rounded-full border", i === 0 ? "border-brand/50 bg-brand/15 text-brand-cyan" : "border-subtle bg-ink-900 text-fg-muted")}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium text-fg">{e.label}</p>
              <p className="mt-0.5 text-xs text-fg-muted">{formatDateTime(e.at)} · {e.actor}</p>
              {e.detail && <p className="mt-1.5 rounded-lg border border-subtle bg-overlay/[0.02] px-2.5 py-1.5 text-xs text-fg-secondary">{e.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ScoreBar({ label, score, explanation, max = 5 }: { label: string; score: number; explanation?: string; max?: number }) {
  const segments = Array.from({ length: max });
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className="text-sm tabular-nums text-fg-secondary"><span className="font-semibold text-fg">{score.toFixed(1)}</span> / {max}</span>
      </div>
      <div className="mt-2 flex gap-1" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={max} aria-label={`${label}: ${score} out of ${max}`}>
        {segments.map((_, i) => {
          const fill = Math.max(0, Math.min(1, score - i));
          return (
            <span key={i} className="relative h-2 flex-1 overflow-hidden rounded-full bg-overlay/[0.07]">
              <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand to-brand-cyan" style={{ width: `${fill * 100}%` }} />
            </span>
          );
        })}
      </div>
      {explanation && <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{explanation}</p>}
    </div>
  );
}
