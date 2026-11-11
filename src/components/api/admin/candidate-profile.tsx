"use client";
/** API mode: one application (= candidate recruitment record) from PostgreSQL, with timeline, remarks and actions. */
import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ClipboardCheck, Clock, FileText, History, Mail, MapPin, MessageSquarePlus, NotebookPen, Phone, RefreshCw, Sparkles, UserRound, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, CardHeader, Field, GlassCard, SkeletonPage } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState } from "@/components/ui/states";
import { Timeline } from "@/components/admin/widgets";
import { ApiErrorPanel } from "@/components/api/query-state";
import { ApiInterviewBadge, ApiRecruitmentBadge, ApiRemarkDialog, ApiReviewBadge, ApiStatusDialog, recruitmentLabel } from "./common";
import { useApplication, useAssessments, useInviteInterview, useTimeline } from "@/lib/data/queries";
import { toast } from "sonner";
import { errorText } from "@/components/api/query-state";
import { Send } from "lucide-react";
import { ASSESSMENT_STATUS, TRACK_LABEL } from "@/lib/api/labels";
import type { TimelineEvent } from "@/lib/api/types";
import type { RecruitmentEvent } from "@/types";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";

const EVENT_TYPE: Record<TimelineEvent["type"], RecruitmentEvent["type"]> = {
  APPLICATION_RECEIVED: "application",
  STATUS_CHANGED: "stage",
  INTERVIEW_INVITED: "invite",
  INTERVIEW_STARTED: "interview_started",
  INTERVIEW_SUBMITTED: "interview_submitted",
  HR_REMARK_ADDED: "remark",
  HR_REVIEW_UPDATED: "review",
};

export function toTimeline(events: TimelineEvent[]): RecruitmentEvent[] {
  return events.map((e) => ({
    id: e.id,
    type: e.toStatus === "NOT_SELECTED" || e.toStatus === "CANDIDATE_WITHDRAWN" ? "closed" : EVENT_TYPE[e.type],
    label:
      e.type === "STATUS_CHANGED" && e.toStatus ? (e.toStatus === "SHORTLISTED" ? "Shortlisted by HR" : `Status: ${recruitmentLabel(e.toStatus)}`)
        : e.type === "APPLICATION_RECEIVED" ? "Application received"
        : e.type === "INTERVIEW_INVITED" ? "AI interview issued"
        : e.type === "INTERVIEW_STARTED" ? "AI interview started"
        : e.type === "INTERVIEW_SUBMITTED" ? "AI interview submitted"
        : e.type === "HR_REMARK_ADDED" ? "HR remark added"
        : `HR review: ${e.note?.replace(/_/g, " ").toLowerCase() ?? "updated"}`,
    at: e.createdAt,
    actor: e.actor ? e.actor.displayName ?? e.actor.email ?? "User" : "System",
    detail: e.type === "STATUS_CHANGED" || e.type === "INTERVIEW_INVITED" ? e.note ?? undefined : undefined,
  }));
}

