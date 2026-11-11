"use client";
import { SkeletonPage } from "@/components/ui/primitives";
import { isApiMode } from "@/lib/config/environment";
import { ApiInterviewsList } from "@/components/api/admin/interviews-list";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Hourglass, MoreHorizontal, PlayCircle, UserRound, Video, VideoOff, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidateAvatar, GlassCard, Pill, SearchInput, SkeletonTable } from "@/components/ui/primitives";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState, InterviewStatusBadge, PageHeader } from "@/components/ui/states";
import { MetricCard } from "@/components/admin/widgets";
import { useDemoStore } from "@/lib/demo/store";
import { roleShort } from "@/lib/demo/selectors";
import { formatDateTime, formatMinutes } from "@/lib/utils";
import type { InterviewSession } from "@/types";

const TABS = [
  { id: "all", label: "All Interviews" },
  { id: "pending", label: "Pending" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
  { id: "review", label: "Review Required" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const matches = (i: InterviewSession, t: TabId) =>
  t === "all" ? true : t === "pending" ? i.status === "not_started" : t === "in_progress" ? i.status === "in_progress" : t === "completed" ? i.status === "completed" : i.reviewStatus === "awaiting_review" || i.reviewStatus === "follow_up";

function DemoInterviewsPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <Interviews />
    </Suspense>
  );
}

function Interviews() {
  const router = useRouter();
  const params = useSearchParams();
  const interviews = useDemoStore((s) => s.interviews);
  const candidates = useDemoStore((s) => s.candidates);
  const [tab, setTab] = useState<TabId>((params.get("tab") as TabId) ?? "all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const per = 12;
  const cById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, interviews.filter((i) => matches(i, t.id)).length])) as Record<TabId, number>, [interviews]);
  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return interviews
      .filter((i) => matches(i, tab))
      .filter((i) => !term || i.id.toLowerCase().includes(term) || cById.get(i.candidateId)?.name.toLowerCase().includes(term))
      .sort((a, b) => (b.completedAt ?? b.startedAt ?? b.invitedAt ?? "").localeCompare(a.completedAt ?? a.startedAt ?? a.invitedAt ?? ""));
  }, [interviews, tab, q, cById]);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const shown = rows.slice(page * per, page * per + per);

  return (
    <div>
      <PageHeader title="AI Interviews" description="Track interview sessions, review recordings and transcripts, and open AI assessments." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Total Interviews" value={counts.all} icon={Video} />
        <MetricCard label="Pending" value={counts.pending} icon={Hourglass} hint="Invited, not started" />
        <MetricCard label="In Progress" value={counts.in_progress} icon={PlayCircle} hint="Started, not submitted" />
        <MetricCard label="Completed" value={counts.completed} icon={CheckCircle2} />
        <MetricCard label="Awaiting Review" value={counts.review} icon={ClipboardCheck} hint="Needs a recruiter" />
      </div>

      <GlassCard className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-3 px-4 pt-2 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as TabId); setPage(0); }}>
            <TabsList className="border-b-0">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>{t.label}<span className="rounded-full bg-overlay/[0.08] px-1.5 text-[11px] tabular-nums">{counts[t.id]}</span></TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <SearchInput className="pb-2 lg:w-72 lg:pb-0" placeholder="Search candidate or interview ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} aria-label="Search interviews" />
        </div>
        <div className="border-t border-subtle" />
        {shown.length === 0 ? (
          <EmptyState icon={<VideoOff />} title={tab === "review" ? "No pending reviews" : "No interviews available"} description={tab === "review" ? "Every completed interview has been reviewed. New submissions will appear here." : "No interviews match this view."} />
        ) : (
          <>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="data-table w-full">
                <thead>
                  <tr><th>Candidate</th><th>Role</th><th>Interview ID</th><th>Started</th><th>Completed</th><th>Duration</th><th>Status</th><th>Report</th><th className="w-12"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {shown.map((i) => {
                    const c = cById.get(i.candidateId)!;
                    const viewable = i.status !== "not_started";
                    return (
                      <tr key={i.id} className={viewable ? "cursor-pointer" : undefined} onClick={() => viewable && router.push(`/admin/interviews/${i.id}`)}>
                        <td><span className="flex items-center gap-3"><CandidateAvatar name={c.name} size="sm" /><span className="font-medium text-fg">{c.name}</span></span></td>
                        <td><Pill>{roleShort(c)}</Pill></td>
                        <td className="font-mono text-xs">{i.id}</td>
                        <td>{formatDateTime(i.startedAt)}</td>
                        <td>{formatDateTime(i.completedAt)}</td>
                        <td className="tabular-nums">{formatMinutes(i.durationSec)}</td>
                        <td><InterviewStatusBadge status={i.status} review={i.reviewStatus} /></td>
                        <td>{i.status === "completed" ? <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"><FileText className="size-3.5" aria-hidden />Available</span> : <span className="text-xs text-fg-disabled">Not yet</span>}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${i.id}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem disabled={!viewable} onSelect={() => router.push(`/admin/interviews/${i.id}`)}><Video />View session</DropdownMenuItem>
                              <DropdownMenuItem disabled={!viewable} onSelect={() => router.push(`/admin/interviews/${i.id}#transcript`)}><FileText />Review transcript</DropdownMenuItem>
                              <DropdownMenuItem disabled={i.status !== "completed"} onSelect={() => router.push(`/admin/assessments/${i.id}`)}><ClipboardCheck />View assessment</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => router.push(`/admin/candidates/${c.id}`)}><UserRound />Open candidate profile</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[rgba(148,163,184,0.12)] md:hidden">
              {shown.map((i) => {
                const c = cById.get(i.candidateId)!;
                return (
                  <li key={i.id}>
                    <Link href={i.status === "not_started" ? `/admin/candidates/${c.id}` : `/admin/interviews/${i.id}`} className="flex items-center gap-3 px-4 py-3.5">
                      <CandidateAvatar name={c.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-fg-muted"><Clock3 className="size-3" aria-hidden />{i.id} · {formatMinutes(i.durationSec)}</span>
                      </span>
                      <InterviewStatusBadge status={i.status} review={i.reviewStatus} />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-subtle px-4 py-3 text-xs text-fg-muted">
              <span>{rows.length} interviews · page {page + 1} of {pages}</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="icon-sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
                <Button variant="secondary" size="icon-sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
              </div>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function InterviewsPage() {
  return isApiMode ? <Suspense fallback={<SkeletonPage />}><ApiInterviewsList /></Suspense> : <DemoInterviewsPage />;
}
