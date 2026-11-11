import * as React from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "./primitives";
import { INTERVIEW_STATUS_META, REVIEW_STATUS_META, statusLabel, statusTone } from "@/lib/demo/statuses";
import type { InterviewStatus, RecruitmentStatus, ReviewStatus } from "@/types";

export function EmptyState({ icon, title, description, action, className }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <div className="relative mb-5">
        <div className="absolute inset-0 -m-4 rounded-full bg-brand/15 blur-2xl" aria-hidden />
        <div className="relative grid size-14 place-items-center rounded-2xl border border-glow/50 bg-gradient-to-b from-overlay/[0.08] to-overlay/[0.02] text-brand-cyan [&_svg]:size-6">
          {icon}
        </div>
      </div>
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow, className }: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-[26px] font-bold leading-tight text-fg sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-fg-muted sm:text-[15px]">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, align = "center", className }: { eyebrow?: string; title: React.ReactNode; description?: string; align?: "center" | "left"; className?: string }) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
      <h2 className="text-[32px] font-bold leading-[1.12] text-fg sm:text-[42px]">{title}</h2>
      {description && <p className="mt-4 text-base leading-relaxed text-fg-muted sm:text-[17px]">{description}</p>}
    </div>
  );
}

export const RecruitmentStatusBadge = ({ status, className }: { status: RecruitmentStatus; className?: string }) => (
  <Badge tone={statusTone(status)} className={className}>
    {statusLabel(status)}
  </Badge>
);

export const InterviewStatusBadge = ({ status, review }: { status: InterviewStatus; review?: ReviewStatus }) => {
  if (status === "completed" && review === "awaiting_review") return <Badge tone="indigo">Awaiting Review</Badge>;
  const m = INTERVIEW_STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
};

export const ReviewStatusBadge = ({ review }: { review: ReviewStatus }) => {
  const m = REVIEW_STATUS_META[review];
  if (review === "not_applicable") return <span className="text-fg-disabled">—</span>;
  return <Badge tone={m.tone}>{m.label}</Badge>;
};

export function DemoBadge({ label = "UI Preview Mode", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-2.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-200", className)}
      title="This is an interactive demo. Logins, interviews, assessments, and status changes are simulated in your browser."
    >
      <FlaskConical className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
