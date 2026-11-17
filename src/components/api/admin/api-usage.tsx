"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Activity, AlertTriangle, ArrowDownUp, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Coins, Gauge, LockKeyhole, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, CardHeader, GlassCard, Input, Label, SkeletonPage } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { EmptyState, PageHeader } from "@/components/ui/states";
import { MetricCard } from "@/components/admin/widgets";
import { ApiErrorPanel } from "@/components/api/query-state";
import { isApiMode } from "@/lib/config/environment";
import { useApiUsage } from "@/lib/data/api-usage";
import { DEMO_PROVIDER_USAGE, DEMO_USAGE_AS_OF, demoUsageHistory, demoUsageOverview } from "@/lib/demo/api-usage";
import { knownTokenTotal, resetCountdown, USAGE_RANGE_LABELS, usageLatency, usageNumber, usageUsd, usageUtc, validateUsageDates } from "@/lib/data/usage-format";
import type { ProviderUsage, UsageHistoryQuery, UsageOverview, UsageRange, UsageRequest } from "@/lib/api/api-usage";
import type { Page } from "@/lib/api/types";

const UsageCharts = dynamic(() => import("./usage-charts"), { ssr: false, loading: () => <div className="skeleton h-80 rounded-xl" aria-label="Loading usage charts" /> });
type Filters = { from: string; to: string; model: string; feature: string; status: "all" | "success" | "failed" | "pending" };
const EMPTY_FILTERS: Filters = { from: "", to: "", model: "all", feature: "all", status: "all" };
const statusTone = { success: "success", failed: "danger", pending: "warning" } as const;
const statusLabel = { success: "Successful", failed: "Failed", pending: "Pending" };

