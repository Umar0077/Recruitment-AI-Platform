"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiDashboard } from "@/components/api/admin/dashboard";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CalendarClock, ClipboardCheck, Download, FileText, Hourglass, RefreshCw, Send, Star, Trophy, UserRoundSearch, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CandidateAvatar, GlassCard, Pill } from "@/components/ui/primitives";
import { ConfirmationDialog, Select } from "@/components/ui/overlays";
import { InterviewStatusBadge, PageHeader, RecruitmentStatusBadge } from "@/components/ui/states";
import { ChartContainer, CHART, DonutChart, FunnelBars, TrendChart, BarsChart } from "@/components/charts";
import { MetricCard } from "@/components/admin/widgets";
import { useDemoStore } from "@/lib/demo/store";
import { computeMetrics, funnel, pipelineCounts, roleShort, weeklyActivity } from "@/lib/demo/selectors";
import { PIPELINE_COLUMNS } from "@/lib/demo/statuses";
import { downloadCsv, formatDate, timeAgo, cn } from "@/lib/utils";
import { statusLabel } from "@/lib/demo/statuses";

const RANGES = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function DemoOverviewPage() {
  const router = useRouter();
  const allCandidates = useDemoStore((s) => s.candidates);
  const interviews = useDemoStore((s) => s.interviews);
  const resetDemo = useDemoStore((s) => s.resetDemo);
  const [range, setRange] = useState("90");
  const [confirmReset, setConfirmReset] = useState(false);

  const candidates = useMemo(() => {
    const from = Date.now() - Number(range) * 86400000;
    return allCandidates.filter((c) => new Date(c.appliedAt).getTime() >= from);
  }, [allCandidates, range]);
  const m = useMemo(() => computeMetrics(candidates, interviews), [candidates, interviews]);
  const weeks = useMemo(() => weeklyActivity(candidates, interviews, range === "30" ? 5 : 12), [candidates, interviews, range]);
  const ivOf = (id?: string) => interviews.find((i) => i.id === id);
  const recent = useMemo(() => [...allCandidates].sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated)).slice(0, 7), [allCandidates]);
  const pipe = pipelineCounts(allCandidates);
  const allM = computeMetrics(allCandidates, interviews);
  const spark = (key: "applications" | "interviews" | "reviews") => weeks.map((w) => w[key]);

  const roleByStage = PIPELINE_COLUMNS.slice(0, 5).map((col) => ({
    stage: col.label,
    experienced: candidates.filter((c) => c.track === "experienced" && col.statuses.includes(c.status)).length,
    fresher: candidates.filter((c) => c.track === "fresher" && col.statuses.includes(c.status)).length,
  }));

  const actions = [
    { icon: ClipboardCheck, label: "Interviews awaiting review", count: allM.awaitingReview, href: "/admin/interviews?tab=review", priority: "high" },
    { icon: AlertCircle, label: "Candidates requiring follow-up", count: allM.followUp, href: "/admin/candidates?stage=recruiter_review_pending", priority: "high" },
    { icon: CalendarClock, label: "HR interviews to schedule", count: allM.hrToSchedule, href: "/admin/pipeline", priority: "medium" },
    { icon: Hourglass, label: "Incomplete interviews", count: allM.interviewsInProgress, href: "/admin/interviews?tab=in_progress", priority: "medium" },
    { icon: Send, label: "Offers awaiting response", count: allM.offersAwaiting, href: "/admin/pipeline", priority: "low" },
  ];

  return (
    <div>
      <PageHeader
        title="Recruitment Overview"
        description="Monitor candidates, interviews, and recruitment progress from one workspace."
        actions={
          <>
            <Select label="Date range" className="w-40" value={range} onValueChange={setRange} options={RANGES} />
            <Button
              variant="secondary"
              onClick={() => {
                downloadCsv("recruitment-overview.csv", [
                  { metric: "Total applications", value: m.total },
                  { metric: "AI interviews completed", value: m.interviewsCompleted },
                  { metric: "Interviews pending", value: m.interviewsPending },
                  { metric: "Awaiting review", value: m.awaitingReview },
                  { metric: "Shortlisted", value: m.shortlisted },
                  { metric: "Selected", value: m.selected },
                ]);
                toast.success("Demo report exported as CSV.");
              }}
            >
              <Download />Export Report
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(true)}><RefreshCw />Refresh Demo Data</Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total Applications" value={m.total} icon={FileText} hint={RANGES.find((r) => r.value === range)?.label} spark={spark("applications")} href="/admin/candidates" />
        <MetricCard label="AI Interviews Completed" value={m.interviewsCompleted} icon={Video} hint={`${Math.round((m.interviewsCompleted / Math.max(1, m.invited)) * 100)}% of invited`} spark={spark("interviews")} href="/admin/interviews?tab=completed" />
        <MetricCard label="Interviews Pending" value={m.interviewsPending + m.interviewsInProgress} icon={Hourglass} hint={`${m.interviewsInProgress} in progress`} href="/admin/interviews?tab=pending" />
        <MetricCard label="Awaiting Review" value={m.awaitingReview} icon={UserRoundSearch} hint="Needs a recruiter" href="/admin/interviews?tab=review" />
        <MetricCard label="Shortlisted Candidates" value={m.shortlisted} icon={Star} hint="Reached shortlist or later" href="/admin/pipeline" />
        <MetricCard label="Candidates Selected" value={m.selected} icon={Trophy} hint="Selected or later stage" href="/admin/pipeline" />
      </div>

      {/* Charts row */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <ChartContainer
          className="xl:col-span-2"
          title="Interview Activity"
          description={`Weekly applications, completed interviews, and reviews · ${RANGES.find((r) => r.value === range)?.label}`}
          legend={[{ label: "Applications", color: CHART.indigo }, { label: "Interviews completed", color: CHART.blue }, { label: "Reviews", color: CHART.cyan }]}
        >
          <TrendChart
            data={weeks.map(({ week, applications, interviews, reviews }) => ({ week, applications, interviews, reviews }))}
            series={[{ key: "applications", label: "Applications", color: CHART.indigo }, { key: "interviews", label: "Interviews completed", color: CHART.blue }, { key: "reviews", label: "Reviews", color: CHART.cyan }]}
          />
        </ChartContainer>
        <ChartContainer title="Interview Status" description="All invited candidates in range">
          <DonutChart
            centerValue={m.invited}
            centerLabel="Invited"
            data={[
              { name: "Pending", value: m.interviewsPending, color: CHART.slate },
              { name: "In Progress", value: m.interviewsInProgress, color: CHART.cyan },
              { name: "Awaiting Review", value: m.awaitingReview, color: CHART.indigo },
              { name: "Completed & Reviewed", value: m.reviewed, color: CHART.royal },
            ]}
          />
          <ul className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {[["Pending", m.interviewsPending, CHART.slate], ["In Progress", m.interviewsInProgress, CHART.cyan], ["Awaiting Review", m.awaitingReview, CHART.indigo], ["Reviewed", m.reviewed, CHART.royal]].map(([l, v, c]) => (
              <li key={l as string} className="flex items-center justify-between rounded-lg bg-overlay/[0.03] px-2.5 py-2">
                <span className="flex items-center gap-2 text-fg-secondary"><span className="size-2 rounded-full" style={{ background: c as string }} aria-hidden />{l}</span>
                <span className="font-semibold tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
        </ChartContainer>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <ChartContainer title="Candidate Recruitment Funnel" description="Application received → selected">
          <FunnelBars data={funnel(candidates, interviews)} />
        </ChartContainer>
        <ChartContainer title="Role Distribution" description="Experienced FE Closers vs Fresher CSR applicants by stage" legend={[{ label: "Experienced FE Closer", color: CHART.royal }, { label: "Fresher CSR", color: CHART.cyan }]}>
          <BarsChart data={roleByStage} xKey="stage" height={230} stacked series={[{ key: "experienced", label: "Experienced FE Closer", color: CHART.royal }, { key: "fresher", label: "Fresher CSR", color: CHART.cyan }]} />
        </ChartContainer>
        <GlassCard className="p-5">
          <div className="mb-4">
            <h3 className="text-[15px] font-semibold">Action Required</h3>
            <p className="mt-0.5 text-xs text-fg-muted">Prioritised work for the recruitment team</p>
          </div>
          <ul className="space-y-1.5">
            {actions.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-subtle hover:bg-overlay/[0.03]">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", a.priority === "high" ? "bg-brand/20 text-brand-cyan" : "bg-overlay/[0.04] text-fg-muted")}>
                    <a.icon className="size-4" aria-hidden />
                  </span>
                  <span className="flex-1 text-sm text-fg-secondary group-hover:text-fg">{a.label}</span>
                  {a.priority === "high" && a.count > 0 && <span className="sr-only">High priority</span>}
                  <span className={cn("min-w-8 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums", a.priority === "high" && a.count > 0 ? "bg-brand text-white" : "bg-overlay/[0.06] text-fg-secondary")}>{a.count}</span>
                  <ArrowRight className="size-4 text-fg-disabled transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      {/* Pipeline preview */}
      <GlassCard className="mt-4 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold">Recruitment Pipeline</h3>
            <p className="mt-0.5 text-xs text-fg-muted">Current candidates in each active stage</p>
          </div>
          <Button variant="secondary" size="sm" asChild><Link href="/admin/pipeline">View Full Pipeline<ArrowRight /></Link></Button>
        </div>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {pipe.map((p, i) => (
            <li key={p.id} className="relative rounded-xl border border-subtle bg-overlay/[0.02] p-3.5">
              <p className="text-[11px] font-medium text-fg-muted">{String(i + 1).padStart(2, "0")}</p>
              <p className="mt-1 truncate text-[13px] font-medium text-fg-secondary">{p.label}</p>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums">{p.count}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-overlay/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-cyan" style={{ width: `${Math.min(100, (p.count / Math.max(...pipe.map((x) => x.count), 1)) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      </GlassCard>

      {/* Recent candidates */}
      <GlassCard className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <div>
            <h3 className="text-[15px] font-semibold">Recent Candidates</h3>
            <p className="mt-0.5 text-xs text-fg-muted">Most recently updated records</p>
          </div>
          <Button variant="ghost" size="sm" asChild><Link href="/admin/candidates">View all<ArrowRight /></Link></Button>
        </div>
        {/* Desktop table */}
        <div className="relative hidden overflow-x-auto md:block">
          <table className="data-table w-full">
            <thead>
              <tr><th>Candidate</th><th>Candidate ID</th><th>Position</th><th>Applied</th><th>Interview Status</th><th>Review Status</th><th className="text-right">Action</th></tr>
            </thead>
            <tbody>
              {recent.map((c) => {
                const iv = ivOf(c.interviewId);
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/admin/candidates/${c.id}`)}>
                    <td><span className="flex items-center gap-3"><CandidateAvatar name={c.name} size="sm" /><span className="font-medium text-fg">{c.name}</span></span></td>
                    <td className="font-mono text-xs">{c.id}</td>
                    <td><Pill>{roleShort(c)}</Pill></td>
                    <td>{formatDate(c.appliedAt)}</td>
                    <td>{iv ? <InterviewStatusBadge status={iv.status} review={iv.reviewStatus} /> : <span className="text-fg-disabled">Not invited</span>}</td>
                    <td><RecruitmentStatusBadge status={c.status} /></td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" asChild><Link href={`/admin/candidates/${c.id}`}>View Profile</Link></Button>
                        {iv && iv.status !== "not_started" && <Button size="sm" variant="ghost" asChild><Link href={`/admin/interviews/${iv.id}`}>View Interview</Link></Button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile list */}
        <ul className="divide-y divide-[rgba(148,163,184,0.12)] md:hidden">
          {recent.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/candidates/${c.id}`} className="flex items-center gap-3 px-5 py-3.5">
                <CandidateAvatar name={c.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-fg-muted">{roleShort(c)} · {statusLabel(c.status)}</span>
                </span>
                <span className="text-[11px] text-fg-disabled">{timeAgo(c.lastUpdated)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </GlassCard>

      <ConfirmationDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="All demo changes — status updates, remarks, and the candidate-side interview — will be restored to the original fictional dataset."
        confirmLabel="Reset Demo Data"
        onConfirm={() => { resetDemo(); toast.success("Demo data reset."); }}
      />
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function OverviewPage() {
  return isApiMode ? <ApiDashboard /> : <DemoOverviewPage />;
}
