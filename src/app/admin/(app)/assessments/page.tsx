"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiAssessmentsList } from "@/components/api/admin/assessments";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { CandidateAvatar, GlassCard, Pill } from "@/components/ui/primitives";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState, PageHeader, ReviewStatusBadge } from "@/components/ui/states";
import { useDemoStore } from "@/lib/demo/store";
import { buildAssessment } from "@/lib/demo/assessments";
import { roleShort } from "@/lib/demo/selectors";
import { formatDate } from "@/lib/utils";

function DemoAssessmentsPage() {
  const interviews = useDemoStore((s) => s.interviews);
  const candidates = useDemoStore((s) => s.candidates);
  const [tab, setTab] = useState("awaiting");
  const reports = useMemo(() => {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    return interviews
      .filter((i) => i.status === "completed")
      .map((i) => ({ i, c: byId.get(i.candidateId)!, r: buildAssessment(byId.get(i.candidateId)!, i)! }))
      .sort((a, b) => (b.i.completedAt ?? "").localeCompare(a.i.completedAt ?? ""));
  }, [interviews, candidates]);
  const shown = reports.filter(({ i }) => (tab === "all" ? true : tab === "awaiting" ? i.reviewStatus !== "reviewed" : i.reviewStatus === "reviewed"));

  return (
    <div>
      <PageHeader title="AI Assessments" description="Illustrative AI assessment reports for completed interviews. Every report requires recruiter review." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="awaiting">Needs review</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          <TabsTrigger value="all">All reports</TabsTrigger>
        </TabsList>
      </Tabs>
      {shown.length === 0 ? (
        <GlassCard className="mt-6"><EmptyState icon={<ClipboardCheck />} title="No pending reviews" description="All assessment reports in this view have been reviewed." /></GlassCard>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map(({ i, c, r }) => (
            <li key={i.id}>
              <Link href={`/admin/assessments/${i.id}`} className="surface group flex h-full flex-col rounded-xl p-5 transition-colors hover:border-glow/50">
                <div className="flex items-center gap-3">
                  <CandidateAvatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-fg-muted">{r.id} · {formatDate(i.completedAt)}</p>
                  </div>
                  <p className="font-display text-xl font-bold tabular-nums">{r.overall.toFixed(1)}<span className="text-xs font-medium text-fg-muted">/5</span></p>
                </div>
                <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{r.summary}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Pill>{roleShort(c)}</Pill>
                  <ReviewStatusBadge review={i.reviewStatus} />
                  <ArrowRight className="ml-auto size-4 text-fg-disabled transition-transform group-hover:translate-x-0.5" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function AssessmentsPage() {
  return isApiMode ? <ApiAssessmentsList /> : <DemoAssessmentsPage />;
}