function Field({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <div className="min-w-0"><dt className="text-xs text-fg-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-fg">{value}</dd>{note && <p className="mt-1 text-xs leading-relaxed text-fg-muted">{note}</p>}</div>;
}

/** Only mounted for a provider-confirmed timestamp; its clock does not rerender the dashboard. */
function ProviderReset({ at }: { at: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <span>{usageUtc(at)}{now !== null && <span className="mt-1 block font-normal tabular-nums text-fg-muted">{resetCountdown(at, now)}</span>}</span>;
}

export function ProviderDetails({ data, modelId, demo }: { data?: ProviderUsage; modelId?: string; demo: boolean }) {
  const quota = data?.freeQuota;
  const exactReset = quota?.resetSource === "provider" && quota.resetAt && Number.isFinite(Date.parse(quota.resetAt)) ? quota.resetAt : null;
  const errorLabels = { KEY_UNAVAILABLE: "Key usage could not be retrieved.", CREDITS_UNAVAILABLE: "Account credits could not be retrieved with this key.", MODEL_METADATA_UNAVAILABLE: "Model metadata could not be retrieved." };
  return <div className="grid gap-5 xl:grid-cols-2">
    <GlassCard className="min-w-0 p-5 sm:p-6"><CardHeader title="Provider allowance & credits" icon={<Coins />} description={demo ? "Provider information is unavailable in the fictional preview." : "Provider metadata is cached for five minutes."} />
      <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Remaining free-model requests" value={usageNumber(quota?.remaining)} note={quota?.source === "estimate" ? "Estimate from recorded requests, not an authoritative provider balance." : quota?.source === "provider" ? "Reported by the provider." : "An exact provider request balance is unavailable."} />
        <Field label="Daily free-model request limit" value={usageNumber(quota?.limit)} />
        <Field label="Request quota reset" value={exactReset ? <ProviderReset at={exactReset} /> : "Reset time unavailable"} />
        <Field label="Account credit balance" value={usageUsd(data?.credits.remainingUsd)} note="Account credits are separate from free-model request quotas." />
        <Field label="Purchased credits" value={usageUsd(data?.credits.totalCreditsUsd)} />
        <Field label="Account credits used" value={usageUsd(data?.credits.totalUsageUsd)} />
        <Field label="API key credit limit" value={usageUsd(data?.key.limitUsd)} note={data?.key.limitUsd == null ? "No numeric key limit was reported." : undefined} />
        <Field label="API key credits remaining" value={usageUsd(data?.key.remainingUsd)} />
        <Field label="API key usage today" value={usageUsd(data?.key.dailyUsageUsd)} />
        <Field label="API key usage this month" value={usageUsd(data?.key.monthlyUsageUsd)} />
        <Field label="Key budget reset period" value={data?.key.limitReset ?? "Unavailable"} note="A credit-limit period does not establish a free-request reset time." />
        <Field label="Effective spend budget reset time" value={data?.key.budgetResetAt ? usageUtc(data.key.budgetResetAt) : "Reset time unavailable"} note="This can belong to a broader workspace or guardrail budget, independently of the API key's reset period." />
        <Field label="Key expiration" value={usageUtc(data?.key.expiresAt)} note="Expiration is not a quota reset." />
        <Field label="Metadata checked" value={usageUtc(data?.checkedAt)} />
      </dl>
      {quota?.message && <p className="mt-5 rounded-lg border border-subtle bg-overlay/[0.025] p-3 text-xs leading-relaxed text-fg-muted">{quota.message}</p>}
      {!!data?.errors.length && <ul className="mt-3 space-y-1 text-xs text-amber-800 dark:text-amber-200">{data.errors.map(error => <li key={error}>{errorLabels[error]}</li>)}</ul>}
    </GlassCard>
    <GlassCard className="min-w-0 p-5 sm:p-6"><CardHeader title="Configured model" icon={<Zap />} description="Availability and pricing come from provider metadata." />
      <p className="mt-5 break-words font-mono text-sm font-medium text-fg">{modelId ?? data?.model.id ?? "Unavailable"}</p>
      {data?.model.name && <p className="mt-1 text-sm text-fg-muted">{data.model.name}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><Badge tone={data?.model.availability === "available" ? "success" : data?.model.availability === "unavailable" ? "danger" : "neutral"}>{data?.model.availability === "available" ? "Listed by provider" : data?.model.availability === "unavailable" ? "Not listed by provider" : "Availability unknown"}</Badge><Badge tone="blue">{data?.model.pricingCategory === "free" ? "Zero listed price" : data?.model.pricingCategory === "paid" ? "Paid model" : "Pricing unavailable"}</Badge></div>
      <dl className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2"><Field label="Provider" value="OpenRouter" /><Field label="Context window" value={data?.model.contextWindow == null ? "Unavailable" : `${usageNumber(data.model.contextWindow)} tokens`} /><Field label="Input / million tokens" value={usageUsd(data?.model.inputCostPerMillion)} /><Field label="Output / million tokens" value={usageUsd(data?.model.outputCostPerMillion)} /><Field label="Per-request price" value={usageUsd(data?.model.requestCostUsd)} /><Field label="Metadata connection" value={demo ? "Demo — not contacted" : data?.status === "available" ? "Available" : data?.status === "partial" ? "Partially available" : data?.status === "unconfigured" ? "Not configured" : data ? "Unavailable" : "Loading…"} /></dl>
      <p className="mt-6 text-xs leading-relaxed text-fg-muted">A model listing does not guarantee a request will succeed. Provider capacity, account limits and privacy policy still apply. A model name alone does not establish that requests are free.</p>
    </GlassCard>
  </div>;
}

function Overview({ data, provider, range, demo }: { data: UsageOverview; provider?: ProviderUsage; range: UsageRange; demo: boolean }) {
  const selected = data.selected;
  const successRate = selected.requests ? `${Math.round(selected.succeeded / selected.requests * 100)}%` : "—";
  return <>
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <MetricCard label="Requests today" value={usageNumber(data.today.requests)} icon={Activity} hint="UTC calendar day" />
      <MetricCard label="Requests this month" value={usageNumber(data.month.requests)} icon={CalendarDays} hint="Current UTC calendar month" />
      <MetricCard label="Known tokens" value={usageNumber(knownTokenTotal(selected))} icon={ArrowDownUp} hint={`${USAGE_RANGE_LABELS[range]} · ${selected.tokenCoverageRequests}/${selected.requests} token breakdowns`} />
      <MetricCard label="Reported API cost" value={usageUsd(selected.costUsd)} icon={Coins} hint={`${selected.costCoverageRequests}/${selected.requests} requests have cost data`} />
      <MetricCard label={provider?.freeQuota.source === "estimate" ? "Estimated requests remaining" : "Provider requests remaining"} value={usageNumber(provider?.freeQuota.remaining)} icon={Gauge} hint={provider?.freeQuota.source === "provider" ? "Provider-reported free-model quota" : provider?.freeQuota.source === "estimate" ? "Estimate; other key activity may be missing" : "Provider quota unavailable"} />
      <MetricCard label="Average response time" value={usageLatency(selected.averageLatencyMs)} icon={Clock3} hint={USAGE_RANGE_LABELS[range]} />
      <MetricCard label="Successful requests" value={successRate} icon={CheckCircle2} hint={`${selected.succeeded} successful · ${selected.failed} failed · ${selected.pending} pending`} />
      <MetricCard label="Rate-limited requests" value={usageNumber(selected.rateLimited)} icon={AlertTriangle} hint={`${selected.retries} retry attempts in this period`} />
    </div>
    <GlassCard className="mt-5 grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-4"><Field label="Recent API health" value={<Badge tone={data.health.status === "healthy" ? "success" : data.health.status === "degraded" ? "warning" : "neutral"}>{data.health.status === "healthy" ? "Healthy" : data.health.status === "degraded" ? "Recent errors" : "Unknown"}</Badge>} note={`${data.health.requestsLast24h} requests / ${data.health.failuresLast24h} failures in the last 24 hours. Historical results, not a live probe.`} /><Field label="Last successful request" value={usageUtc(data.health.lastSuccessAt)} /><Field label={demo ? "Fictional application daily budget" : "Application daily protection budget"} value={`${usageNumber(data.budget.remainingToday)} / ${usageNumber(data.budget.dailyLimit)} remaining`} note={`Local limit, separate from provider quota. ${data.budget.resetAt ? `Resets ${usageUtc(data.budget.resetAt)}.` : "Reset time unavailable."}`} /><Field label="Candidate data policy" value={<span className="flex items-start gap-1.5"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-cyan" />{data.candidateDataAllowed ? "Sharing permitted by configuration" : "External sharing blocked"}</span>} note="This page contains request metadata only, never prompts or transcripts." /></GlassCard>
    <p className="my-4 text-xs leading-relaxed text-fg-muted">{USAGE_RANGE_LABELS[range]}: {usageNumber(selected.inputTokens)} input tokens · {usageNumber(selected.outputTokens)} output tokens. Missing measurements are unavailable, not zero-cost requests. Each provider attempt, including a retry, is counted once.</p>
    <UsageCharts overview={data} />
  </>;
}

function RequestHistory({ data, fetching, error, retry, query, setPage, setLimit }: { data?: Page<UsageRequest>; fetching: boolean; error: unknown; retry: () => void; query: UsageHistoryQuery; setPage: (page: number) => void; setLimit: (limit: number) => void }) {
  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);
  return <GlassCard className="overflow-hidden" aria-busy={fetching}>
    {error ? <ApiErrorPanel error={error} onRetry={retry} /> : !data ? <div className="space-y-3 p-5"><div className="skeleton h-8 rounded" /><div className="skeleton h-52 rounded" /></div> : data.items.length === 0 ? <EmptyState icon={<Activity />} title="No matching requests" description="Try a different period or clear the history filters." /> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><caption className="sr-only">API request history. All timestamps are UTC. No candidate content is included.</caption><thead className="border-b border-subtle bg-overlay/[0.025] text-fg-muted"><tr>{["Timestamp (UTC)", "Provider / model", "Feature", "Status", "Input tokens", "Output tokens", "Reported cost", "Response time", "Error category"].map(label => <th scope="col" key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-[rgba(148,163,184,0.12)]">{data.items.map(row => <tr key={row.id} className="hover:bg-overlay/[0.025]"><td className="whitespace-nowrap px-4 py-3 tabular-nums">{usageUtc(row.createdAt).replace(" UTC", "")}<span className="mt-1 block text-fg-muted">Attempt {row.attempt}</span></td><td className="max-w-64 px-4 py-3"><span className="block text-fg-muted">{row.provider}</span><span className="mt-1 block break-words font-mono">{row.model}</span></td><td className="px-4 py-3">{row.feature.replace(/_/g, " ")}</td><td className="px-4 py-3"><Badge tone={statusTone[row.status]}>{statusLabel[row.status]}</Badge></td><td className="px-4 py-3 tabular-nums">{usageNumber(row.inputTokens)}</td><td className="px-4 py-3 tabular-nums">{usageNumber(row.outputTokens)}</td><td className="px-4 py-3 tabular-nums">{usageUsd(row.costUsd)}</td><td className="px-4 py-3 tabular-nums">{usageLatency(row.latencyMs)}</td><td className="px-4 py-3"><span className="break-words">{row.errorCode ?? "—"}</span>{row.httpStatus && row.httpStatus >= 400 && <span className="mt-1 block text-fg-muted">HTTP {row.httpStatus}</span>}</td></tr>)}</tbody></table></div>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle px-4 py-3 text-xs text-fg-muted"><span aria-live="polite">Page {query.page} of {totalPages} · {data?.meta.total ?? 0} requests{fetching ? " · Updating…" : ""}</span><div className="flex items-center gap-2"><Select label="Requests per page" value={String(query.limit)} onValueChange={value => setLimit(Number(value))} options={[20, 50, 100].map(limit => ({ value: String(limit), label: `${limit} / page` }))} size="sm" className="w-28" /><Button variant="secondary" size="icon-sm" aria-label="Previous request page" disabled={query.page <= 1 || fetching} onClick={() => setPage(query.page - 1)}><ChevronLeft /></Button><Button variant="secondary" size="icon-sm" aria-label="Next request page" disabled={query.page >= totalPages || fetching} onClick={() => setPage(query.page + 1)}><ChevronRight /></Button></div></div>
  </GlassCard>;
}

export function ApiUsageDashboard() {
  const [range, setRange] = useState<UsageRange>("7d");
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS), [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1), [limit, setLimit] = useState(20), [filterError, setFilterError] = useState<string | null>(null);
  const historyQuery: UsageHistoryQuery = { range, page, limit, from: filters.from || undefined, to: filters.to || undefined, model: filters.model === "all" ? undefined : filters.model, feature: filters.feature === "all" ? undefined : filters.feature, status: filters.status === "all" ? undefined : filters.status };
  const queries = useApiUsage(range, historyQuery);
  const overview = isApiMode ? queries.overview.data : demoUsageOverview(range);
  const provider = isApiMode ? queries.provider.data : DEMO_PROVIDER_USAGE;
  const history = isApiMode ? queries.requests.data : demoUsageHistory(historyQuery);
  const fetching = isApiMode && (queries.overview.isFetching || queries.provider.isFetching || queries.requests.isFetching);
  const reload = () => { void queries.overview.refetch(); void queries.provider.refetch(); void queries.requests.refetch(); };
  if (isApiMode && queries.restoring) return <SkeletonPage />;
  if (isApiMode && !queries.allowed) return <EmptyState icon={<LockKeyhole />} title="API Usage access restricted" description="An authorized administrator is required to view provider usage and account limits." />;
  const applyFilters = (event: React.FormEvent) => { event.preventDefault(); const error = validateUsageDates(draft.from, draft.to); setFilterError(error); if (!error) { setFilters(draft); setPage(1); } };
  return <div className="space-y-6">
    <PageHeader title="API Usage" description="OpenRouter request activity, model availability and provider limits. All reporting times are UTC." eyebrow={!isApiMode ? <Badge tone="indigo">Fictional demo data · no provider calls</Badge> : undefined} actions={<><Select label="Usage period" value={range} onValueChange={value => { setRange(value as UsageRange); setPage(1); }} options={Object.entries(USAGE_RANGE_LABELS).map(([value, label]) => ({ value, label }))} className="w-44" />{isApiMode && <Button variant="secondary" loading={fetching} disabled={fetching} onClick={reload}><RefreshCw />Refresh</Button>}</>} />
    {!isApiMode && <p className="rounded-xl border border-indigo-400/25 bg-indigo-400/[0.06] p-4 text-sm text-fg-secondary">These are fictional request samples as of {usageUtc(DEMO_USAGE_AS_OF)}. They do not represent your configured model, provider account, credits or real requests.</p>}
    {isApiMode && queries.overview.isError ? <ApiErrorPanel error={queries.overview.error} onRetry={() => void queries.overview.refetch()} /> : overview ? <Overview data={overview} provider={provider} range={range} demo={!isApiMode} /> : <SkeletonPage />}
    {isApiMode && queries.provider.isError && <ApiErrorPanel compact error={queries.provider.error} onRetry={() => void queries.provider.refetch()} />}
    <ProviderDetails data={provider} modelId={overview?.model} demo={!isApiMode} />
    <section aria-labelledby="request-history-title" className="space-y-4"><div><h2 id="request-history-title" className="text-lg font-semibold">Request history</h2><p className="mt-1 text-sm text-fg-muted">Filter individual attempts. History filters do not change the overview cards.</p></div>
      <form onSubmit={applyFilters} className="rounded-xl border border-subtle bg-overlay/[0.02] p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div><Label htmlFor="usage-from">From date (UTC)</Label><Input id="usage-from" type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></div><div><Label htmlFor="usage-to">To date (UTC, inclusive)</Label><Input id="usage-to" type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></div><div><Label>Model</Label><Select label="History model" value={draft.model} onValueChange={model => setDraft({ ...draft, model })} options={[{ value: "all", label: "All models" }, ...(overview?.models ?? []).map(model => ({ value: model, label: model }))]} /></div><div><Label>Feature</Label><Select label="History feature" value={draft.feature} onValueChange={feature => setDraft({ ...draft, feature })} options={[{ value: "all", label: "All features" }, ...(overview?.features ?? []).map(feature => ({ value: feature, label: feature.replace(/_/g, " ") }))]} /></div><div><Label>Status</Label><Select label="History status" value={draft.status} onValueChange={status => setDraft({ ...draft, status: status as Filters["status"] })} options={[{ value: "all", label: "All statuses" }, { value: "success", label: "Successful" }, { value: "failed", label: "Failed" }, { value: "pending", label: "Pending" }]} /></div></div>
        {filterError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-200">{filterError}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="submit" size="sm">Apply filters</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(1); setFilterError(null); }}>Clear filters</Button><p className="text-xs text-fg-muted">{filters.from && filters.to ? `${filters.from} – ${filters.to} UTC` : USAGE_RANGE_LABELS[range]} · {filters.from ? "Custom history dates" : "Selected period"}</p></div>
      </form>
      <RequestHistory data={history} fetching={isApiMode && queries.requests.isFetching} error={isApiMode ? queries.requests.error : null} retry={() => void queries.requests.refetch()} query={historyQuery} setPage={setPage} setLimit={value => { setLimit(value); setPage(1); }} />
    </section>
  </div>;
}
