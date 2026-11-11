"use client";
/** Blue-dominant Recharts wrappers with a shared tooltip and legend style. */
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/use-demo";

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

interface TipPayload { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }
function ChartTooltip({ active, payload, label, suffix }: { active?: boolean; payload?: TipPayload[]; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-subtle bg-ink-800/95 px-3 py-2.5 text-xs shadow-float backdrop-blur">
      {label && <p className="mb-1.5 font-medium text-fg">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.name)} className="flex items-center gap-2 text-fg-secondary">
          <span className="size-2 rounded-full" style={{ background: p.color ?? (p.payload?.color as string) }} aria-hidden />
          {p.name}: <span className="font-semibold tabular-nums text-fg">{p.value}{suffix}</span>
        </p>
      ))}
    </div>
  );
}

const axisProps = { stroke: CHART.axis, fontSize: 11, tickLine: false, axisLine: false } as const;

export function TrendChart({ data, series, height = 260, kind = "area", suffix }: { data: Record<string, string | number>[]; series: { key: string; label: string; color: string }[]; height?: number; kind?: "area" | "line"; suffix?: string }) {
  const reduce = usePrefersReducedMotion();
  const Chart = kind === "area" ? AreaChart : LineChart;
  return (
    <div style={{ height }} role="img" aria-label={`Chart of ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="1" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey={Object.keys(data[0] ?? { x: 0 })[0]} {...axisProps} minTickGap={16} />
          <YAxis {...axisProps} allowDecimals={false} width={40} />
          <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ stroke: "rgba(148,163,184,0.25)" }} />
          {series.map((s) =>
            kind === "area" ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#grad-${s.key})`} isAnimationActive={!reduce} animationDuration={900} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={!reduce} animationDuration={900} />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, height = 200, centerLabel, centerValue }: { data: { name: string; value: number; color: string }[]; height?: number; centerLabel: string; centerValue: string | number }) {
  const reduce = usePrefersReducedMotion();
  return (
    <div className="relative" style={{ height }} role="img" aria-label={data.map((d) => `${d.name}: ${d.value}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive={!reduce} animationDuration={900}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-2xl font-bold tabular-nums">{centerValue}</p>
          <p className="text-[11px] text-fg-muted">{centerLabel}</p>
        </div>
      </div>
    </div>
  );
}

export function BarsChart({ data, xKey, series, height = 240, layout = "horizontal", stacked }: { data: Record<string, string | number>[]; xKey: string; series: { key: string; label: string; color: string }[]; height?: number; layout?: "horizontal" | "vertical"; stacked?: boolean }) {
  const reduce = usePrefersReducedMotion();
  const vertical = layout === "vertical";
  return (
    <div style={{ height }} role="img" aria-label={`Bar chart of ${series.map((s) => s.label).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={{ top: 4, right: 8, left: vertical ? 4 : -18, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={CHART.grid} vertical={vertical} horizontal={!vertical} />
          {vertical ? (
            <>
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey={xKey} {...axisProps} width={110} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axisProps} />
              <YAxis {...axisProps} allowDecimals={false} width={40} />
            </>
          )}
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} stackId={stacked ? "a" : undefined} isAnimationActive={!reduce} animationDuration={800} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
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
