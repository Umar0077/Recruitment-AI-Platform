import Link from "@/components/navigation/link";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, Trophy, Users } from "lucide-react";
import { MetricCard } from "./widgets";
import { GlassCard } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/states";

export function DashboardView({ values, pending, activity, demo = false, loading = false, showMetrics = true }: {
  values: [number | string, number | string, number | string, number | string];
  pending: ReactNode; activity: ReactNode; demo?: boolean; loading?: boolean; showMetrics?: boolean;
}) {
  return <div className="space-y-6">
    <PageHeader title="HR Dashboard" description={demo ? "Fictional demo data · your recruitment workspace preview." : "Your recruitment priorities, in one place."} />
    {showMetrics && <section aria-label="Key HR metrics" aria-busy={loading} className="grid gap-3 min-[390px]:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Total Candidates", icon: Users, href: "/admin/candidates" },
        { label: "Interviews Completed", icon: CheckCircle2, href: "/admin/interviews?tab=completed" },
        { label: "Awaiting HR Review", icon: ClipboardCheck, href: "/admin/interviews?tab=review" },
        { label: "Selected Candidates", icon: Trophy, href: "/admin/pipeline", hint: "Selected through joined · unique candidates" },
      ].map((item, index) => <MetricCard key={item.label} {...item} loading={loading} value={values[index]} />)}
    </section>}
    <section aria-labelledby="quick-actions-title"><h2 id="quick-actions-title" className="mb-3 text-lg font-semibold">Quick Actions</h2><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {[["View Candidates", "/admin/candidates"], ["Review Interviews", "/admin/interviews?tab=review"], ["Manage Recruitment Pipeline", "/admin/pipeline"], ["View Reports", "/admin/analytics" ]].filter(([,href]) => showMetrics || href !== "/admin/analytics").map(([label, href]) => <Link key={href} href={href} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-subtle bg-panel px-4 py-3 text-sm font-medium transition-colors hover:border-brand/40 hover:bg-brand/5">{label}<ArrowRight className="size-4 shrink-0" aria-hidden /></Link>)}
    </div></section>
    <GlassCard className="min-w-0 p-4 sm:p-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Pending Interview Reviews</h2><Link className="text-sm text-brand-cyan underline-offset-4 hover:underline" href="/admin/interviews?tab=review">View all reviews</Link></div>{pending}</GlassCard>
    <GlassCard className="p-4 sm:p-6"><h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>{activity}</GlassCard>
  </div>;
}

export function PendingReviews({ rows }: { rows: { id: string; name: string; role: string; date: string; status: ReactNode }[] }) {
  if (!rows.length) return <p className="py-5 text-sm text-fg-muted">No interviews awaiting review. New submissions will appear here.</p>;
  return <table className="w-full table-fixed text-left text-sm"><caption className="sr-only">Five most recent interviews awaiting HR review</caption><thead className="border-b border-subtle text-fg-muted"><tr><th scope="col" className="pb-3 pr-3 font-medium">Candidate</th><th scope="col" className="hidden pb-3 pr-3 font-medium md:table-cell">Applied role</th><th scope="col" className="hidden pb-3 pr-3 font-medium lg:table-cell">Interview date</th><th scope="col" className="hidden pb-3 pr-3 font-medium sm:table-cell">Status</th><th scope="col" className="w-20 pb-3 text-right font-medium">Action</th></tr></thead><tbody className="divide-y divide-subtle">
    {rows.map(row => <tr key={row.id}><td className="break-words py-4 pr-3 align-top"><span className="font-medium">{row.name}</span><span className="mt-1 block text-fg-muted md:hidden">{row.role}</span><span className="mt-1 block text-xs text-fg-muted lg:hidden">{row.date}</span><span className="mt-2 block sm:hidden">{row.status}</span></td><td className="hidden break-words py-4 pr-3 align-top md:table-cell">{row.role}</td><td className="hidden py-4 pr-3 align-top lg:table-cell">{row.date}</td><td className="hidden py-4 pr-3 align-top sm:table-cell">{row.status}</td><td className="py-3 text-right align-top"><Link href={`/admin/interviews/${row.id}`} aria-label={`Review interview for ${row.name}`} className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-brand-cyan hover:bg-brand/10">Review</Link></td></tr>)}
  </tbody></table>;
}
