"use client";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassCard } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { BarChart3 } from "lucide-react";
import type { UsageOverview } from "@/lib/api/api-usage";
import { knownTokenTotal, usageLatency, usageNumber, usageUsd } from "@/lib/data/usage-format";

const colors = { success: "#3B82F6", failed: "#F87171", pending: "#94A3B8", tokens: "#38BDF8", latency: "#818CF8" };
const axis = { stroke: "#94A3B8", fontSize: 11, tickLine: false, axisLine: false };
type Metric = "requests" | "tokens" | "latency" | "cost";
const options = [{ value: "requests", label: "Requests" }, { value: "tokens", label: "Tokens" }, { value: "latency", label: "Response time" }, { value: "cost", label: "Reported cost" }];

function DailyChart({ data, metric }: { data: UsageOverview["daily"]; metric: Metric }) {
  const points = data.map(row => ({ ...row, label: row.date.slice(5), tokens: knownTokenTotal(row) }));
  const grid = <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />;
  const x = <XAxis dataKey="label" {...axis} minTickGap={18} />, y = <YAxis {...axis} width={48} allowDecimals={metric === "cost"} />;
  const tipStyle = { border: "1px solid var(--border-subtle)", borderRadius: 12, background: "var(--toast-bg)", color: "var(--fg)", fontSize: 12 };
  return <div className="h-60" role="img" aria-label={`Daily ${options.find(option => option.value === metric)?.label.toLowerCase()} in UTC`}><ResponsiveContainer width="100%" height="100%">
    {metric === "requests" ? <BarChart data={points} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>{grid}{x}{y}<Tooltip contentStyle={tipStyle} labelFormatter={label => `${label} · UTC`} /><Bar dataKey="succeeded" name="Successful" stackId="attempts" fill={colors.success} isAnimationActive={false} /><Bar dataKey="failed" name="Failed" stackId="attempts" fill={colors.failed} isAnimationActive={false} /><Bar dataKey="pending" name="Pending" stackId="attempts" fill={colors.pending} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart>
      : metric === "tokens" ? <AreaChart data={points} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>{grid}{x}{y}<Tooltip contentStyle={tipStyle} formatter={value => usageNumber(Number(value))} labelFormatter={label => `${label} · UTC`} /><Area type="linear" dataKey="tokens" name="Known tokens" fill={colors.tokens} fillOpacity={0.15} stroke={colors.tokens} strokeWidth={2} connectNulls={false} isAnimationActive={false} /></AreaChart>
        : <LineChart data={points} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>{grid}{x}{y}<Tooltip contentStyle={tipStyle} formatter={value => metric === "cost" ? usageUsd(Number(value)) : usageLatency(Number(value))} labelFormatter={label => `${label} · UTC`} /><Line type="linear" dataKey={metric === "cost" ? "costUsd" : "averageLatencyMs"} name={metric === "cost" ? "Reported cost" : "Average response time"} stroke={colors.latency} strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} /></LineChart>}
  </ResponsiveContainer></div>;
}
export default function UsageCharts({ overview }: { overview: UsageOverview }) {
  const [metric, setMetric] = useState<Metric>("requests");
  const [monthlyMetric, setMonthlyMetric] = useState<"requests" | "totalTokens">("requests");
  const daily = overview.daily;
  return <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
    <GlassCard className="min-w-0 p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Daily usage</h2><p className="mt-1 text-xs text-fg-muted">UTC calendar days · retries are separate attempts</p></div><Select label="Daily chart metric" value={metric} onValueChange={value => setMetric(value as Metric)} options={options} className="w-44" size="sm" /></div>
      {daily.every(row => !row.requests) ? <EmptyState icon={<BarChart3 />} title="No requests in this period" description="Usage appears after the first recorded provider request." className="py-12" /> : <DailyChart data={daily} metric={metric} />}
      <p className="mt-3 text-xs leading-relaxed text-fg-muted">{metric === "requests" ? "Blue: successful · Red: failed · Grey: pending" : "Missing measurements appear as gaps. Known values may cover only part of a day's requests."}</p>
      <details className="mt-3 text-xs text-fg-muted"><summary className="cursor-pointer rounded py-1">View daily chart data</summary><div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Date (UTC)</th><th className="p-2">Requests</th><th className="p-2">Success / failed</th><th className="p-2">Tokens</th><th className="p-2">Latency</th></tr></thead><tbody>{daily.map(row => <tr key={row.date}><td className="p-2">{row.date}</td><td className="p-2">{usageNumber(row.requests)}</td><td className="p-2">{row.succeeded} / {row.failed}</td><td className="p-2">{usageNumber(knownTokenTotal(row))}</td><td className="p-2">{usageLatency(row.averageLatencyMs)}</td></tr>)}</tbody></table></div></details>
    </GlassCard>
    <GlassCard className="min-w-0 p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Monthly trend</h2><p className="mt-1 text-xs text-fg-muted">Calendar months in UTC</p></div><Select label="Monthly chart metric" value={monthlyMetric} onValueChange={value => setMonthlyMetric(value as "requests" | "totalTokens")} options={[{ value: "requests", label: "Requests" }, { value: "totalTokens", label: "Known tokens" }]} className="w-36" size="sm" /></div>
      <div className="h-60" role="img" aria-label={`Monthly ${monthlyMetric === "requests" ? "requests" : "known tokens"} in UTC`}><ResponsiveContainer width="100%" height="100%"><BarChart data={overview.monthly.map(row => ({ ...row, totalTokens: knownTokenTotal(row) }))} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}><CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={value => String(value).slice(2)} /><YAxis {...axis} width={48} allowDecimals={false} /><Tooltip contentStyle={{ borderRadius: 12, background: "var(--toast-bg)", border: "1px solid var(--border-subtle)", fontSize: 12 }} /><Bar dataKey={monthlyMetric} name={monthlyMetric === "requests" ? "Requests" : "Known tokens"} fill="#2563EB" radius={[5, 5, 0, 0]} isAnimationActive={false} maxBarSize={36} /></BarChart></ResponsiveContainer></div>
      <p className="mt-3 text-xs leading-relaxed text-fg-muted">A calendar-month report is not a provider credit allowance or quota reset schedule.</p>
    </GlassCard>
  </div>;
}
