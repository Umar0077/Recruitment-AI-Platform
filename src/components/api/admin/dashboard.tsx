"use client";
import { useAuth } from "@/lib/auth/auth-provider";
import Link from "@/components/navigation/link";
import { DashboardView, PendingReviews } from "@/components/admin/dashboard-view";
import { ApiErrorPanel } from "@/components/api/query-state";
import { ApiReviewBadge } from "./common";
import { useInterviews, useDashboardSummary } from "@/lib/data/queries";
import { useNotificationFeed } from "@/lib/data/notification-feed";
import { formatDate, timeAgo } from "@/lib/utils";
export function ApiDashboard() {
  const canReadMetrics = !!useAuth().profile?.permissions.includes("analytics:read");
  const overview = useDashboardSummary(canReadMetrics);
  const pending = useInterviews({ reviewOpen: true, limit: 5, sortBy: "submittedAt", sortDir: "desc" });
  const feed = useNotificationFeed(); const o = overview.data;
  return <>
    {overview.isError && <ApiErrorPanel error={overview.error} onRetry={() => void overview.refetch()} />}
    <DashboardView showMetrics={canReadMetrics} loading={canReadMetrics && overview.isPending} values={[o?.candidates.total ?? "—", o?.interviews.completed ?? "—", o?.reviews.pending ?? "—", o?.candidates.selected ?? "—"]}
      pending={pending.isError ? <ApiErrorPanel compact error={pending.error} onRetry={() => void pending.refetch()} /> : pending.isPending ? <div className="skeleton h-40 rounded-xl" role="status" aria-label="Loading pending reviews" /> : <PendingReviews rows={(pending.data?.items ?? []).map(row => ({ id: row.id, name: row.candidate.fullName, role: row.jobRole.title, date: formatDate(row.submittedAt ?? row.completedAt ?? undefined), status: <ApiReviewBadge status={row.review?.status ?? "PENDING_REVIEW"} /> }))} />}
      activity={feed.error ? <p role="alert" className="text-sm text-fg-muted">Activity could not be loaded. Open Notifications to retry.</p> : feed.loading ? <div className="skeleton h-24 rounded-xl" role="status" aria-label="Loading recent activity" /> : !feed.items.length ? <p className="text-sm text-fg-muted">No recent activity to show.</p> : <ul className="divide-y divide-subtle">{feed.items.slice(0, 5).map(item => <li key={item.id}><Link href={item.href} className="flex flex-wrap justify-between gap-2 rounded-lg py-3 text-sm hover:bg-overlay/[0.03]"><span className="min-w-0 break-words"><span className="font-medium">{item.title}</span><span className="mt-1 block text-fg-muted">{item.body}</span></span><time dateTime={item.at} className="shrink-0 text-xs text-fg-muted">{timeAgo(item.at)}</time></Link></li>)}</ul>} />
  </>;
}
