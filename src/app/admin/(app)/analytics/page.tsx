"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiAnalytics } from "@/components/api/admin/dashboard";
import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Clock, Download, FileText, Hourglass, Printer, Star, Trophy, UserRoundSearch, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { EmptyState, PageHeader } from "@/components/ui/states";
import { BarsChart, ChartContainer, CHART, DonutChart, FunnelBars, TrendChart } from "@/components/charts";
import { MetricCard } from "@/components/admin/widgets";
import { useDemoStore } from "@/lib/demo/store";
import { computeMetrics, funnel, weeklyActivity } from "@/lib/demo/selectors";
import { JOB_ROLES } from "@/lib/demo/questions";
import { PIPELINE_COLUMNS, PRE_COLUMN, CLOSED_COLUMNS } from "@/lib/demo/statuses";
import { downloadCsv, pct } from "@/lib/utils";

const RANGE_OPTS = [
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function DemoAnalyticsPage() {
  const allCandidates = useDemoStore((s) => s.candidates);
  const interviews = useDemoStore((s) => s.interviews);
  const team = useDemoStore((s) => s.team);
  const [range, setRange] = useState("90");
  const [role, setRole] = useState("all");
  const [stage, setStage] = useState("all");
  const [ivStatus, setIvStatus] = useState("all");

  const ivMap = useMemo(() => new Map(interviews.map((i) => [i.id, i])), [interviews]);
  const candidates = useMemo(() => {
    const from = Date.now() - Number(range) * 86400000;
    const groups = [PRE_COLUMN, ...PIPELINE_COLUMNS, ...CLOSED_COLUMNS];
    return allCandidates.filter((c) => {
      const iv = c.interviewId ? ivMap.get(c.interviewId) : undefined;
      return (
        new Date(c.appliedAt).getTime() >= from &&
        (role === "all" || c.roleId === role) &&
        (stage === "all" || groups.find((g) => g.id === stage)?.statuses.includes(c.status)) &&
        (ivStatus === "all" || (ivStatus === "awaiting" ? iv?.reviewStatus === "awaiting_review" : iv?.status === ivStatus))
      );
    });
  }, [allCandidates, ivMap, range, role, stage, ivStatus]);
  const ivs = useMemo(() => interviews.filter((i) => candidates.some((c) => c.id === i.candidateId)), [interviews, candidates]);
  const m = computeMetrics(candidates, ivs);
  const weeks = weeklyActivity(candidates, ivs, Number(range) <= 14 ? 2 : Number(range) <= 30 ? 5 : 12);

  // Average turnaround (hours) between submission and review, per week of review.
  const reviewed = ivs.filter((i) => i.completedAt && i.reviewedAt);
  const avgTurnaroundH = reviewed.length ? Math.round(reviewed.reduce((a, i) => a + (new Date(i.reviewedAt!).getTime() - new Date(i.completedAt!).getTime()) / 3600000, 0) / reviewed.length) : 0;
  const turnaround = weeks.map((w) => {
    const inWeek = reviewed.filter((i) => { const t = new Date(i.reviewedAt!).getTime(); return t >= w.from && t < w.from + 7 * 86400000; });
    return { week: w.week, hours: inWeek.length ? Math.round(inWeek.reduce((a, i) => a + (new Date(i.reviewedAt!).getTime() - new Date(i.completedAt!).getTime()) / 3600000, 0) / inWeek.length) : 0 };
  });
  const completionTrend = weeks.map((w) => ({ week: w.week, rate: w.applications ? Math.min(100, Math.round((w.interviews / Math.max(w.applications, 1)) * 100)) : 0 }));
  const workload = team.filter((t) => t.role !== "super_admin").map((t) => ({
    name: t.name.split(" ")[0]!,
    reviewed: ivs.filter((i) => i.reviewerId === t.id && i.reviewStatus === "reviewed").length,
    pending: candidates.filter((c) => c.recruiterId === t.id && c.interviewId && ivMap.get(c.interviewId)?.reviewStatus === "awaiting_review").length,
  }));
  const stageConversion = PIPELINE_COLUMNS.map((col) => ({ stage: col.label, count: candidates.filter((c) => col.statuses.includes(c.status)).length }));
  const roleSplit = JOB_ROLES.map((r, i) => ({ name: r.shortTitle, value: candidates.filter((c) => c.roleId === r.id).length, color: i === 0 ? CHART.royal : CHART.cyan }));
  const rangeLabel = RANGE_OPTS.find((r) => r.value === range)!.label;

  const exportCsv = () => {
    downloadCsv("recruitment-analytics.csv", [
      { metric: "Applications received", value: m.total, period: rangeLabel },
      { metric: "Interview participation", value: `${pct(m.interviewsCompleted + m.interviewsInProgress, m.invited)}%`, period: rangeLabel },
      { metric: "Interview completion", value: `${pct(m.interviewsCompleted, m.invited)}%`, period: rangeLabel },
      { metric: "Recruiter review volume", value: m.reviewed, period: rangeLabel },
      { metric: "Shortlisting rate", value: `${pct(m.shortlisted, m.interviewsCompleted)}%`, period: rangeLabel },
      { metric: "Selection rate", value: `${pct(m.selected, m.interviewsCompleted)}%`, period: rangeLabel },
      { metric: "Average review turnaround (hours)", value: avgTurnaroundH, period: rangeLabel },
      { metric: "Incomplete interviews", value: m.interviewsInProgress + m.expired, period: rangeLabel },
      ...weeks.map((w) => ({ metric: `Week of ${w.week}`, value: `${w.applications} applications / ${w.interviews} interviews / ${w.reviews} reviews`, period: rangeLabel })),
    ]);
    toast.success("Analytics exported as CSV.");
  };

  return (
    <div className="print-area">
      <PageHeader
        title="Recruitment Analytics"
        description={`All figures are derived from the fictional demo dataset · ${rangeLabel}`}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}><Download />Export CSV</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer />Print Report</Button>
          </>
        }
      />
      <GlassCard className="no-print mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select label="Date range" value={range} onValueChange={setRange} options={RANGE_OPTS} />
        <Select label="Job role / candidate category" value={role} onValueChange={setRole} options={[{ value: "all", label: "All roles & categories" }, ...JOB_ROLES.map((r) => ({ value: r.id, label: r.title }))]} />
        <Select label="Recruitment stage" value={stage} onValueChange={setStage} options={[{ value: "all", label: "All stages" }, ...[PRE_COLUMN, ...PIPELINE_COLUMNS, ...CLOSED_COLUMNS].map((g) => ({ value: g.id, label: g.label }))]} />
        <Select label="Interview status" value={ivStatus} onValueChange={setIvStatus} options={[{ value: "all", label: "Any interview status" }, { value: "not_started", label: "Pending" }, { value: "in_progress", label: "In Progress" }, { value: "completed", label: "Completed" }, { value: "awaiting", label: "Awaiting Review" }]} />
      </GlassCard>

      {candidates.length === 0 ? (
        <GlassCard><EmptyState icon={<BarChart3 />} title="No reports for the selected period" description="No candidates match these filters. Widen the date range or clear a filter." /></GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <MetricCard label="Applications received" value={m.total} icon={FileText} hint={rangeLabel} />
            <MetricCard label="Interview participation" value={`${pct(m.interviewsCompleted + m.interviewsInProgress, m.invited)}%`} icon={Video} hint={`${m.interviewsCompleted + m.interviewsInProgress} of ${m.invited} invited started`} />
            <MetricCard label="Interview completion" value={`${pct(m.interviewsCompleted, m.invited)}%`} icon={CheckCircle2} hint={`${m.interviewsCompleted} submitted`} />
            <MetricCard label="Recruiter review volume" value={m.reviewed} icon={UserRoundSearch} hint={`${m.awaitingReview} still awaiting`} />
            <MetricCard label="Shortlisting rate" value={`${pct(m.shortlisted, m.interviewsCompleted)}%`} icon={Star} hint="of completed interviews" />
            <MetricCard label="Selection rate" value={`${pct(m.selected, m.interviewsCompleted)}%`} icon={Trophy} hint="of completed interviews" />
            <MetricCard label="Avg. review turnaround" value={`${avgTurnaroundH}h`} icon={Clock} hint="Submission → review" />
            <MetricCard label="Incomplete interviews" value={m.interviewsInProgress + m.expired} icon={Hourglass} hint={`${m.expired} expired`} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <ChartContainer className="xl:col-span-2" title="Application & Interview Trends" description={`Weekly · ${rangeLabel}`} legend={[{ label: "Applications", color: CHART.indigo }, { label: "Interviews completed", color: CHART.blue }]}>
              <TrendChart data={weeks.map(({ week, applications, interviews }) => ({ week, applications, interviews }))} series={[{ key: "applications", label: "Applications", color: CHART.indigo }, { key: "interviews", label: "Interviews completed", color: CHART.blue }]} />
            </ChartContainer>
            <ChartContainer title="Role-Based Distribution" description="Candidates by applied role">
              <DonutChart data={roleSplit} centerValue={m.total} centerLabel="Candidates" height={220} />
              <ul className="mt-4 space-y-2 text-xs">
                {roleSplit.map((r) => <li key={r.name} className="flex items-center justify-between rounded-lg bg-overlay/[0.03] px-3 py-2"><span className="flex items-center gap-2 text-fg-secondary"><span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />{r.name}</span><span className="font-semibold tabular-nums">{r.value} · {pct(r.value, m.total)}%</span></li>)}
              </ul>
            </ChartContainer>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <ChartContainer title="Recruitment Funnel" description="Cumulative progression">
              <FunnelBars data={funnel(candidates, ivs)} />
            </ChartContainer>
            <ChartContainer title="Stage Overview" description="Candidates currently in each active stage">
              <BarsChart data={stageConversion} xKey="stage" layout="vertical" height={280} series={[{ key: "count", label: "Candidates", color: CHART.blue }]} />
            </ChartContainer>
            <ChartContainer title="Interview Status Breakdown" description="Invited candidates">
              <DonutChart height={200} centerValue={m.invited} centerLabel="Invited" data={[{ name: "Pending", value: m.interviewsPending, color: CHART.slate }, { name: "In Progress", value: m.interviewsInProgress, color: CHART.cyan }, { name: "Awaiting Review", value: m.awaitingReview, color: CHART.indigo }, { name: "Reviewed", value: m.reviewed, color: CHART.royal }, { name: "Expired", value: m.expired, color: "#334155" }]} />
            </ChartContainer>
            <ChartContainer title="Interview Completion Trend" description="Completed interviews as % of weekly applications">
              <TrendChart kind="line" height={220} suffix="%" data={completionTrend} series={[{ key: "rate", label: "Completion", color: CHART.cyan }]} />
            </ChartContainer>
            <ChartContainer title="Review Workload by Recruiter" description="Reviewed vs pending" legend={[{ label: "Reviewed", color: CHART.royal }, { label: "Pending", color: CHART.indigo }]}>
              <BarsChart data={workload} xKey="name" height={220} stacked series={[{ key: "reviewed", label: "Reviewed", color: CHART.royal }, { key: "pending", label: "Pending", color: CHART.indigo }]} />
            </ChartContainer>
            <ChartContainer title="Time-to-Review Trend" description="Average hours from submission to review">
              <TrendChart height={220} suffix="h" data={turnaround} series={[{ key: "hours", label: "Avg. hours", color: CHART.blue }]} />
            </ChartContainer>
          </div>
        </>
      )}
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function AnalyticsPage() {
  return isApiMode ? <ApiAnalytics /> : <DemoAnalyticsPage />;
}
