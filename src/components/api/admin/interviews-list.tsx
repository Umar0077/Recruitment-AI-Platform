"use client";
/** API mode: interview sessions with server-side tabs, search, role/date filters and pagination. */
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Hourglass, PlayCircle, Video, VideoOff } from "lucide-react";
import { CandidateAvatar, GlassCard, Pill, SearchInput, SkeletonTable } from "@/components/ui/primitives";
import { Select, Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState, PageHeader } from "@/components/ui/states";
import { MetricCard } from "@/components/admin/widgets";
import { ApiErrorPanel } from "@/components/api/query-state";
import { ApiInterviewBadge, ApiReviewBadge, Pager, useDebounced } from "./common";
import { useInterviews, useJobRoles, useOverview } from "@/lib/data/queries";
import type { InterviewQuery } from "@/lib/api/endpoints";
import { formatDateTime } from "@/lib/utils";

const TABS = [
  { id: "all", label: "All Interviews" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
  { id: "review", label: "Review Required" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const TAB_QUERY: Record<TabId, Partial<InterviewQuery>> = {
  all: {},
  pending: { status: "PENDING" },
  in_progress: { status: "IN_PROGRESS" },
  completed: { status: "SUBMITTED" },
  review: { reviewOpen: true },
};

export function ApiInterviewsList() {
  const router = useRouter();
  const params = useSearchParams();
  const initialTab = (params.get("tab") as TabId) ?? "all";
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? initialTab : "all");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [range, setRange] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const term = useDebounced(search.trim());
  const roles = useJobRoles();
  const overview = useOverview();
  const from = useMemo(() => (range === "all" ? undefined : new Date(Date.now() - Number(range) * 86400000).toISOString()), [range]);
  const list = useInterviews({ ...TAB_QUERY[tab], page, limit, search: term || undefined, jobRoleId: role === "all" ? undefined : role, from, sortBy: "createdAt", sortDir: "desc" });
  const by = overview.data?.interviews.byStatus;
  const rows = list.data?.items ?? [];

  return (
    <div>
      <PageHeader title="AI Interviews" description="Track interview sessions and review confirmed answers." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Total Interviews" value={overview.data ? overview.data.interviews.issued : "—"} icon={Video} />
        <MetricCard label="Pending" value={by ? by.PENDING : "—"} icon={Hourglass} hint="Invited, not started" />
        <MetricCard label="In Progress" value={by ? by.IN_PROGRESS + by.INTERRUPTED : "—"} icon={PlayCircle} hint="Started or paused" />
        <MetricCard label="Completed" value={by ? by.SUBMITTED : "—"} icon={CheckCircle2} hint="Submitted" />
        <MetricCard label="Awaiting Review" value={overview.data ? overview.data.reviews.pending : "—"} icon={ClipboardCheck} hint="Open HR reviews" />
      </div>

      <GlassCard className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-3 px-4 pt-2 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as TabId); setPage(1); }}>
            <TabsList className="border-b-0">
              {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
          <div className="grid gap-2 pb-2 sm:grid-cols-3 xl:w-[640px] xl:pb-0">
            <SearchInput placeholder="Search candidate…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search interviews" />
            <Select label="Role" value={role} onValueChange={(v) => { setRole(v); setPage(1); }} options={[{ value: "all", label: "All roles" }, ...(roles.data ?? []).map((r) => ({ value: r.id, label: r.title }))]} />
            <Select label="Issued" value={range} onValueChange={(v) => { setRange(v); setPage(1); }} options={[{ value: "all", label: "Any date" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
          </div>
        </div>
        <div className="border-t border-subtle" />
        {list.isError ? (
          <ApiErrorPanel error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <SkeletonTable rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<VideoOff />} title={tab === "review" ? "No pending reviews" : tab === "completed" ? "No completed interviews" : "No interviews available"} description={tab === "review" ? "Every submitted interview has been reviewed. New submissions will appear here." : "No interviews match this view."} />
        ) : (
          <>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="data-table w-full">
                <thead>
                  <tr><th>Candidate</th><th>Role</th><th>Version</th><th>Started</th><th>Submitted</th><th>Answers</th><th>Status</th><th>Review</th></tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const viewable = i.status !== "PENDING";
                    return (
                      <tr key={i.id} className={viewable ? "cursor-pointer" : undefined} onClick={() => viewable && router.push(`/admin/interviews/${i.id}`)}>
                        <td><span className="flex items-center gap-3"><CandidateAvatar name={i.candidate.fullName} size="sm" /><span className="max-w-[220px] truncate font-medium text-fg">{i.candidate.fullName}</span></span></td>
                        <td><Pill>{i.jobRole.title}</Pill></td>
                        <td className="font-mono text-xs">{i.questionSetVersion.versionCode}</td>
                        <td className="whitespace-nowrap">{formatDateTime(i.startedAt ?? undefined)}</td>
                        <td className="whitespace-nowrap">{formatDateTime(i.submittedAt ?? undefined)}</td>
                        <td className="tabular-nums">{i._count.answers} / {i._count.questions}</td>
                        <td><ApiInterviewBadge status={i.status} /></td>
                        <td>{i.review ? <ApiReviewBadge status={i.review.status} /> : <span className="text-xs text-fg-muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[rgba(148,163,184,0.12)] md:hidden">
              {rows.map((i) => (
                <li key={i.id}>
                  <button type="button" disabled={i.status === "PENDING"} onClick={() => router.push(`/admin/interviews/${i.id}`)} className="block w-full px-4 py-4 text-left disabled:opacity-80">
                    <span className="flex items-center gap-3">
                      <CandidateAvatar name={i.candidate.fullName} size="md" />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{i.candidate.fullName}</span><span className="block truncate text-xs text-fg-muted">{i.jobRole.title} · {i._count.answers}/{i._count.questions} answers</span></span>
                    </span>
                    <span className="mt-3 flex flex-wrap gap-2"><ApiInterviewBadge status={i.status} />{i.review && <ApiReviewBadge status={i.review.status} />}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Pager meta={list.data?.meta} page={page} setPage={setPage} limit={limit} setLimit={setLimit} fetching={list.isFetching} />
          </>
        )}
      </GlassCard>
    </div>
  );
}
