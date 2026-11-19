"use client";
import type * as React from "react";
import { cn } from "@/lib/utils";
export const CHART = {
  blue: "#3B82F6",
  royal: "#2563EB",
  cyan: "#38BDF8",
  indigo: "#818CF8",
  slate: "#64748B",
  grid: "rgba(148,163,184,0.08)",
  axis: "#94A3B8",
};

export function ChartContainer({ title, description, action, children, className, legend }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; legend?: { label: string; color: string }[] }) {
  return (
    <section className={cn("surface flex flex-col rounded-xl p-5", className)} aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
        </div>
        {action}
      </div>
      {legend && (
        <ul className="-mt-1 mb-3 flex flex-wrap gap-4 text-xs text-fg-secondary">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: l.color }} aria-hidden />{l.label}</li>
          ))}
        </ul>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** Custom funnel: proportional horizontal bars with conversion between stages. */
export function FunnelBars({ data }: { data: { stage: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ol className="space-y-3">
      {data.map((d, i) => {
        const prev = data[i - 1]?.value;
        const conv = prev ? Math.round((d.value / prev) * 100) : null;
        return (
          <li key={d.stage}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-fg-secondary">{d.stage}</span>
              <span className="flex items-center gap-2">
                {conv !== null && <span className="text-fg-disabled">{conv}% of previous</span>}
                <span className="font-semibold tabular-nums text-fg">{d.value}</span>
              </span>
            </div>
            <div className="h-7 overflow-hidden rounded-lg bg-overlay/[0.04]">
              <div
                className="h-full rounded-lg bg-gradient-to-r from-brand to-brand-cyan transition-[width] duration-1000 ease-premium"
                style={{ width: `${(d.value / max) * 100}%`, opacity: 1 - i * 0.12 }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