const humanKey = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase());
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function ApiCandidateProfile() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const app = useApplication(id);
  const timeline = useTimeline(id);
  const latest = app.data?.interviews[0];
  const assessments = useAssessments(latest && latest.status === "SUBMITTED" ? latest.id : undefined);
  const [tab, setTab] = useState(params.get("tab") ?? "overview");
  const [statusOpen, setStatusOpen] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const invite = useInviteInterview(id);

  if (app.isPending) return <SkeletonPage />;
  if (app.isError) return <ApiErrorPanel error={app.error} onRetry={() => void app.refetch()} />;
  const a = app.data;
  const c = a.candidate;
  const review = a.reviews.find((r) => r.interviewSessionId === latest?.id);
  const report = assessments.data?.reports[0];
  const remarks = timeline.data?.remarks ?? [];
  const details = Object.entries(a.details ?? {});
  const availability = Object.entries(a.availability ?? {});

  return (
    <div>
      <GlassCard className="relative overflow-hidden p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <CandidateAvatar name={c.fullName} size="xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="break-words text-2xl font-bold sm:text-[28px]">{c.fullName}</h1>
                <ApiRecruitmentBadge status={a.status} />
                {c.isSample && <Badge tone="neutral" dot={false}>Sample record</Badge>}
              </div>
              <p className="mt-1.5 text-sm text-fg-secondary">{a.jobRole.title} · {TRACK_LABEL[a.jobRole.track]}</p>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-fg-muted">
                <li className="flex min-w-0 items-center gap-1.5"><Mail className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{c.email ?? "—"}</span></li>
                <li className="flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden />{c.phone ?? "—"}</li>
                <li className="flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden />{c.location ?? "—"}</li>
                <li className="flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden />Applied {formatDate(a.submittedAt)}</li>
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(a.status === "APPLICATION_RECEIVED" || a.status === "AI_INTERVIEW_PENDING") && (!latest || ["EXPIRED", "CANCELLED"].includes(latest.status)) ? (
              <Button
                variant="secondary"
                loading={invite.isPending}
                onClick={() => invite.mutate(undefined, { onSuccess: (d) => toast.success("AI interview issued.", { description: `${d.questionSetVersion} · complete by ${formatDateTime(d.expiresAt)}` }), onError: (e) => toast.error("Couldn't issue the interview.", { description: errorText(e) }) })}
              >
                {!invite.isPending && <Send />}Issue AI Interview
              </Button>
            ) : (
              <Button variant="secondary" disabled={!latest || latest.status === "PENDING"} onClick={() => latest && router.push(`/admin/interviews/${latest.id}`)}><Video />View Interview</Button>
            )}
            <Button variant="secondary" disabled={!report} onClick={() => report && router.push(`/admin/assessments/${latest!.id}`)}><ClipboardCheck />View Assessment</Button>
            <Button variant="secondary" onClick={() => setRemarkOpen(true)}><MessageSquarePlus />Add HR Remark</Button>
            <Button onClick={() => setStatusOpen(true)} disabled={a.allowedTransitions.length === 0}><RefreshCw />Update Status</Button>
          </div>
        </div>
      </GlassCard>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList aria-label="Candidate sections">
          <TabsTrigger value="overview"><UserRound />Overview</TabsTrigger>
          <TabsTrigger value="application"><FileText />Application Details</TabsTrigger>
          <TabsTrigger value="interview"><Video />AI Interview</TabsTrigger>
          <TabsTrigger value="assessment"><Sparkles />AI Assessment</TabsTrigger>
          <TabsTrigger value="history"><History />Recruitment History</TabsTrigger>
          <TabsTrigger value="notes"><NotebookPen />HR Notes{remarks.length > 0 && <span className="rounded-full bg-overlay/10 px-1.5 text-[11px]">{remarks.length}</span>}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <GlassCard className="p-6 lg:col-span-2">
              <CardHeader title="Summary" />
              <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label="Recruitment stage" value={<ApiRecruitmentBadge status={a.status} />} />
                <Field label="Stage since" value={`${formatDateTime(a.statusChangedAt)} (${timeAgo(a.statusChangedAt)})`} />
                <Field label="Interview track" value={TRACK_LABEL[a.jobRole.track]} />
                <Field label="Assigned recruiter" value={a.assignedRecruiter?.displayName ?? "—"} />
                <Field label="Application source" value={humanKey(a.source.toLowerCase())} />
                <Field label="AI interview" value={latest ? <ApiInterviewBadge status={latest.status} /> : "Not invited"} />
              </dl>
            </GlassCard>
            <GlassCard className="p-6">
              <CardHeader title="Latest activity" />
              {timeline.isError ? <ApiErrorPanel compact error={timeline.error} onRetry={() => void timeline.refetch()} className="mt-4" /> : <Timeline className="mt-5" events={toTimeline((timeline.data?.events ?? []).slice(-4))} />}
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="application" className="mt-6">
          <GlassCard className="p-6">
            <CardHeader title="Application answers" description="As submitted by the candidate." />
            {details.length + availability.length === 0 ? (
              <p className="mt-5 text-sm text-fg-muted">No additional application details were provided.</p>
            ) : (
              <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                {[...details, ...availability].map(([k, v]) => <Field key={k} label={humanKey(k)} value={show(v)} />)}
              </dl>
            )}
          </GlassCard>
        </TabsContent>

        <TabsContent value="interview" className="mt-6">
          <GlassCard className="p-6">
            <CardHeader title="AI interview" action={latest && latest.status !== "PENDING" ? <Button size="sm" variant="secondary" asChild><Link href={`/admin/interviews/${latest.id}`}><Video />Open review</Link></Button> : undefined} />
            {!latest ? (
              <p className="mt-5 text-sm text-fg-muted">No AI interview has been issued for this application.</p>
            ) : (
              <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Status" value={<ApiInterviewBadge status={latest.status} />} />
                <Field label="Review" value={review ? <ApiReviewBadge status={review.status} /> : "—"} />
                <Field label="Invited" value={formatDateTime(latest.invitedAt)} />
                <Field label="Started" value={formatDateTime(latest.startedAt ?? undefined)} />
                <Field label="Submitted" value={formatDateTime(latest.submittedAt ?? undefined)} />
                <Field label="Window closes" value={formatDateTime(latest.expiresAt)} />
              </dl>
            )}
          </GlassCard>
        </TabsContent>

        <TabsContent value="assessment" className="mt-6">
          <GlassCard className="p-6">
            <CardHeader title="AI assessment" />
            {(() => {
              const s = ASSESSMENT_STATUS[report?.status ?? "NOT_AVAILABLE"];
              return (
                <div className="mt-5 flex flex-col gap-2">
                  <Badge tone={s.tone}>{s.label}</Badge>
                  <p className="text-sm text-fg-muted">{report ? s.body : "No assessment exists for this application yet."}</p>
                </div>
              );
            })()}
          </GlassCard>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <GlassCard className="p-6">
            <CardHeader title="Recruitment history" description="Every status change, interview milestone and remark, as recorded." />
            {timeline.isPending ? <div className="skeleton mt-5 h-40 rounded-xl" /> : timeline.isError ? <ApiErrorPanel compact error={timeline.error} onRetry={() => void timeline.refetch()} className="mt-5" /> : <Timeline className="mt-5" events={toTimeline(timeline.data.events)} />}
          </GlassCard>
        </TabsContent>

        <TabsContent value="notes" className="mt-6">
          <GlassCard className="p-6">
            <CardHeader title="HR notes" description="Internal remarks. Never shown to the candidate." action={<Button size="sm" onClick={() => setRemarkOpen(true)}><MessageSquarePlus />Add Remark</Button>} />
            {timeline.isError ? (
              <ApiErrorPanel compact error={timeline.error} onRetry={() => void timeline.refetch()} className="mt-5" />
            ) : remarks.length === 0 ? (
              <EmptyState className="py-10" icon={<NotebookPen />} title="No HR remarks yet" description="Remarks you add are saved to this application and visible to the recruitment team." />
            ) : (
              <ul className="mt-5 space-y-3">
                {[...remarks].reverse().map((r) => (
                  <li key={r.id} className="rounded-xl border border-subtle bg-overlay/[0.02] p-4">
                    <p className="whitespace-pre-wrap break-words text-sm text-fg">{r.body}</p>
                    <p className="mt-2 text-xs text-fg-muted">{r.author.displayName ?? r.author.email ?? "Staff member"} · {formatDateTime(r.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </TabsContent>
      </Tabs>

      <ApiStatusDialog applicationId={a.id} name={c.fullName} current={a.status} allowed={a.allowedTransitions} open={statusOpen} onOpenChange={setStatusOpen} />
      <ApiRemarkDialog applicationId={a.id} open={remarkOpen} onOpenChange={setRemarkOpen} />
    </div>
  );
}

export function NotFoundRecord({ what, back }: { what: string; back: string }) {
  return <EmptyState icon={<UserRound />} title={`${what} not found`} description="It doesn't exist or you don't have access to it." action={<Button asChild><Link href={back}>Go back</Link></Button>} />;
}
