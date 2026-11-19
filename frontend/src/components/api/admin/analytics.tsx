"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Hourglass, UserRoundSearch } from "lucide-react";
import { Select } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/states";
import { BarsChart, CHART, ChartContainer, FunnelBars, TrendChart } from "@/components/charts";
import { MetricCard } from "@/components/admin/widgets";
import { ApiErrorPanel } from "@/components/api/query-state";
import { useActivity, useOverview, usePipelineCounts } from "@/lib/data/queries";
const RANGES = [{value:"30",label:"Last 30 days"},{value:"90",label:"Last 90 days"},{value:"all",label:"All time"}];
function useRange() {
  const [range, setRange] = useState("90");
  const from = useMemo(() => (range === "all" ? undefined : new Date(Date.now() - Number(range) * 86400000).toISOString()), [range]);
  const weeks = range === "30" ? 5 : range === "90" ? 13 : 26;
  return { range, setRange, from, weeks };
}

function weekLabel(iso: string) {return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric"});}
export function ApiAnalytics() {
  const { range, setRange, from, weeks } = useRange();
  const overview = useOverview({ from });
  const activity = useActivity(weeks);
  const pipeline = usePipelineCounts();
  const o = overview.data;
  const series = (activity.data?.weeks ?? []).map((w) => ({ week: weekLabel(w.weekStart), applications: w.applications, interviews: w.interviews, reviews: w.reviews }));
  const stages = pipeline.data?.stages ?? [];
  const reached = (fromIdx: number) => stages.slice(fromIdx).filter((s) => s.status !== "NOT_SELECTED" && s.status !== "CANDIDATE_WITHDRAWN").reduce((n, s) => n + s.count, 0);
  const funnel = [
    { stage: "Application Received", value: reached(0) },
    { stage: "AI Interview Completed", value: reached(3) },
    { stage: "Shortlisted", value: reached(5) },
    { stage: "Selected", value: reached(10) },
    { stage: "Joined", value: reached(15) },
  ];

  return (
    <div>
      <PageHeader title="Analytics & Reports" description="Recruitment performance from live records." actions={<Select label="Date range" className="w-40" value={range} onValueChange={setRange} options={RANGES} />} />
      {overview.isError ? <ApiErrorPanel error={overview.error} onRetry={() => void overview.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <MetricCard label="Candidates" value={o ? o.candidates.total : "—"} icon={UserRoundSearch} hint="In selected period" />
            <MetricCard label="Interview Completion" value={o?.interviews.completionRate != null ? `${Math.round(o.interviews.completionRate * 100)}%` : "—"} icon={CheckCircle2} hint="Submitted ÷ issued" />
            <MetricCard label="Pending Reviews" value={o ? o.reviews.pending : "—"} icon={ClipboardCheck} />
            <MetricCard label="Median Interview Time" value={o?.interviews.medianDurationSeconds != null ? `${Math.round(o.interviews.medianDurationSeconds / 60)} min` : "—"} icon={Hourglass} hint="Start to submit" />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ChartContainer title="Weekly Activity" description={`${weeks} calendar weeks · applications, submitted interviews and completed reviews`}>
              {activity.isPending ? <div className="skeleton h-[260px] rounded-xl" /> : activity.isError ? <ApiErrorPanel compact error={activity.error} onRetry={() => void activity.refetch()} /> : <TrendChart kind="line" data={series} series={[{ key: "applications", label: "Applications", color: CHART.blue }, { key: "interviews", label: "Interviews", color: CHART.cyan }, { key: "reviews", label: "Reviews", color: CHART.indigo }]} />}
            </ChartContainer>
            <ChartContainer title="Stage Overview" description="All-time: applications currently at or beyond each stage (closed records excluded)">
              {pipeline.isPending ? <div className="skeleton h-[220px] rounded-xl" /> : pipeline.isError ? <ApiErrorPanel compact error={pipeline.error} onRetry={() => void pipeline.refetch()} /> : <FunnelBars data={funnel} />}
            </ChartContainer>
          </div>
          <details className="mt-6 rounded-xl border border-subtle p-4"><summary className="cursor-pointer font-semibold">Detailed pipeline counts</summary><ChartContainer className="mt-4" title="Recruitment Pipeline Counts" description="All-time: applications currently in each official status">
            {pipeline.isPending ? <div className="skeleton h-[240px] rounded-xl" /> : pipeline.isError ? <ApiErrorPanel compact error={pipeline.error} onRetry={() => void pipeline.refetch()} /> : (
              <BarsChart data={stages.map((s) => ({ status: s.label, count: s.count }))} xKey="status" series={[{ key: "count", label: "Applications", color: CHART.royal }]} layout="vertical" height={520} />
            )}
          </ChartContainer></details>
        </>
      )}
    </div>
  );
}
