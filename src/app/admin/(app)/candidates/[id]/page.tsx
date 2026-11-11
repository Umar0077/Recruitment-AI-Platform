"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiCandidateProfile } from "@/components/api/admin/candidate-profile";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarPlus, ClipboardCheck, Clock, FileText, History, Mail, MapPin, MessageSquarePlus, NotebookPen, Phone, RefreshCw, Sparkles, UserRound, UserX, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, Field, GlassCard, CardHeader, SkeletonPage } from "@/components/ui/primitives";
import { QUESTION_SET_META, QUESTION_SETS } from "@/lib/demo/questions";
import { Notice, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState, InterviewStatusBadge, RecruitmentStatusBadge } from "@/components/ui/states";
import { AddRemarkDialog, ChangeStatusDialog, ScheduleInterviewDialog } from "@/components/admin/candidate-actions";
import { ScoreBar, Timeline } from "@/components/admin/widgets";
import { useAssessment, useCandidate, useInterview, useRecruiter, roleTitle } from "@/lib/demo/selectors";
import { useDemoStore } from "@/lib/demo/store";
import { formatDate, formatDateTime, formatMinutes, daysBetween, timeAgo } from "@/lib/utils";
import type { Candidate, ExperiencedProfile, FresherProfile } from "@/types";

function DemoCandidateProfilePage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <Profile />
    </Suspense>
  );
}

