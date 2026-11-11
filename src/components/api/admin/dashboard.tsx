"use client";
/**
 * API mode overview + analytics. Every number is a backend aggregate (GET /analytics/overview,
 * /analytics/activity, /recruitment/pipeline); the browser never downloads candidate lists to count them.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, FileText, Hourglass, PlayCircle, Star, Trophy, UserRoundSearch } from "lucide-react";
import { CandidateAvatar, GlassCard } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { EmptyState, PageHeader } from "@/components/ui/states";
import { BarsChart, CHART, ChartContainer, DonutChart, FunnelBars, TrendChart } from "@/components/charts";
import { MetricCard } from "@/components/admin/widgets";
import { ApiErrorPanel } from "@/components/api/query-state";
import { ApiRecruitmentBadge } from "./common";
import { useActivity, useApplications, useOverview, usePipelineCounts } from "@/lib/data/queries";
import { INTERVIEW_STATUS, TRACK_LABEL } from "@/lib/api/labels";
import type { AnalyticsOverview, InterviewStatus, RecruitmentStatus } from "@/lib/api/types";
import { PIPELINE_COLUMNS } from "@/lib/demo/statuses";
import { toUiStatus } from "@/lib/api/labels";
import { timeAgo } from "@/lib/utils";

const RANGES = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
];
const AT_OR_AFTER_SELECTED: RecruitmentStatus[] = ["SELECTED", "OFFER_RELEASED", "OFFER_ACCEPTED", "DOCUMENTATION_ONBOARDING", "PRODUCTION_ONBOARDING", "JOINED"];
const DONUT_COLORS: Record<InterviewStatus, string> = { PENDING: CHART.slate, IN_PROGRESS: CHART.cyan, INTERRUPTED: CHART.indigo, COMPLETED: CHART.blue, SUBMITTED: CHART.royal, EXPIRED: "#F87171", CANCELLED: "#94A3B8" };

function useRange() {
  const [range, setRange] = useState("90");
  const from = useMemo(() => (range === "all" ? undefined : new Date(Date.now() - Number(range) * 86400000).toISOString()), [range]);
  const weeks = range === "30" ? 5 : range === "90" ? 13 : 26;
  return { range, setRange, from, weeks };
}

const count = (o: AnalyticsOverview | undefined, statuses: RecruitmentStatus[]) => (o?.applications.byStatus ?? []).filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s.count, 0);

function weekLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ApiDashboard() {
  const { range, setRange, from, weeks } = useRange();
  const overview = useOverview({ from });
  const activity = useActivity(weeks);
  const recent = useApplications({ limit: 7, sortBy: "statusChangedAt", sortDir: "desc" });
  const o = overview.data;
  const by = o?.interviews.byStatus;
  const series = (activity.data?.weeks ?? []).map((w) => ({ week: weekLabel(w.weekStart), applications: w.applications, interviews: w.interviews, reviews: w.reviews }));
  const rangeNote = range === "all" ? "All time" : `Applications and interviews created in the last ${range} days`;

  return (
    <div>
      <PageHeader title="Recruitment Overview" description="Monitor candidates, interviews, and recruitment progress from one workspace." actions={<Select label="Date range" className="w-40" value={range} onValueChange={setRange} options={RANGES} />} />
      {overview.isError ? (
        <ApiErrorPanel error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <>
          <p className="-mt-2 mb-4 text-xs text-fg-muted">{rangeNote}{o?.includeSample ? " · includes development sample records" : ""}</p>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <MetricCard label="Total Applications" value={o ? o.applications.total : "—"} icon={FileText} spark={series.map((s) => s.applications)} href="/admin/candidates" />
            <MetricCard label="Interviews Pending" value={by ? by.PENDING : "—"} icon={Hourglass} hint="Invited, not started" href="/admin/interviews?tab=pending" />
            <MetricCard label="Interviews In Progress" value={by ? by.IN_PROGRESS + by.INTERRUPTED : "—"} icon={PlayCircle} hint="Started or paused" href="/admin/interviews?tab=in_progress" />
            <MetricCard label="Interviews Completed" value={by ? by.SUBMITTED : "—"} icon={CheckCircle2} hint="Submitted" spark={series.map((s) => s.interviews)} href="/admin/interviews?tab=completed" />
            <MetricCard label="Recruiter Reviews Pending" value={o ? o.reviews.pending : "—"} icon={ClipboardCheck} hint="Open HR reviews" href="/admin/interviews?tab=review" />
            <MetricCard label="Currently Shortlisted" value={o ? count(o, ["SHORTLISTED"]) : "—"} icon={Star} href="/admin/candidates?stage=shortlisted" />
            <MetricCard label="Selected or Later" value={o ? count(o, AT_OR_AFTER_SELECTED) : "—"} icon={Trophy} hint="Selected through joined" />
            <MetricCard label="Completion Rate" value={o?.interviews.completionRate != null ? `${Math.round(o.interviews.completionRate * 100)}%` : "—"} icon={UserRoundSearch} hint="Submitted ÷ issued" />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <ChartContainer className="xl:col-span-2" title="Recruitment Activity" description="Per week (Monday start, UTC): applications received, interviews submitted, reviews completed" legend={[{ label: "Applications", color: CHART.blue }, { label: "Interviews", color: CHART.cyan }, { label: "Reviews", color: CHART.indigo }]}>
              {activity.isError ? <ApiErrorPanel compact error={activity.error} onRetry={() => void activity.refetch()} /> : activity.isPending ? <div className="skeleton h-[260px] rounded-xl" /> : series.every((s) => !s.applications && !s.interviews && !s.reviews) ? <EmptyState icon={<FileText />} title="No activity in this period" description="Nothing was received, submitted or reviewed in the selected weeks." /> : (
                <TrendChart data={series} series={[{ key: "applications", label: "Applications", color: CHART.blue }, { key: "interviews", label: "Interviews", color: CHART.cyan }, { key: "reviews", label: "Reviews", color: CHART.indigo }]} />
              )}
            </ChartContainer>
            <ChartContainer title="Interview Status" description="Interviews issued in the selected period">
              {!o ? <div className="skeleton h-[200px] rounded-xl" /> : o.interviews.issued === 0 ? <EmptyState icon={PlayCircleIcon} title="No interviews" description="No interviews were issued in this period." /> : (
                <DonutChart data={(Object.keys(o.interviews.byStatus) as InterviewStatus[]).filter((k) => o.interviews.byStatus[k] > 0).map((k) => ({ name: INTERVIEW_STATUS[k].label, value: o.interviews.byStatus[k], color: DONUT_COLORS[k] }))} centerLabel="Issued" centerValue={o.interviews.issued} />
              )}
            </ChartContainer>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <ChartContainer title="Pipeline Stages" description="Applications in the period, by stage group">
              {!o ? <div className="skeleton h-[220px] rounded-xl" /> : <FunnelBars data={PIPELINE_COLUMNS.slice(0, 6).map((col) => ({ stage: col.label, value: (o.applications.byStatus ?? []).filter((s) => col.statuses.includes(toUiStatus(s.status))).reduce((n, s) => n + s.count, 0) }))} />}
            </ChartContainer>
            <ChartContainer title="Role Distribution" description="Candidates by interview track">
              {!o ? <div className="skeleton h-[220px] rounded-xl" /> : o.candidates.total === 0 ? <EmptyState icon={UserIcon} title="No candidates" description="No candidates in this period." /> : (
                <BarsChart data={(Object.keys(TRACK_LABEL) as (keyof typeof TRACK_LABEL)[]).map((t) => ({ track: TRACK_LABEL[t], candidates: o.candidates.byTrack[t] ?? 0 }))} xKey="track" series={[{ key: "candidates", label: "Candidates", color: CHART.royal }]} />
              )}
            </ChartContainer>
            <GlassCard className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold">Recently Updated</h3>
                <Link href="/admin/candidates" className="inline-flex items-center gap-1 text-xs text-brand-cyan hover:underline">View all<ArrowRight className="size-3" /></Link>
              </div>
              {recent.isError ? <ApiErrorPanel compact className="mt-4" error={recent.error} onRetry={() => void recent.refetch()} /> : recent.isPending ? <div className="skeleton mt-4 h-60 rounded-xl" /> : (recent.data?.items.length ?? 0) === 0 ? <p className="mt-6 text-sm text-fg-muted">No applications yet.</p> : (
                <ul className="mt-4 space-y-1">
                  {recent.data!.items.map((a) => (
                    <li key={a.id}>
                      <Link href={`/admin/candidates/${a.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-overlay/[0.04]">
                        <CandidateAvatar name={a.candidate.fullName} size="sm" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.candidate.fullName}</span><span className="block truncate text-xs text-fg-muted">{a.jobRole.title} · {timeAgo(a.statusChangedAt)}</span></span>
                        <ApiRecruitmentBadge status={a.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}

const PlayCircleIcon = <PlayCircle />;
const UserIcon = <UserRoundSearch />;

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
            <ChartContainer title="Weekly Activity" description="Applications, submitted interviews and completed reviews per week">
              {activity.isPending ? <div className="skeleton h-[260px] rounded-xl" /> : activity.isError ? <ApiErrorPanel compact error={activity.error} onRetry={() => void activity.refetch()} /> : <TrendChart kind="line" data={series} series={[{ key: "applications", label: "Applications", color: CHART.blue }, { key: "interviews", label: "Interviews", color: CHART.cyan }, { key: "reviews", label: "Reviews", color: CHART.indigo }]} />}
            </ChartContainer>
            <ChartContainer title="Stage Conversion" description="All-time: candidates currently at or beyond each stage (closed records excluded)">
              {pipeline.isPending ? <div className="skeleton h-[220px] rounded-xl" /> : pipeline.isError ? <ApiErrorPanel compact error={pipeline.error} onRetry={() => void pipeline.refetch()} /> : <FunnelBars data={funnel} />}
            </ChartContainer>
          </div>
          <ChartContainer className="mt-6" title="Recruitment Pipeline Counts" description="All-time: applications currently in each official status">
            {pipeline.isPending ? <div className="skeleton h-[240px] rounded-xl" /> : pipeline.isError ? <ApiErrorPanel compact error={pipeline.error} onRetry={() => void pipeline.refetch()} /> : (
              <BarsChart data={stages.map((s) => ({ status: s.label, count: s.count }))} xKey="status" series={[{ key: "count", label: "Applications", color: CHART.royal }]} layout="vertical" height={520} />
            )}
          </ChartContainer>
        </>
      )}
    </div>
  );
}
