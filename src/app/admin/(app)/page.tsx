"use client";
import Link from "next/link";
import { isApiMode } from "@/lib/config/environment";
import { ApiDashboard } from "@/components/api/admin/dashboard";
import { DashboardView, PendingReviews } from "@/components/admin/dashboard-view";
import { useDemoStore } from "@/lib/demo/store";
import { computeMetrics, roleTitle } from "@/lib/demo/selectors";
import { Badge } from "@/components/ui/primitives";
import { formatDate, timeAgo } from "@/lib/utils";
function DemoOverviewPage() {
  const candidates = useDemoStore(s => s.candidates), interviews = useDemoStore(s => s.interviews);
  const m = computeMetrics(candidates, interviews);
  const pending = interviews.filter(i => i.status === "completed" && i.reviewStatus === "awaiting_review").sort((a,b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).slice(0,5);
  const recent = candidates.flatMap(c => c.events.map(e => ({...e, candidate: c}))).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,5);
  return <DashboardView demo values={[m.total, m.interviewsCompleted, m.awaitingReview, m.selected]}
    pending={<PendingReviews rows={pending.flatMap(i => {const c=candidates.find(c=>c.id===i.candidateId);return c ? [{id:i.id,name:c.name,role:roleTitle(c),date:formatDate(i.completedAt),status:<Badge tone="warning">Awaiting HR Review</Badge>}] : [];})} />}
    activity={<ul className="divide-y divide-subtle">{recent.map(e=><li key={`${e.candidate.id}-${e.id}`}><Link href={`/admin/candidates/${e.candidate.id}`} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span><strong className="font-medium">{e.candidate.name}</strong> · {e.label}</span><time className="text-xs text-fg-muted" dateTime={e.at}>{timeAgo(e.at)}</time></Link></li>)}</ul>} />;
}
export default function OverviewPage(){ return isApiMode ? <ApiDashboard /> : <DemoOverviewPage />; }
