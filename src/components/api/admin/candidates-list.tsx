"use client";
/** API mode: candidate/application list with server-side search, filters, sorting and pagination. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, FilterX, SlidersHorizontal, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, GlassCard, SearchInput, SkeletonTable } from "@/components/ui/primitives";
import { Drawer, Select } from "@/components/ui/overlays";
import { EmptyState, PageHeader } from "@/components/ui/states";
import { ApiErrorPanel } from "@/components/api/query-state";
import { ApiInterviewBadge, ApiRecruitmentBadge, Pager, useDebounced } from "./common";
import { useApplications, useJobRoles } from "@/lib/data/queries";
import { INTERVIEW_STATUS, TRACK_LABEL } from "@/lib/api/labels";
import type { InterviewStatus, RecruitmentStatus } from "@/lib/api/types";
import { RECRUITMENT_STATUSES } from "@/lib/demo/statuses";
import { fromUiStatus } from "@/lib/api/labels";
import { cn, formatDate, timeAgo } from "@/lib/utils";

const DATE_OPTS = [
  { value: "all", label: "Any date" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];
type SortKey = "submittedAt" | "statusChangedAt";

export function ApiCandidatesList() {
  const router = useRouter();
  const params = useSearchParams();
  const roles = useJobRoles();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [stage, setStage] = useState(() => {
    const s = params.get("stage");
    return s && RECRUITMENT_STATUSES.some((x) => x.id === s) ? fromUiStatus(s as never) : "all";
  });
  const [ivStatus, setIvStatus] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("statusChangedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const term = useDebounced(search.trim());

  const from = useMemo(() => (dateRange === "all" ? undefined : new Date(Date.now() - Number(dateRange) * 86400000).toISOString()), [dateRange]);
  const q = {
    page,
    limit,
    search: term || undefined,
    jobRoleId: role === "all" ? undefined : role,
    status: stage === "all" ? undefined : (stage as RecruitmentStatus),
    interviewStatus: ivStatus === "all" ? undefined : (ivStatus as InterviewStatus),
    from,
    sortBy,
    sortDir,
  };
  const list = useApplications(q);
  const rows = list.data?.items ?? [];
  const activeFilters = [role !== "all", stage !== "all", ivStatus !== "all", dateRange !== "all", !!term].filter(Boolean).length;
  const reset = (fn: () => void) => { fn(); setPage(1); };
  const clear = () => reset(() => { setRole("all"); setStage("all"); setIvStatus("all"); setDateRange("all"); setSearch(""); });
  const sortHeader = (key: SortKey, label: string) => (
    <button
      className="inline-flex items-center gap-1.5 hover:text-fg"
      onClick={() => reset(() => { if (sortBy === key) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortBy(key); setSortDir("desc"); } })}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sortBy === key && (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );

  const filterControls = (
    <>
      <Select label="Applied role" value={role} onValueChange={(v) => reset(() => setRole(v))} options={[{ value: "all", label: "All roles" }, ...(roles.data ?? []).map((r) => ({ value: r.id, label: r.title }))]} />
      <Select label="Interview status" value={ivStatus} onValueChange={(v) => reset(() => setIvStatus(v))} options={[{ value: "all", label: "Any interview status" }, ...Object.entries(INTERVIEW_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
      <Select label="Recruitment stage" value={stage} onValueChange={(v) => reset(() => setStage(v))} options={[{ value: "all", label: "All stages" }, ...RECRUITMENT_STATUSES.map((s) => ({ value: fromUiStatus(s.id), label: s.label }))]} />
      <Select label="Application date" value={dateRange} onValueChange={(v) => reset(() => setDateRange(v))} options={DATE_OPTS} />
    </>
  );

  return (
    <div>
      <PageHeader title="Candidates" description="Review and manage applicants throughout their recruitment journey." />
      <GlassCard className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-subtle p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput className="min-w-0 flex-1 sm:max-w-sm" placeholder="Search name or email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} aria-label="Search candidates" />
            <Button variant="secondary" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal />Filters{activeFilters > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] text-white">{activeFilters}</span>}
            </Button>
            <div className="hidden flex-1 grid-cols-4 gap-2 lg:grid">{filterControls}</div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <span aria-live="polite">{list.data ? `${list.data.meta.total ?? 0} matching applications` : "Loading…"}</span>
            {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={clear}><FilterX />Clear filters ({activeFilters})</Button>}
          </div>
        </div>

        {list.isError ? (
          <ApiErrorPanel error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isPending ? (
          <SkeletonTable rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<UsersRound />} title="No candidates found" description={activeFilters ? "No applications match your search and filters." : "No applications have been received yet."} action={activeFilters ? <Button variant="secondary" onClick={clear}><FilterX />Clear filters</Button> : undefined} />
        ) : (
          <>
            <div className={cn("relative hidden max-h-[calc(100dvh-340px)] min-h-[420px] overflow-auto md:block", list.isFetching && "opacity-80")}>
              <table className="data-table w-full">
                <thead className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur">
                  <tr>
                    <th>Candidate</th>
                    <th>Applied role</th>
                    <th>{sortHeader("submittedAt", "Applied")}</th>
                    <th>Interview</th>
                    <th>Recruitment stage</th>
                    <th>{sortHeader("statusChangedAt", "Last updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const iv = a.interviews[0];
                    return (
                      <tr key={a.id} className="cursor-pointer" onClick={() => router.push(`/admin/candidates/${a.id}`)}>
                        <td>
                          <span className="flex items-center gap-3">
                            <CandidateAvatar name={a.candidate.fullName} size="sm" />
                            <span className="min-w-0">
                              <Link href={`/admin/candidates/${a.id}`} onClick={(e) => e.stopPropagation()} className="block max-w-[260px] truncate font-medium hover:text-brand-cyan">{a.candidate.fullName}</Link>
                              <span className="block max-w-[260px] truncate text-xs text-fg-muted">{a.candidate.email ?? "—"}</span>
                            </span>
                            {a.candidate.isSample && <Badge tone="neutral" dot={false}>Sample</Badge>}
                          </span>
                        </td>
                        <td><span className="block">{a.jobRole.title}</span><span className="text-xs text-fg-muted">{TRACK_LABEL[a.jobRole.track]}</span></td>
                        <td className="whitespace-nowrap">{formatDate(a.submittedAt)}</td>
                        <td>{iv ? <ApiInterviewBadge status={iv.status} /> : <span className="text-xs text-fg-muted">Not invited</span>}</td>
                        <td><ApiRecruitmentBadge status={a.status} /></td>
                        <td className="whitespace-nowrap text-fg-muted">{timeAgo(a.statusChangedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[rgba(148,163,184,0.12)] md:hidden">
              {rows.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/candidates/${a.id}`} className="block px-4 py-4">
                    <span className="flex items-center gap-3">
                      <CandidateAvatar name={a.candidate.fullName} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{a.candidate.fullName}</span>
                        <span className="block truncate text-xs text-fg-muted">{a.jobRole.title}</span>
                      </span>
                      <Eye className="size-4 text-fg-disabled" aria-hidden />
                    </span>
                    <span className="mt-3 flex flex-wrap items-center gap-2">
                      <ApiRecruitmentBadge status={a.status} />
                      <span className="text-xs text-fg-muted">Updated {timeAgo(a.statusChangedAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pager meta={list.data?.meta} page={page} setPage={setPage} limit={limit} setLimit={setLimit} fetching={list.isFetching} />
          </>
        )}
      </GlassCard>
      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" description="Narrow the candidate list">
        <div className="space-y-3 p-5">
          {filterControls}
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Button variant="secondary" onClick={clear}>Clear</Button>
            <Button onClick={() => setFiltersOpen(false)}>Show results</Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