function Profile() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const candidate = useCandidate(id);
  const interview = useInterview(candidate?.interviewId);
  const assessment = useAssessment(candidate?.interviewId);
  const recruiter = useRecruiter(candidate?.recruiterId);
  const team = useDemoStore((s) => s.team);
  const [tab, setTab] = useState(params.get("tab") ?? "overview");
  const [statusOpen, setStatusOpen] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  if (!candidate) {
    return <EmptyState icon={<UserX />} title="Candidate not found" description={`No candidate with ID ${id} exists in the demo dataset.`} action={<Button asChild><Link href="/admin/candidates">Back to Candidates</Link></Button>} />;
  }
  const completed = interview?.status === "completed";

  return (
    <div>
      {/* Header */}
      <GlassCard className="relative overflow-hidden p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-5">
            <CandidateAvatar name={candidate.name} size="xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold sm:text-[28px]">{candidate.name}</h1>
                <RecruitmentStatusBadge status={candidate.status} />
                {candidate.followUp && <Badge tone="warning">Follow-up</Badge>}
              </div>
              <p className="mt-1.5 text-sm text-fg-secondary">{roleTitle(candidate)} · <span className="font-mono text-xs text-fg-muted">{candidate.id}</span></p>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-fg-muted">
                <li className="flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden />{candidate.email}</li>
                <li className="flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden />{candidate.phone}</li>
                <li className="flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden />{candidate.location}</li>
                <li className="flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden />Applied {formatDate(candidate.appliedAt)}</li>
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!interview || interview.status === "not_started"} onClick={() => interview && router.push(`/admin/interviews/${interview.id}`)}><Video />View Interview</Button>
            <Button variant="secondary" disabled={!completed} onClick={() => interview && router.push(`/admin/assessments/${interview.id}`)}><ClipboardCheck />View Assessment</Button>
            <Button variant="secondary" onClick={() => setRemarkOpen(true)}><MessageSquarePlus />Add HR Remark</Button>
            <Button variant="secondary" onClick={() => setScheduleOpen(true)}><CalendarPlus />Schedule HR Interview</Button>
            <Button onClick={() => setStatusOpen(true)}><RefreshCw />Update Status</Button>
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
          <TabsTrigger value="notes"><NotebookPen />HR Notes{candidate.remarks.length > 0 && <span className="rounded-full bg-overlay/10 px-1.5 text-[11px]">{candidate.remarks.length}</span>}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-3">
              <GlassCard className="p-5"><p className="text-xs text-fg-muted">Current stage</p><div className="mt-2"><RecruitmentStatusBadge status={candidate.status} /></div><p className="mt-3 text-xs text-fg-muted">For {daysBetween(candidate.stageEnteredAt)} days</p></GlassCard>
              <GlassCard className="p-5"><p className="text-xs text-fg-muted">AI interview</p><div className="mt-2">{interview ? <InterviewStatusBadge status={interview.status} review={interview.reviewStatus} /> : <Badge>Not invited</Badge>}</div><p className="mt-3 text-xs text-fg-muted">{interview?.completedAt ? `Submitted ${timeAgo(interview.completedAt)}` : interview?.invitedAt ? `Invited ${timeAgo(interview.invitedAt)}` : "Awaiting invitation"}</p></GlassCard>
              <GlassCard className="p-5"><p className="text-xs text-fg-muted">Illustrative AI summary</p><p className="mt-2 font-display text-2xl font-bold">{assessment ? `${assessment.overall.toFixed(1)}` : "—"}<span className="text-sm font-medium text-fg-muted"> / 5</span></p><p className="mt-1 text-xs text-fg-muted">{assessment ? "Decision support only" : "Available after interview"}</p></GlassCard>
              <GlassCard className="p-5 sm:col-span-3">
                <CardHeader title="Summary" description="Key facts from the application" />
                <dl className="mt-5 grid gap-5 sm:grid-cols-3">
                  <Field label="Interview track" value={QUESTION_SET_META[candidate.track].title} />
                  <Field label="Assigned recruiter" value={recruiter?.name ?? "—"} />
                  <Field label="Location" value={candidate.location} />
                  {candidate.profile.kind === "experienced" ? (
                    <>
                      <Field label="FE experience" value={`${candidate.profile.yearsExperience} years`} />
                      <Field label="Availability" value={candidate.profile.availability} />
                      <Field label="Shift" value={candidate.profile.shiftWillingness} />
                    </>
                  ) : (
                    <>
                      <Field label="Education" value={candidate.profile.education} />
                      <Field label="Spoken English (self-rated 1–10)" value={candidate.profile.englishProficiency} />
                      <Field label="Shift" value={candidate.profile.shiftAvailability} />
                    </>
                  )}
                </dl>
              </GlassCard>
            </div>
            <GlassCard className="p-5">
              <CardHeader title="Recent activity" action={<Button variant="ghost" size="sm" onClick={() => setTab("history")}>All<ArrowRight /></Button>} />
              <Timeline className="mt-5" events={candidate.events.slice(-4)} />
            </GlassCard>
          </div>
        </TabsContent>

        <TabsContent value="application" className="mt-6">
          <ApplicationDetails candidate={candidate} />
        </TabsContent>

        <TabsContent value="interview" className="mt-6">
          {!interview ? (
            <GlassCard><EmptyState icon={<Video />} title="No interview yet" description="This candidate hasn't been invited to an AI interview." /></GlassCard>
          ) : (
            <GlassCard className="p-6">
              <CardHeader title={`Interview ${interview.id}`} description="AI-assisted interview session" action={<InterviewStatusBadge status={interview.status} review={interview.reviewStatus} />} />
              <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Invited" value={formatDateTime(interview.invitedAt)} />
                <Field label="Started" value={formatDateTime(interview.startedAt)} />
                <Field label="Completed" value={formatDateTime(interview.completedAt)} />
                <Field label="Duration" value={formatMinutes(interview.durationSec)} />
                <Field label="Questions answered" value={`${interview.answeredCount} of ${QUESTION_SETS[candidate.track].length}`} />
                <Field label="Question set" value={`${interview.questionSetId ?? QUESTION_SET_META[candidate.track].id} · ${QUESTION_SET_META[candidate.track].title}`} />
                <Field label="Reviewer" value={team.find((t) => t.id === interview.reviewerId)?.name ?? "Not reviewed"} />
                <Field label="Window closes" value={formatDate(interview.expiresAt)} />
              </dl>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button disabled={interview.status === "not_started"} onClick={() => router.push(`/admin/interviews/${interview.id}`)}><Video />Open Interview Review</Button>
                {interview.status === "not_started" && <p className="self-center text-sm text-fg-muted">The candidate hasn&apos;t started yet. A recording will be available after submission.</p>}
              </div>
            </GlassCard>
          )}
        </TabsContent>

        <TabsContent value="assessment" className="mt-6">
          {!assessment ? (
            <GlassCard><EmptyState icon={<ClipboardCheck />} title="No assessment available" description="An AI assessment is generated only after the interview is completed." /></GlassCard>
          ) : (
            <GlassCard className="p-6">
              <CardHeader title="AI Assessment Summary" description="Illustrative demo assessment · decision support only" action={<Button size="sm" asChild><Link href={`/admin/assessments/${interview!.id}`}>Open full report<ArrowRight /></Link></Button>} />
              <p className="mt-5 max-w-3xl text-sm leading-relaxed text-fg-secondary">{assessment.summary}</p>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {assessment.criteria.map((c) => <ScoreBar key={c.id} label={c.label} score={c.score} />)}
              </div>
            </GlassCard>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <GlassCard className="p-6">
            <CardHeader title="Recruitment History" description="Chronological record of every stage and action" />
            <Timeline className="mt-6" events={candidate.events} />
          </GlassCard>
        </TabsContent>

        <TabsContent value="notes" className="mt-6">
          <GlassCard className="p-6">
            <CardHeader title="HR Notes" description="Internal remarks — never visible to candidates" action={<Button size="sm" onClick={() => setRemarkOpen(true)}><MessageSquarePlus />Add Remark</Button>} />
            {candidate.remarks.length === 0 ? (
              <EmptyState icon={<NotebookPen />} title="No remarks yet" description="Add the first internal note for this candidate." />
            ) : (
              <ul className="mt-6 space-y-3">
                {candidate.remarks.map((r) => {
                  const author = team.find((t) => t.id === r.authorId);
                  return (
                    <li key={r.id} className="rounded-xl border border-subtle bg-overlay/[0.02] p-4">
                      <div className="flex items-center gap-2.5">
                        <CandidateAvatar name={author?.name ?? "HR"} size="sm" />
                        <span className="text-sm font-medium">{author?.name}</span>
                        <span className="text-xs text-fg-muted">{formatDateTime(r.at)}</span>
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-fg-secondary">{r.text}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>
        </TabsContent>
      </Tabs>

      <ChangeStatusDialog candidate={candidate} open={statusOpen} onOpenChange={setStatusOpen} />
      <AddRemarkDialog candidate={candidate} open={remarkOpen} onOpenChange={setRemarkOpen} />
      <ScheduleInterviewDialog candidate={candidate} open={scheduleOpen} onOpenChange={setScheduleOpen} />
    </div>
  );
}

function ApplicationDetails({ candidate }: { candidate: Candidate }) {
  const p = candidate.profile;
  const contact = (
    <>
      <Field label="Full name" value={candidate.name} />
      <Field label="Email" value={candidate.email} />
      <Field label="Phone" value={candidate.phone} />
      <Field label="Current location" value={candidate.location} />
    </>
  );
  if (p.kind === "experienced") {
    const e = p as ExperiencedProfile;
    return (
      <div className="space-y-4">
        <Notice tone="warning" title="Self-reported information">Experience and performance figures below were provided by the candidate and have not been verified.</Notice>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard className="p-6"><CardHeader title="Contact details" /><dl className="mt-5 grid gap-5 sm:grid-cols-2">{contact}</dl></GlassCard>
          <GlassCard className="p-6"><CardHeader title="Availability" /><dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Availability to join" value={e.availability} />
            <Field label="Commute to I-9/3 Islamabad" value={e.commute} />
            <Field label="Shift willingness" value={e.shiftWillingness} />
          </dl></GlassCard>
          <GlassCard className="p-6 lg:col-span-2"><CardHeader title="FE closing experience" description="Experienced FE Closer application" /><dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="FE closing experience" value={e.feExperience} />
            <Field label="Years of experience" value={`${e.yearsExperience} years`} />
            <Field label="Previous companies" value={e.previousCompanies.join(", ")} />
            <Field label="Previous campaigns" value={e.previousCampaigns.join(", ")} />
            <Field label="Average monthly closing" value={e.avgMonthlyClosing} />
            <Field label="CPA count" value={e.cpaCount} />
            <Field label="Last drawn salary" value={e.lastDrawnSalary} />
            <Field label="Expected salary" value={e.expectedSalary} />
          </dl></GlassCard>
        </div>
      </div>
    );
  }
  const f = p as FresherProfile;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard className="p-6"><CardHeader title="Contact details" /><dl className="mt-5 grid gap-5 sm:grid-cols-2">{contact}</dl></GlassCard>
      <GlassCard className="p-6"><CardHeader title="Availability" /><dl className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label="Commute to I-9/3 Islamabad" value={f.commute} />
        <Field label="Shift availability" value={f.shiftAvailability} />
      </dl></GlassCard>
      <GlassCard className="p-6 lg:col-span-2"><CardHeader title="Background" description="Track B · Customer Sales Representative (Fresher) application" /><dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Education" value={f.education} />
        <Field label="Previous work experience" value={f.previousWork} />
        <Field label="Sales-related experience" value={f.salesExperience} />
        <Field label="Customer-service experience" value={f.customerServiceExperience} />
        <Field label="Communication-related experience" value={f.communicationExperience} />
        <Field label="Spoken English (self-rated 1–10)" value={f.englishProficiency} />
        <Field label="Motivation for a sales career" value={f.motivation} className="sm:col-span-2 lg:col-span-3" />
      </dl></GlassCard>
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function CandidateProfilePage() {
  return isApiMode ? <Suspense fallback={<SkeletonPage />}><ApiCandidateProfile /></Suspense> : <DemoCandidateProfilePage />;
}
